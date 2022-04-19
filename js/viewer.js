//Crawled Pages
let crawl = { all: { media: [], links: [], assets: [] } }
let baseUrl = 'https://bimmr.com'
let hostURL = 'https://bimmr.com'

//Track whats being crawled
let crawling = []
//Track lastHTML to show what has changed
let lastCounts = { pages: 1, assets: 1, links: 1, files: 1, media: 1 }

//Settings
let settings = {
  crawl: {
    onPageScripts: false,
    onPageStyles: true
  },
  combine: {
    enabled: false,
    onlyLocal: true,
    assets: false,
    images: true,
    imagesInAssets: false
  },
  download: {
    directory: ''
  }
}
let CORS_BYPASS_URL = 'https://api.allorigins.win/get?url='
let CORS_BYPASS_URL_RAW = 'https://api.allorigins.win/raw?url='

//Regex for Chrome Extension
let chromeExtensionRegex = new RegExp(/(chrome-extension:\/\/\w*\/(viewer\.html)?)|(chrome-extension:\/)/g)
//Regex for viewer.html
let viewerRegex = new RegExp(/(viewer.html)/g)
//Regex for background or background-image style
let imageUrlRegex = new RegExp(/background(-image)?\s*:(.*?)(url)\(\s*(\'|")?((?!['"]?data:).*?)(?<image>.*?)\3?(\'|")?\s*\)/g)
//let urlRegex = new RegExp(/background(-image)?\s*:(.*?)(url)\(\s*(\'|")?(?<image>.*?)\3?(\'|")?\s*\)/g) - Ignoring if it contains 'data:'
let httpRegex = new RegExp(/^((http|https):)?\/\//g)
//Regex for a tag link
let aTagRegex = new RegExp(/(<a)(?:(?!<\/a>).)*/g)
//Regex for quotes
let quoteRegex = new RegExp(/["']/g)
//Regex for external stylesheets
let externalStylesheetRegex = new RegExp(/(<link)(?:(?!<\/link>).)*/g)
//Regex for external scripts
let externalScriptRegex = new RegExp(/(<script)(?:(?!<\/script>).)*/g)
//Regex for non word file name
let nonWordRegex = new RegExp(/[^a-z0-9A-Z.]/gi)


//When DOM is loaded set up the listeners and events
document.addEventListener("DOMContentLoaded", function () {

  //Prevent Refreshing the popup as that breaks things
  window.onunload = refreshParent;
  function refreshParent() {
    console.log("Refreshing parent window")
    window.close()
  }

  //Crawl base url
  if (window.tabURL)
    baseUrl = window.tabURL


  let url = new URL(baseUrl)
  hostURL = url.origin
  baseUrl = hostURL + (url.pathname ? url.pathname : '')

  document.querySelector("#crawledSiteText").innerHTML = baseUrl
  crawlURL(baseUrl)

  let link = createLinkObject(baseUrl, createElementFromHTML(`<a href="${baseUrl}"></a>`))
  link.isCrawled = true
  link.tags.isBaseUrl = true
  crawl.all.links.push(link)


  //Sidebar controls
  document.querySelectorAll(".sidebar-item").forEach(item => item.addEventListener("click", event => {
    document.querySelectorAll(".sidebar-item.active, .view.active").forEach(activeItem => activeItem.classList.remove("active"))
    item.classList.add("active")
    item.querySelector(".newContent")?.classList.remove("active")
    let view = item.querySelector("p").innerHTML.toLowerCase()
    document.querySelector(".view#" + view)?.classList.add("active")
  }))

  document.querySelector(".crawlAllBtn").addEventListener("click", event => {
    clickAllCrawlIcons()

    function clickAllCrawlIcons() {
      crawl.all.links.forEach(link => {
        document.querySelectorAll("#pages .crawl i").forEach(pageCrawl => pageCrawl.click())
      })
    }

    let moreToCrawlInterval = setInterval(() => {
      console.log("Checking crawl status")

      if (crawling.length == 0) {
        if (!getPages().some(link => !link.isCrawled)) {
          document.querySelector(".crawlAllBtn").classList.add("hidden")
          console.log("All links crawled")
          console.log("Clearing Interval")
          clearInterval(moreToCrawlInterval)
        }
        else {
          console.log("Crawling more links")
          clickAllCrawlIcons()
        }
      }
    }, 500)
  })


  //Settings Controls
  document.querySelectorAll("#settings.view input").forEach(item => item.addEventListener("change", event => {
    let settingGroup = item.id.split("-")[0]
    let setting = item.id.split("-")[1]

    if (item.type == "checkbox")
      settings[settingGroup][setting] = item.checked
    else if (item.type == "text")
      settings[settingGroup][setting] = item.value

    if (settingGroup == "download") {
      let downloadDirectory = settings.download.directory
      if (downloadDirectory[downloadDirectory.length - 1] != "/")
        downloadDirectory += "/"
      storageSet('downloadDirectory', downloadDirectory)
    }
  }))

  document.querySelector("#settings #combine-enabled").addEventListener("change", event => {
    document.querySelector(".combine-settings").classList.toggle("active")
  })

  document.querySelector("#settings #recrawlBtn").addEventListener("click", event => {
    //Reset
    crawl = { all: { media: [], links: [], assets: [] } }
    lastCounts = { pages: 1, assets: 1, links: 1, files: 1, media: 1 }
    document.querySelector("#crawledSiteCount").innerHTML = ''

    //Recrawl
    crawlURL(baseUrl)
    let link = createLinkObject(baseUrl, createElementFromHTML(`<a href="${baseUrl}"></a>`))
    link.isCrawled = true
    link.tags.isBaseUrl = true
    crawl.all.links.push(link)

  })

  //Popup Controls
  document.querySelector(".popup .popup-close i").addEventListener("click", event => {
    event.target.parentNode.parentNode.parentNode.parentNode.classList.remove("active")
  })
  document.querySelector(".popup .popup-outerWrapper").addEventListener("click", event => {
    if (document.querySelector(".popup .popup-outerWrapper") == event.target)
      document.querySelector(".popup.active").classList.remove("active")
  })
  document.querySelectorAll(".popup .popup-nav-item").forEach(item => item.addEventListener("click", event => {
    document.querySelectorAll(".popup .popup-nav-item.active, .popup .popup-view.active").forEach(activeItem => activeItem.classList.remove("active"))
    item.classList.add("active")
    let view = item.querySelector("p").innerHTML.toLowerCase()
    document.querySelector(".popup .popup-view#popup-view-" + view)?.classList.add("active")
  }))

  //Select All controls
  document.querySelectorAll(".view-title .select input").forEach(item => item.addEventListener("click", event => {
    let view = item.parentNode.parentNode.parentNode
    view.querySelectorAll(".view-items .select input").forEach(item => item.click())
  }))

  //Download all button
  document.querySelectorAll(".downloadSelected").forEach(item => item.addEventListener("click", event => {
    let items = document.querySelectorAll(".view.active .view-items .select input:checked")
    items.forEach(item => item.parentNode.parentNode.querySelector("a.download i")?.click())
  }))

  //Test all button
  document.querySelectorAll(".testSelected").forEach(item => item.addEventListener("click", event => {
    let items = document.querySelectorAll(".view.active .view-items .select input:checked")
    items.forEach(item => item.parentNode.parentNode.querySelector("a.test i")?.click())
  }))

  //Crawl all button
  document.querySelectorAll(".crawlSelected").forEach(item => item.addEventListener("click", event => {
    let items = document.querySelectorAll(".view.active .view-items .select input:checked")
    items.forEach(item => item.parentNode.parentNode.querySelector("a.crawl i")?.click())
    document.querySelector(".view.active .view-title .select input:checked").checked = false
  }))

  //Filter Icons for links
  document.querySelectorAll(".filter-icon").forEach(item => item.addEventListener("click", event => {
    item.classList.toggle("active")
    let view = item.parentNode.parentNode.parentNode.parentNode
    view.querySelector(".searchbar").classList.toggle("active")
    let state = view.querySelector(".searchbar").classList.contains("active")
    if (!state) {
      view.querySelector(".searchbar .form-item input").value = ""
      view.querySelectorAll(".view-items .view-row").forEach(item => item.classList.remove("hidden"))
    }
  }))

  //Filter/Searchbar gets typed in
  document.querySelectorAll(".searchbar .form-item input").forEach(item => item.addEventListener("keyup", delay(function () {
    let view = item.parentNode.parentNode.parentNode
    let search = item.value.toLowerCase()
    view.querySelectorAll(".view-items .view-row").forEach(item => {
      if (item.querySelector("p").innerHTML.toLowerCase().indexOf(search) >= 0)
        item.classList.remove("hidden")
      else
        item.classList.add("hidden")
    })

  }, 500)))


  //Track new items in views and indiciate if new
  let observer = new MutationObserver(function (mutations) {
    mutations.forEach(function (mutation) {
      let view = mutation.target.parentNode.parentNode.id
      if (mutation.target.children.length != lastCounts[view] && mutation.target.children.length > lastCounts[view]) {
        lastCounts[view] = mutation.target.children.length
        let sidebarItem = Array.from(document.querySelectorAll(".sidebar-item p")).find(i => i.innerHTML.toLocaleLowerCase() == view)
        if (!document.querySelector(".view#" + view).classList.contains("active"))
          sidebarItem.parentNode.querySelector(".newContent").classList.add("active")
      }
    })
  })
  //Watch all view items for changes
  document.querySelectorAll(".view .view-items").forEach(item => {
    observer.observe(item, { childList: true })
  })

})

/**
* Function to crawl the URL for images, links, scripts, and stylesheets
* @param {string} url - The url to crawl
* @param {boolean} addToAll - If true add to crawl all
* @returns {promise} - A promise that resolves when the crawl is complete
*/
async function crawlURL(url, addToAll = true) {
  return new Promise(async (resolve, reject) => {

    //Update crawling view with crawling info
    if (crawling.length == 0)
      document.querySelector("#crawlingSiteText").innerHTML = url
    document.querySelector("#crawling").classList.add("active")

    //Remove any old filter and search stuff
    document.querySelectorAll(".filter-icon").forEach(item => item.classList.remove("active"))
    document.querySelectorAll(".searchbar").forEach(item => item.classList.remove("active"))
    document.querySelectorAll(".searchbar .form-item input").forEach(item => item.value = "")
    document.querySelectorAll(".view-items .view-row").forEach(item => item.classList.remove("hidden"))

    crawling.push(url)

    fetch(CORS_BYPASS_URL + encodeURIComponent(url))
      .then(res => {
        if (res.ok) return res.json()
        else throw new Error(res.error)
      })
      .then(data => {
        if (data.status && data.status.http_code != 200) {
          throw new Error(data.status.http_code)
        }

        data = data.contents

        let type = "html"

        //If crawling a CSS page, add style tags to the page
        if (isUrlStyleSheet(url)) {
          data = "<style>" + data + "</style>"
          type = "css"
        }

        //If crawling a JS page, add script tags to the page
        if (isUrlScript(url)) {
          data = "<script>" + data + "</script>"
          type = "js"
        }
        console.log("Crawled: " + url + " (" + type + ")")

        // Get doc from fetched page data
        let doc = (new DOMParser()).parseFromString(data, "text/html")

        //Init lists
        let links = []
        let media = []
        let assets = []

        //Basic a tag - get link and add to crawl all list, but if already found add as an instance
        Array.from(doc.querySelectorAll("a")).filter(
          element => element.getAttribute("href") != null &&
            element.getAttribute("href").indexOf("javascript:void(0);") == -1 &&
            !element.getAttribute("href").startsWith("?")
        ).forEach(element => {
          let link = createLinkObject(url, element)
          let found
          if (!(found = links.find(i => i.href == link.href || i.href == link._href))) {
            links.push(link)
          }
          else
            found.instances.push({
              foundOn: url,
              title: link.instances[0].title,
              tags: { isNewTab: link.instances[0].tags.isNewTab }
            })
        })
        //Basic iframe tag - get link and add to crawl all list, but if already found add as an instance
        doc.querySelectorAll("iframe").forEach(element => {
          let link = createLinkObject(url, element)
          if ((link._href && (link._href.startsWith("?")))) return
          let found
          if (!(found = links.find(i => i.href == link.href || i.href == link._href))) {
            links.push(link)
          }
          else
            found.instances.push({
              foundOn: url,
              title: link.instances[0].title,
              tags: { isNewTab: link.instances[0].tags.isNewTab }
            })
        })

        //Basic img tag - get image and add to crawl all list, but if already found add as an instance
        doc.querySelectorAll("img").forEach(element => {
          let image = createImageObject(url, element)

          let found
          if (isUrlImage(image.src))
            if (!(found = media.find(i => i.src == image.src)))
              media.push(image)
            else
              found.instances.push({
                foundOn: url,
                alt: image.instances[0].alt,
                tags: { isNewTab: image.instances[0].tags.isNewTab }
              })
        })

        //Basic video tag - get video and add to crawl all list, but if already found add as an instance
        doc.querySelectorAll("video").forEach(element => {

          if (element.poster && element.poster.length > 0) {
            let image = createImageObject(url, null, element.poster)
            let foundImage
            if (!(foundImage = media.find(i => i.src == image.src)))
              media.push(image)
            else
              foundImage.instances.push({
                foundOn: url,
                alt: image.instances[0].alt,
                tags: { isNewTab: image.instances[0].tags.isNewTab }
              })
          }

          if (element.querySelector("source")) {
            let video = createImageObject(url, null, element.querySelector("source").src)
            let foundVideo
            if (!(foundVideo = media.find(i => i.src == video.src)))
              media.push(video)
            else
              foundVideo.instances.push({
                foundOn: url,
                alt: video.instances[0].alt,
                tags: { isNewTab: video.instances[0].tags.isNewTab }
              })
          }
        })


        //Basic audio tag - get audio and add to crawl all list, but if already found add as an instance
        doc.querySelectorAll("audio").forEach(element => {
          if (element.querySelector("source")) {
            let audio = createImageObject(url, null, element.querySelector("source").src)
            let foundAudio
            if (!(foundAudio = media.find(i => i.src == audio.src)))
              media.push(audio)
            else
              foundAudio.instances.push({
                foundOn: url,
                alt: audio.instances[0].alt,
                tags: { isNewTab: audio.instances[0].tags.isNewTab }
              })
          }
        })


        //Background Image styles - get image and add to crawl all list, but if already found add as an instance
        doc.querySelectorAll('*[style*="background"]').forEach(element => {
          if (element.style.cssText.match(imageUrlRegex)) {
            let src = imageUrlRegex.exec(element.style.cssText).groups.image.replace(chromeExtensionRegex, '/').replace('viewer.html', '')
            imageUrlRegex.lastIndex = 0;
            let image = createImageObject(url, null, src)
            let found
            if (isUrlImage(image.src))
              if (!(found = media.find(i => i.src == image.src))) {
                image.instances[0].alt = element.alt || element.title
                image.instances[0].tags.isBackground = true
                image.instances[0].tags.isInline = true
                media.push(image)
              }
              else
                found.instances.push({
                  foundOn: url,
                  alt: image.instances[0].alt || element.title,
                  tags: { isBackground: true, isInline: true }
                })
          }
        })

        //Find Background Images hidden in style tags - get image and add to crawl all list, but if already found add as an instance
        if (!isUrlHTMLFile(url) || (isUrlHTMLFile(url) && settings.crawl.onPageStyles))
          doc.querySelectorAll('style').forEach(element => {
            if (element.innerHTML.match(imageUrlRegex))
              element.innerHTML.match(imageUrlRegex).forEach(style => {
                let src = imageUrlRegex.exec(style).groups.image.replace(chromeExtensionRegex, '/').replace('viewer.html', '')
                imageUrlRegex.lastIndex = 0
                let found
                let image = createImageObject(url, null, src)
                if (isUrlImage(image.src))
                  if (!(found = media.find(i => i.src == image.src))) {
                    image.instances[0].alt = element.alt || element.title
                    image.instances[0].tags.isBackground = true
                    image.instances[0].tags.isInStyleTag = true
                    media.push(image)
                  }
                  else
                    found.instances.push({
                      foundOn: url,
                      alt: image.instances[0].alt || element.title,
                      tags: { isBackground: true, isInStyleTag: true }
                    })
              })
          })

        //Find Background Images/Links in script tags - get links/images and add to crawl all list, but if already found add as an instance

        if (!isUrlHTMLFile(url) || (isUrlHTMLFile(url) && settings.crawl.onPageStyles))
          doc.querySelectorAll('script').forEach(element => {

            //Look for BackgroundImages
            if (element.innerHTML.match(imageUrlRegex))
              element.innerHTML.match(imageUrlRegex).forEach(style => {
                let src = imageUrlRegex.exec(style).groups.image.replace(chromeExtensionRegex, '/').replace('viewer.html', '')
                imageUrlRegex.lastIndex = 0
                let image = createImageObject(url, null, src)
                let found
                if (isUrlImage(image.src))
                  if (!(found = media.find(i => i.src == image.src))) {
                    image.instances[0].alt = element.alt || element.title
                    image.instances[0].tags.isBackground = true
                    image.instances[0].tags.isInScriptTag = true
                    media.push(image)
                  }
                  else
                    found.instances.push({
                      foundOn: url,
                      alt: image.instances[0].alt || element.title,
                      tags: { isBackground: true, isInScriptTag: true }
                    })
              })

            //Look for Links
            if (element.innerHTML.match(aTagRegex))
              element.innerHTML.match(aTagRegex).forEach(element => {
                element += "</a>"
                let linkElement = createElementFromHTML(element)
                let link = createLinkObject(url, linkElement)
                if ((link._href && (link._href.startsWith("?")))) return
                let found

                if (!(found = links.find(i => i.href == link.href) || (link.href.length == 1 && link.href[0] == '/'))) {
                  link.instances[0].tags.isInScriptTag = true
                  links.push(link)
                }
                else
                  found.instances.push({
                    foundOn: url,
                    title: link.instances[0].title,
                    tags: { isNewTab: link.instances[0].tags.isNewTab, isInScriptTag: true }
                  })
              })
          })

        //Find and track all stylesheets as assets
        if (type == "html")
          doc.querySelectorAll('link').forEach(element => {
            if (element.rel == "stylesheet") {
              let linkSheet = createAssetObject(url, element.href)
              assets.push(linkSheet)
            }
          })
        //Find and track all scripts as assets
        if (type == "html")
          doc.querySelectorAll('script').forEach(element => {
            if (element.src) {
              let linkScript = createAssetObject(url, element.src)
              assets.push(linkScript)
            }
          })

        //Add page to crawled object
        let page = {
          title: doc.querySelector("title")?.innerHTML,
          description: doc.querySelector("meta[name='description']")?.content,
          links: links.sort(sortLinks),
          media,
          assets,
          doc,
          data
        }

        if (addToAll) {

          //For Links - add link to crawl all list or add to instance if already crawled
          page.links.forEach(link => {
            if (!crawl.all.links.find(i => i.href == link.href)) crawl.all.links.push(link)
            else {
              let instances = crawl.all.links.find(i => i.href == link.href).instances
              crawl.all.links.find(i => i.href == link.href).instances = [...instances, ...link.instances]
            }
          })
          //For images - add link to crawl all list or add to instance if already crawled
          page.media.forEach(file => {
            if (!crawl.all.media.find(i => i.src == file.src)) crawl.all.media.push(file)
            else {
              let instances = crawl.all.media.find(i => i.src == file.src).instances
              crawl.all.media.find(i => i.src == file.src).instances = [...instances, ...file.instances]
            }
          })
          //For assets - add link to crawl all list or add to instance if already crawled
          page.assets.forEach(asset => {
            if (!crawl.all.assets.find(i => i.link == asset.link)) crawl.all.assets.push(asset)
            else {
              let instances = crawl.all.assets.find(i => i.link == asset.link).instances
              crawl.all.assets.find(i => i.link == asset.link).instances = [...instances, ...asset.instances]
            }
          })

          //Add crawled page to crawl object
          crawl[url] = page

          //Sort links
          crawl.all.links = crawl.all.links.sort(sortLinks)

          //Perform updates
          updatePages()
          updateAssets()
          updateLinks()
          updateFiles()
          updateMedia()
          updateOverview()

          //Update Listeners
          updateAll()
        }

        //find and remove element from array
        let index = crawling.indexOf(url)
        if (index > -1) crawling.splice(index, 1)

        //Remove Crawling overlay if not crawling anything else, otherwise update crawling text to the next thing thats been crawling the longest
        if (crawling.length == 0)
          document.querySelector("#crawling").classList.remove("active")
        else
          document.querySelector("#crawlingSiteText").innerHTML = crawling[0]

        resolve(page)

      }).catch(error => {

        //find and remove element from array
        let index = crawling.indexOf(url)
        if (index > -1) crawling.splice(index, 1)

        //Remove crawling overlay if not crawling anything else
        if (crawling.length == 0)
          document.querySelector("#crawling").classList.remove("active")
        if (crawl.all.links.findIndex(i => i.href == url) > -1) {
          if (!isNaN(error.message)) {
            crawl.all.links[crawl.all.links.findIndex(i => i.href == url)].isWarning = true
            crawl.all.links[crawl.all.links.findIndex(i => i.href == url)].statusCode = error.message
          }
          else
            crawl.all.links[crawl.all.links.findIndex(i => i.href == url)].isError = true
        }

        //Perform updates
        updatePages()
        updateAssets()
        updateLinks()
        updateFiles()
        updateMedia()
        updateOverview()

        //Update Listeners
        updateAll()

        reject(error[0] ?? error)
      })
  })
}

/**
* Function to run AFTER each view and popup-view is updated
*/
function updateAll() {

  //If more than one item is selected, show the multi-item wrapper
  document.querySelectorAll(".view .view-items .select input").forEach(i => i.onclick = function () {
    if (Array.from(document.querySelectorAll(".view.active .view-items .select input")).filter(i => i.checked).length >= 2)
      document.querySelector(".view.active .multi-wrapper").classList.add("active")
    else
      document.querySelector(".view.active .multi-wrapper").classList.remove("active")
  })

  // Prevent clicking on warnings and errors
  document.querySelectorAll(".view-items .warning, .view-items .error").forEach(element => element.addEventListener("click", event => {
    event.preventDefault()
  }))

  //Add click event for the inspect icon
  document.querySelectorAll(".view .view-items .inspect").forEach(element => element.addEventListener("click", event => {
    event.preventDefault()
    let url = event.target.parentNode.href
    setupPopup(url)
    document.querySelector(".popup").classList.add("active")
  }))

  //Add click event for the inspect icon
  document.querySelectorAll(".view-items .test").forEach(element => element.addEventListener("click", event => {
    event.preventDefault()
    let url = event.target.parentNode.href
    console.log("testing", url)
    testURL(url, element)
  }))

  //Add crawl event to all view-items that have a crawl icon
  document.querySelectorAll(".view .view-items .crawl").forEach(element => {
    element.onclick = event => {
      event.preventDefault()
      let url = event.target.parentNode.href

      //Check if the item being crawled is an HTML page or an asset
      if (isUrlHTMLFile(url))
        crawl.all.links[crawl.all.links.findIndex(i => i.href == url)].isCrawled = true
      else
        crawl.all.assets[crawl.all.assets.findIndex(i => i.link == url)].isCrawled = true

      //Remove Crawl Icon
      event.target.parentNode.remove()
      crawlURL(url)
    }
  })

  //Add download event to all view-items that have a download icon
  document.querySelectorAll(".view-items .download").forEach(element => {
    element.onclick = event => {
      event.preventDefault()

      console.log("Downloading")
      //Get url to download
      let url = event.target.parentNode.href
      console.log(url)

      //If combining images and assets into one file
      if (isUrlHTMLFile(url) && settings.combine.enabled) {
        console.log("Is Html and is combine")

        crawlIfNeeded(url).then(page => {

          convertAll(page);

          async function convertAll(page) {
            console.log("Converting all")
            let pageDoc = page.doc.cloneNode(true)
            if (settings.combine.assets) {
              console.log("Converting all scripts to HTML File")
              pageDoc = await convertAllScripts(pageDoc)
              console.log("Converting all styles to HTML File")
              pageDoc = await convertAllStyles(pageDoc)
            }
            if (settings.combine.imagesInAssets) {
              console.log("Converting all Style images in assets to HTML File")
              pageDoc = await convertAllStyleImages(pageDoc)
            }
            if (settings.combine.images) {
              console.log("Converting all images to HTML File")
              pageDoc = await convertAllImages(pageDoc)
            }

            //Create blob
            let fileBlob = new Blob([pageDoc.querySelector("html").outerHTML], { type: "plain/text" });
            blobUrl = URL.createObjectURL(fileBlob);

            //Save blob to localstorage
            storageSet(blobUrl, url)

            //Update url to blobUrl
            url = blobUrl

            console.log("Sending to download")
            chrome.downloads.download({ url })

          }

          //Convert all style sheets
          async function convertAllStyles(pageDoc) {
            return new Promise(done => {
              let styleSheets = pageDoc.querySelectorAll("link[rel='stylesheet']")
              let styleSheetPromises = []

              styleSheets.forEach(styleSheet => {
                styleSheetPromises.push(new Promise((resolveStyle, rejectStyle) => {
                  let styleSheetUrl = formatLink(baseUrl, styleSheet.href)
                  crawlIfNeeded(styleSheetUrl).then(page => resolveStyle([styleSheetUrl, page.data])).catch(rejectStyle)
                }))
              })
              styleSheets.forEach(styleSheet => styleSheet.remove())
              Promise.allSettled(styleSheetPromises).then(data => {

                data.forEach((styleSheet) => {
                  if (styleSheet.value) {
                    let url = styleSheet.value[0]
                    let page = styleSheet.value[1]
                    let elm = createElementFromHTML(page)
                    elm.setAttribute("data-link", url)
                    pageDoc.querySelector("body").appendChild(elm)
                  }
                })
                console.log("Moving older Styles to bottom")
                pageDoc.querySelectorAll("style:not([data-link])").forEach(style => pageDoc.querySelector("body").appendChild(style))
                done(pageDoc)
              })
            })
          }

          //Convert all scripts
          async function convertAllScripts(pageDoc) {
            return new Promise(done => {
              let scripts = pageDoc.querySelectorAll("script[src]")
              let scriptPromises = []

              scripts.forEach(script => {
                scriptPromises.push(new Promise((resolveScript, rejectScript) => {
                  let scriptUrl = formatLink(baseUrl, script.src)
                  crawlIfNeeded(scriptUrl).then(page => resolveScript([scriptUrl, page.data])).catch(rejectScript)
                }))
              })
              scripts.forEach(script => script.remove())
              Promise.allSettled(scriptPromises).then(data => {
                data.forEach((script) => {
                  if (script.value) {
                    let url = script.value[0]
                    let page = script.value[1]
                    let elm = createElementFromHTML(page)
                    elm.setAttribute("data-link", url)
                    pageDoc.querySelector("body").appendChild(elm)
                  }
                })
                console.log("Moving older Scripts to bottom")
                pageDoc.querySelectorAll("script:not([data-link])").forEach(script => pageDoc.querySelector("body").appendChild(script))
                done(pageDoc)
              })
            })
          }
          //Convert all images in style tags
          async function convertAllStyleImages(pageDoc) {
            return new Promise(done => {
              let styles = pageDoc.querySelectorAll("style")

              let stylePromises = []
              let matchedStyles = []

              styles.forEach(style => {
                stylePromises.push(new Promise(resolveStyle => {
                  if (style.innerHTML.match(imageUrlRegex)) {
                    let imagePromises = []
                    style.innerHTML.match(imageUrlRegex).forEach(image => {
                      matchedStyles.push(style)
                      let src = imageUrlRegex.exec(image).groups.image.replace(chromeExtensionRegex, '/').replace('viewer.html', '')
                      imagePromises.push(new Promise((resolveImage, rejectImage) => {
                        let img = createImageObject(baseUrl, null, src)
                        imageUrlRegex.lastIndex = 0
                        toDataURL(img.src).then(dataUrl => {
                          let srcToReplace = img._src || img.src
                          console.log("Wants to replace", srcToReplace, "with", "...")
                          resolveImage([srcToReplace, dataUrl])
                        }).catch(err => rejectImage(err))
                      })
                      )
                    })
                    Promise.allSettled(imagePromises).then(data => {
                      let toReplace = []
                      data.forEach(image => {
                        console.log(image)
                        if (image.value) {
                          console.log("Passing along", image.value[0], "with", "...")
                          toReplace.push(image.value)
                        }
                      })
                      resolveStyle(toReplace)
                    })
                  }
                  else
                    resolveStyle([])
                }))
              })
              Promise.all(stylePromises).then(styleList => {
                styleList.forEach(style => {
                  if (style.length > 0) {
                    style.forEach(image => {
                      console.log("Replacing", image[0], "with", image[1])
                      matchedStyles.forEach(styleTag => styleTag.innerHTML = styleTag.innerHTML.replace(new RegExp(image[0], "g"), image[1]))
                    })
                  }
                })
                done(pageDoc)
              })
            })
          }

          //Convert all imgs
          async function convertAllImages(pageDoc) {
            return new Promise(done => {
              let images = pageDoc.querySelectorAll('img[src]:not([src^=data]), img[data-src], *[style*="background"]')
              let imagePromises = []
              images.forEach(image => {
                imagePromises.push(new Promise((resolveImage, rejectImage) => {
                  let isImageTag = image.tagName.toLowerCase() === "img"
                  let src = image.src || image.getAttribute("data-src")
                  console.log(!isImageTag, image.style.cssText.match(imageUrlRegex))
                  if(!isImageTag && image.style.cssText.match(imageUrlRegex)) {
                    src = imageUrlRegex.exec(element.style.cssText).groups.image
                    imageUrlRegex.lastIndex = 0;
                  }
                  console.log(src)
                  let img = createImageObject(baseUrl, null, src)
                  toDataURL(img.src).then(dataUrl => {
                    console.log("Wants to replace", src, "with", "...")
                    if(isImageTag)
                      image.src = dataUrl
                    else
                      image.style = image.style.cssText.replace(new RegExp(src, "g"), dataUrl)
                    resolveImage()
                  }).catch(err => rejectImage(err))
                })
                )
              })
              Promise.allSettled(imagePromises).then(data => {
                done(pageDoc)
              })
            })
          }
          async function convertAllImages1(pageDoc) {
            return new Promise(resolve => {
              if (pageDoc.querySelectorAll('img[src], *[style*="background"]').length == 0) resolve(pageDoc)

              let count = 0

              pageDoc.querySelectorAll('img[src], *[style*="background"], img[data-src]').forEach(element => {

                let isBackground = element.tagName == "IMG" ? false : true
                let src
                if (isBackground && element.style.cssText.match(imageUrlRegex)) {
                  src = imageUrlRegex.exec(element.style.cssText).groups.image
                  imageUrlRegex.lastIndex = 0;
                }
                else if (!isBackground) {
                  src = element.src || element.getAttribute("data-src")
                } else
                  return
                console.log(src)

                let img = createImageObject(url, isBackground ? element.src : null, src)
                if (!settings.combine.onlyLocal || (settings.combine.onlyLocal && img.tags.isLocal)) {
                  count++
                  toDataURL(img.src).then(dataUrl => {
                    let srcToReplace = img._src || img.src
                    if (isBackground)
                      element.style.cssText = element.style.cssText.replace(new RegExp(srcToReplace, "g"), dataUrl)
                    else
                      element.src = dataUrl
                    count--
                    if (count == 0)
                      resolve(pageDoc)
                  }).catch(() => {
                    count--
                    if (count == 0)
                      resolve(pageDoc)
                    else
                      return
                  })
                }
              })
            })
          }

        })


        function crawlIfNeeded(url) {
          return new Promise((resolve, reject) => {
            if (Object.keys(crawl).find(i => i == url))
              resolve(crawl[url])
            else
              crawlURL(url, false).then(page => resolve(page)).catch(error => reject(error))
          })
        }

      } else {
        console.log("Simple Download")
        chrome.downloads.download({ url })
      }
    }
  })

}
function testURL(url, element) {
  element.classList.remove("test")
  element.classList.add("testing")
  element.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 10000)
  fetch(CORS_BYPASS_URL + encodeURIComponent(url), { signal: controller.signal })
    .then(res => {
      if (res.ok) return res.json()
      else throw new Error(res.error)
    })
    .then(data => {
      if (data.status.http_code == 200) {
        element.classList.add("success")
        element.title = "Link is valid"
        element.innerHTML = '<i class="fas fa-check-circle"></i>'
        crawl.all.links[crawl.all.links.findIndex(i => i.href == url)].test = "success"
      }
      else if (data.error || data.status.error) {
        throw new Error()
      }
      else {
        element.classList.add("warning")
        element.title = "Returned a status code of " + data.status.http_code
        element.innerHTML = '<i class="fas fa-exclamation-circle"></i>'
        crawl.all.links[crawl.all.links.findIndex(i => i.href == url)].test = "warning"
        crawl.all.links[crawl.all.links.findIndex(i => i.href == url)].statusCode = data.status.http_code
      }
    })
    .catch(() => {
      element.classList.add("error")
      element.title = "Link doesn't exist or took to long to respond"
      element.innerHTML = '<i class="fas fa-times-circle"></i>'
      crawl.all.links[crawl.all.links.findIndex(i => i.href == url)].test = "failed"
    })
    .finally(() => {
      element.classList.remove("testing")
    })
}

/**
* Function to update the Overview view
*/
function updateOverview() {

  //Get count of view-rows in each view
  let targetCount = [
    document.querySelectorAll("#pages .view-row").length,
    document.querySelectorAll("#assets .view-row").length,
    document.querySelectorAll("#links .view-row").length,
    document.querySelectorAll("#files .view-row").length,
    document.querySelectorAll("#media .view-row").length
  ]

  //Get all counters in overview
  let countElements = document.querySelectorAll("#overview .count")
  for (let i = 0; i < countElements.length; i++) {
    const element = countElements[i]
    const target = targetCount[i]

    //Have a nice animation counting up to the new count
    const updateCount = () => {
      const count = + element.innerText
      const speed = 5000
      const inc = target / speed;
      if (count < target) {
        element.innerText = Math.ceil(count + inc)
        setTimeout(updateCount, 1)
      } else {
        element.innerText = target
      }
    }
    updateCount()
  }

  //If crawled more than one page, show the crawl count with a hover popup list of all crawled pages
  if (Object.keys(crawl).length - 2 > 0) {
    let crawledHTML = '<ul>'
    //Update Crawl counter
    document.querySelector("#crawledSiteCount").innerHTML = '(+' + (Object.keys(crawl).length - 2) + ')'
    //Update list of crawled pages, include both links and assets
    crawl.all.links.forEach(item => {
      if (item.isCrawled)
        crawledHTML += '<li>' + item.href + '</li>'
    })
    crawl.all.assets.forEach(item => {
      if (item.isCrawled)
        crawledHTML += '<li>' + item.link + '</li>'
    })
    crawledHTML += '</ul>'
    document.querySelector("#crawledLinks").innerHTML = crawledHTML
  }
}

/**
* Function to update the Pages view
*/
function updatePages() {
  //Hide Multi-wrapper if view is updated
  document.querySelector("#pages .multi-wrapper").classList.remove("active")

  //Get view wrapper
  let wrapper = document.querySelector("#pages .view-items")

  //Iterate all links in the crawl object adding to the HTML string
  let html = ''

  getPages().forEach(link => {
    //Pages should only contain local HTML links but not anchors


    //Create string of tags and instances
    let linkTagsText = ''
    let instancesText = '<strong>Instances:</strong>(' + link.instances.length + ')<ul>'
    linkTagsText += "Original URL: <strong>" + link._href + '</strong><br>'

    //No need to display isLocal if it's a page
    Object.keys(link.tags).forEach(i => linkTagsText += i != "isLocal" ? "" + i + ": <strong>" + link.tags[i] + "</strong><br>" : '')
    if (linkTagsText.length > 0)
      linkTagsText = linkTagsText.substr(0, linkTagsText.length - 4) + '<hr>'

    //Add all instances to the instance string
    link.instances.forEach(i => {
      instancesText += '<li><a href="' + i.foundOn + '" target="_blank">' + i.foundOn + '</a><ul>'
      if (i.title)
        instancesText += '<li>Title: <strong>' + i.title + '</strong></li>'
      if (i.text)
        instancesText += '<li>Text: <strong>' + i.text + '</strong></li>'
      Object.keys(i.tags).forEach(i1 => instancesText += i.tags[i1] ? "<li>" + i1 + ": <strong>" + i.tags[i1] + "</strong></li>" : '')
      instancesText += '</ul></li>'
    })
    instancesText += '</ul>'

    //Add to HTML to html string for the item
    html += `
        <div class="view-row">
          <div class="select">
            <input type="checkbox">
          </div>
          <div class="link">
            <p>` + link.href + `</p>
          </div>
          <div class="tools">
            <a class="download" href="`+ link.href + `" title="Download Page"><i class="fas fa-file-download"></i></a>` +
      '<a class="goto" target="_blank" href="' + link.href + '" title="Go to page"><i class="fas fa-external-link-alt"></i></a>'
    if (link.isError)
      html += '<a class="error" target="_blank" href="#" title="Page doesn\'t exist or took to long to respond"><i class="fas fa-times-circle"></i></a>'
    else if (link.isWarning)
      html += '<a class="warning" target="_blank" href="#" title="Returned a status code of ' + link.statusCode + '"><i class="fas fa-exclamation-circle"></i></a>'
    else if (link.isCrawled)
      html += '<a class="inspect" title="Inspect Page" href="' + link.href + '"><i class="fas fa-search"></i></a>'
    else
      html += '<a class="crawl" target="_blank" href="' + link.href + '" title="Crawl page"><i class="fas fa-sitemap"></i></a>'
    html +=
      `</div>
          <div class="info">
            <div class="hover-popup-icon">
            <span class="fa-stack fa-1x">
            <i class="fas fa-square fa-stack-2x"></i>
            <i class="fas fa-info fa-stack-1x fa-inverse"></i>
          </span>
              <div class="hover-popup">`+
      linkTagsText +
      instancesText +
      `</div>
            </div>
          </div>
        </div>
      `
  })
  //Add html to page
  if (html.length > 0)
    wrapper.innerHTML = html
  else
    wrapper.innerHTML = `<div class="empty-row">There are no items here.</div>`

}

/** 
* Function to setup the popup according to the url
* @param {string} url - The url to setup the popup for
*/
function setupPopup(url) {

  // Get the popup and the crawled object to inspect
  let popup = document.querySelector("#popup")
  let page = crawl[url]

  //Add popup content
  popup.querySelector(".card-title").innerHTML = '<h2>' + page.title + '</h2>' + '<h3>' + url + '<br><br></h3><p>' + page.description + '</p>'

  let html = { links: '', files: '', assets: '', media: '' }
  let htmlIndex = ''

  //Loop through all links and assets
  let items = [...page.links, ...page.assets]
  items.forEach(link => {

    let href = link.href ? link.href : link.link
    let _href = link._href ? link._href : link._link

    let isAsset = link.link ? true : false
    let isLocalPage = isUrlLocal(href) && !isUrlAnchor(href)

    htmlIndex = 'media'

    //Check if it's an asset
    if (isAsset)
      htmlIndex = 'assets';

    //Files are only if the link isn't a HTML page or a protocol link
    else if (!isUrlHTMLFile(href) && !isUrlProtocol(href))
      htmlIndex = 'files';

    //Links are only if not local or is an anchor link
    else
      htmlIndex = 'links';

    //Create string of tags and instances
    let linkTagsText = ''
    let instancesText = '<strong>Instances:</strong> (' + link.instances.length + ')<ul>'

    if (link.tags.isLocal)
      linkTagsText += "Original URL: <strong>" + _href + '</strong><br>'
    Object.keys(link.tags).forEach(i => linkTagsText += "" + i + ": <strong>" + link.tags[i] + "</strong><br>")
    if (linkTagsText.length > 0)
      linkTagsText = linkTagsText.substr(0, linkTagsText.length - 4) + '<hr>'

    //Add all instances to the instance string
    link.instances.forEach(i => {
      instancesText += '<li><a href="' + i.foundOn + '" target="_blank">' + i.foundOn + '</a><ul>'
      if (i.title)
        instancesText += '<li>Title: <strong>' + i.title + '</strong></li>'
      if (i.text)
        instancesText += '<li>Text: <strong>' + i.text + '</strong></li>'
      Object.keys(i.tags).forEach(i1 => instancesText += i.tags[i1] ? "<li>" + i1 + ": <strong>" + i.tags[i1] + "</strong></li>" : '')
      instancesText += '</ul></li>'
    })
    instancesText += '</ul>'

    html[htmlIndex] +=
      '<div class="view-row">' +
      '<div class="type">' +
      (isLocalPage && !isAsset ? '<i class="far fa-file"></i>' : getFAIcon(href)) +
      `</div>
            <div class="link">`+
      '<p>' + href + '</p>' +
      `</div>
        <div class="tools">`+
      '<a class="goto" target="_blank" href="' + href + '" title="Open the link"><i class="fas fa-external-link-alt"></i></a>'
    if (!isUrlProtocol(href) && !isUrlAnchor(href) && htmlIndex == 'links') {
      if (link.test == null)
        html[htmlIndex] += '<a class="test" target="_blank" href="' + href + '" title="Test the link"><i class="fas fa-question-circle"></i></a>'
      if (link.test == "success")
        html[htmlIndex] += '<a class="success" target="_blank" href="' + href + '" title="Link is valid"><i class="fas fa-check-circle"></i></a>'
      else if (link.test == "warning")
        html[htmlIndex] += '<a class="warning" target="_blank" href="' + href + '" title="Returned a status code of ' + link.statusCode + '"><i class="fas fa-exclamation-circle"></i></a>'
      else if (link.test == "error")
        html[htmlIndex] += '<a class="error" target="_blank" href="' + href + '" title="Link doesn\'t exist or took to long to respond"><i class="fas fa-times-circle"></i></a>'
    }
    if (htmlIndex != 'links')
      html[htmlIndex] += '<a class="download" href="' + href + '" title="Download Page"><i class="fas fa-file-download"></i></a>'
    html[htmlIndex] += `</div>
          <div class="info">
          <div class="hover-popup-icon">
            <span class="fa-stack fa-1x">
              <i class="fas fa-square fa-stack-2x"></i>
              <i class="fas fa-info fa-stack-1x fa-inverse"></i>
            </span>
            <div class="hover-popup">`+
      linkTagsText +
      instancesText +
      `</div>
            </div>
          </div>
        </div>
      </div>
      `
  })

  //Loop through all images
  page.media.forEach(file => {

    let isImage = isUrlImage(file.src)

    //Create string of tags and instances
    let fileTagsText = ''
    let instancesText = '<strong>Instances:</strong>(' + file.instances.length + ')<ul>'

    if (file._src)
      fileTagsText += "Original URL: <strong>" + file._src + '</strong><br>'
    Object.keys(file.tags).forEach(i => fileTagsText += "" + i + ": <strong>" + file.tags[i] + "</strong><br>")
    if (fileTagsText.length > 0)
      fileTagsText = fileTagsText.substr(0, fileTagsText.length - 4) + '<hr>'

    file.instances.forEach(i => {
      instancesText += '<li><a href="' + i.foundOn + '" target="_blank">' + i.foundOn + '</a><ul>'
      if (i.alt)
        instancesText += '<li>Alt: <strong>' + i.alt + '</strong></li>'
      Object.keys(i.tags).forEach(i1 => instancesText += i.tags[i1] ? "<li>" + i1 + ": <strong>" + i.tags[i1] + "</strong></li>" : '')
      instancesText += '</ul></li>'
    })
    instancesText += '</ul>'

    //Add to HTML to html string for the item
    html.media += `
        <div class="view-row">
           
          <div class="image">`
    if (isImage)
      html.media += '<img src="' + file.src + '">'
    else html.media += getFAIcon(file.src)
    html.media += `</div>
          <div class="link">`+
      '<p>' + file.src + '</p>' +
      `</div>
       <div class="tools">
        <a class="goto" target="_blank" href="` + file.src + `" title="Open Image"><i class="fas fa-external-link-alt"></i></a>
         <a class="download" href="`+ file.src + `" title="Download Image"><i class="fas fa-file-download"></i></a>
         </div>
         <div class="info">
         <div class="hover-popup-icon">
            <span class="fa-stack fa-1x">
              <i class="fas fa-square fa-stack-2x"></i>
              <i class="fas fa-info fa-stack-1x fa-inverse"></i>
            </span>
                <div class="hover-popup">` +
      fileTagsText +
      instancesText +
      `</div>
      </div>
              </div>
       </div>
     </div>
     `
  })

  //Add all HTML to the popup
  if (html.links.length == 0)
    html.links = '<div class="empty-row">There are no items here.</div>'
  popup.querySelector("#popup-view-links .view-items").innerHTML = html.links

  if (html.files.length == 0)
    html.files = '<div class="empty-row">There are no items here.</div>'
  popup.querySelector("#popup-view-files .view-items").innerHTML = html.files

  if (html.assets.length == 0)
    html.assets = '<div class="empty-row">There are no items here.</div>'
  popup.querySelector("#popup-view-assets .view-items").innerHTML = html.assets

  if (html.media.length == 0)
    html.media = '<div class="empty-row">There are no items here.</div>'
  popup.querySelector("#popup-view-media .view-items").innerHTML = html.media

  //UpdateAll to make sure goto and download icons are activated
  updateAll()
}

/**
* Function to update the Assets view
*/
function updateAssets() {
  //Hide Multi-wrapper if view is updated
  document.querySelector("#assets .multi-wrapper").classList.remove("active")

  //Get view wrapper
  let wrapper = document.querySelector("#assets .view-items")

  //Iterate all assets in the crawl object adding to the HTML string
  let html = ''
  crawl.all.assets.forEach(link => {

    //Create string of tags and isntances
    let linkTagsText = ''
    let instancesText = '<strong>Instances:</strong>(' + link.instances.length + ')<ul>'
    if (link.tags.isLocal)
      linkTagsText += "Original URL: <strong>" + link._link + '</strong><br>'

    Object.keys(link.tags).forEach(i => linkTagsText += i != "isLocal" ? "" + i + ": <strong>" + link.tags[i] + "</strong><br>" : '')
    if (linkTagsText.length > 0)
      linkTagsText = linkTagsText.substr(0, linkTagsText.length - 4) + '<hr>'

    //Add all instances to the instance string
    link.instances.forEach(i => {
      instancesText += '<li><a href="' + i.foundOn + '" target="_blank">' + i.foundOn + '</a><ul>'
      Object.keys(i.tags).forEach(i1 => instancesText += i.tags[i1] ? "<li>" + i1 + ": <strong>" + i.tags[i1] + "</strong></li>" : '')
      instancesText += '</ul></li>'
    })
    instancesText += '</ul>'

    //Add to HTML to html string for the item
    html += `
        <div class="view-row">
          <div class="select">
            <input type="checkbox">
          </div>
          <div class="type">`+
      getFAIcon(link.link) +
      `</div>
          <div class="link">
            <p>` + link.link + `</p>
          </div>
          <div class="tools">
            <a class="download" href="`+ link.link + `" title="Download Page"><i class="fas fa-file-download"></i></a>`
    if (!link.isCrawled && (isUrlScript(link.link) || isUrlStyleSheet(link.link)))
      html += '<a class="crawl" target="_blank" href="' + link.link + '" title="Crawl page"><i class="fas fa-sitemap"></i></a>'
    html +=
      `</div>
          <div class="info">
            <div class="hover-popup-icon">
            <span class="fa-stack fa-1x">
            <i class="fas fa-square fa-stack-2x"></i>
            <i class="fas fa-info fa-stack-1x fa-inverse"></i>
          </span>
              <div class="hover-popup">`+
      linkTagsText +
      instancesText +
      `</div>
            </div>
          </div>
        </div>
      `
  })
  //Add html to page
  if (html.length > 0)
    wrapper.innerHTML = html
  else
    wrapper.innerHTML = `<div class="empty-row">There are no items here.</div>`

}

/**
* Function to update the Links view
*/
function updateLinks() {
  //Hide Multi-wrapper if view is updated
  let wrapper = document.querySelector("#links .view-items")

  //Iterate all links in the crawl object adding to the HTML string
  let html = ''
  getLinks().forEach(link => {


    //Create string of tags and instances
    let linkTagsText = ''
    let instancesText = '<strong>Instances:</strong>(' + link.instances.length + ')<ul>'

    if (link.tags.isLocal)
      linkTagsText += "Original URL: <strong>" + link._href + '</strong><br>'
    Object.keys(link.tags).forEach(i => linkTagsText += "" + i + ": <strong>" + link.tags[i] + "</strong><br>")
    if (linkTagsText.length > 0)
      linkTagsText = linkTagsText.substr(0, linkTagsText.length - 4) + '<hr>'

    //Add all instances to the instance string
    link.instances.forEach(i => {
      instancesText += '<li><a href="' + i.foundOn + '" target="_blank">' + i.foundOn + '</a><ul>'
      if (i.title)
        instancesText += '<li>Title: <strong>' + i.title + '</strong></li>'
      if (i.text)
        instancesText += '<li>Text: <strong>' + i.text + '</strong></li>'
      Object.keys(i.tags).forEach(i1 => instancesText += i.tags[i1] ? "<li>" + i1 + ": <strong>" + i.tags[i1] + "</strong></li>" : '')
      instancesText += '</ul></li>'
    })
    instancesText += '</ul>'

    //Add to HTML to html string for the item
    html += `
        <div class="view-row">
          <div class="select">`
    if (!isUrlProtocol(link.href) && !isUrlAnchor(link.href))
      html += `<input type="checkbox">`
    html += `</div>
        <div class="type">`
    if (link.tags.tag == 'a')
      html += getFAIcon(link.href)
    else
      html += getFAIcon(link.tags.tag)
    html += `</div>
            <div class="link">`+
      '<p>' + link.href + '</p>' +
      `</div>
        <div class="tools"><a class="goto" target="_blank" href="` + link.href + `" title="Open link"><i class="fas fa-external-link-alt"></i></a>`
    if (!isUrlProtocol(link.href) && !isUrlAnchor(link.href)) {
      if (link.test == null)
        html += '<a class="test" target="_blank" href="' + link.href + '" title="Test the link"><i class="fas fa-question-circle"></i></a>'
      if (link.test == "success")
        html += '<a class="success" target="_blank" href="' + link.href + '" title="Link is valid"><i class="fas fa-check-circle"></i></a>'
      else if (link.test == "warning")
        html += '<a class="warning" target="_blank" href="' + link.href + '" title="Returned a status code of ' + test.statusCode + '"><i class="fas fa-exclamation-circle"></i></a>'
      else if (link.test == "failed")
        html += '<a class="error" target="_blank" href="' + link.href + '" title="Test the link"><i class="fas fa-exclamation-circle"></i></a>'
    }
    html += `</div>
          <div class="info">
          <div class="hover-popup-icon">
            <span class="fa-stack fa-1x">
              <i class="fas fa-square fa-stack-2x"></i>
              <i class="fas fa-info fa-stack-1x fa-inverse"></i>
            </span>
            <div class="hover-popup">`+
      linkTagsText +
      instancesText +
      `</div>
            </div>
          </div>
        </div>
      </div>
      `

  })
  //Add html to page
  if (html.length > 0)
    wrapper.innerHTML = html
  else
    wrapper.innerHTML = `<div class="empty-row">There are no items here.</div>`
}

/* *
* Function to update the Files view
*/
function updateFiles() {
  //Hide Multi-wrapper if view is updated
  document.querySelector("#files .multi-wrapper").classList.remove("active")

  //Iterate all links in the crawl object adding to the HTML string
  let wrapper = document.querySelector("#files .view-items")
  let html = ''
  getFiles().forEach(link => {

    //Create string of tags and instances
    let linkTagsText = ''
    let instancesText = '<strong>Instances:</strong>(' + link.instances.length + ')<ul>'

    if (link.tags.isLocal)
      linkTagsText += "Original URL: <strong>" + link._href + '</strong><br>'
    Object.keys(link.tags).forEach(i => linkTagsText += "" + i + ": <strong>" + link.tags[i] + "</strong><br>")
    if (linkTagsText.length > 0)
      linkTagsText = linkTagsText.substr(0, linkTagsText.length - 4) + '<hr>'

    //Add all instances to the instance string
    link.instances.forEach(i => {
      instancesText += '<li><a href="' + i.foundOn + '" target="_blank">' + i.foundOn + '</a><ul>'
      if (i.title)
        instancesText += '<li>Title: <strong>' + i.title + '</strong></li>'
      if (i.text)
        instancesText += '<li>Text: <strong>' + i.text + '</strong></li>'
      Object.keys(i.tags).forEach(i1 => instancesText += i.tags[i1] ? "<li>" + i1 + ": <strong>" + i.tags[i1] + "</strong></li>" : '')
      instancesText += '</ul></li>'
    })
    instancesText += '</ul>'

    //Add to HTML to html string for the item
    html += `
        <div class="view-row">
          <div class="select">
            <input type="checkbox">
          </div>
          <div class="type">`+
      getFAIcon(link.href) +
      `</div>
            <div class="link">`+
      '<p>' + link.href + '</p>' +
      `</div>
        <div class="tools">
          <a class="download" href="`+ link.href + `" title="Download File"><i class="fas fa-file-download"></i></a>
          <a class="goto" target="_blank" href="`+ link.href + `" title="Go to link"><i class="fas fa-external-link-alt"></i></a>
          </div>
          <div class="info"><div class="hover-popup-icon">
          <span class="fa-stack fa-1x">
          <i class="fas fa-square fa-stack-2x"></i>
          <i class="fas fa-info fa-stack-1x fa-inverse"></i>
        </span>
              <div class="hover-popup">`+
      linkTagsText +
      instancesText +
      `</div>
        </div>
          </div>
        </div>
      </div>
      `
  })
  //Add html to page
  if (html.length > 0)
    wrapper.innerHTML = html
  else
    wrapper.innerHTML = `<div class="empty-row">There are no items here.</div>`
}

/**
* Function to update Image View
*/
function updateMedia() {
  //Hide Multi-wrapper if view is updated
  document.querySelector("#media .multi-wrapper").classList.remove("active")

  //Iterate all images in the crawl object adding to the HTML string
  let wrapper = document.querySelector("#media .view-items")
  let html = ''

  crawl.all.media.forEach(file => {

    let isImage = isUrlImage(file.src)

    //Create string of tags and instances
    let imageTagsText = ''
    let instancesText = '<strong>Instances:</strong>(' + file.instances.length + ')<ul>'

    if (file._src)
      imageTagsText += "Original URL: <strong>" + file._src + '</strong><br>'
    Object.keys(file.tags).forEach(i => imageTagsText += "" + i + ": <strong>" + file.tags[i] + "</strong><br>")
    if (imageTagsText.length > 0)
      imageTagsText = imageTagsText.substr(0, imageTagsText.length - 4) + '<hr>'

    file.instances.forEach(i => {
      instancesText += '<li><a href="' + i.foundOn + '" target="_blank">' + i.foundOn + '</a><ul>'
      if (i.alt)
        instancesText += '<li>Alt: <strong>' + i.alt + '</strong></li>'
      Object.keys(i.tags).forEach(i1 => instancesText += i.tags[i1] ? "<li>" + i1 + ": <strong>" + i.tags[i1] + "</strong></li>" : '')
      instancesText += '</ul></li>'
    })
    instancesText += '</ul>'

    //Add to HTML to html string for the item
    html += `
        <div class="view-row">
            <div class="select">
            <input type="checkbox">
          </div>
          <div class="image">`
    if (isImage)
      html += '<img src="' + file.src + '">'
    else html += getFAIcon(file.src)
    html += `</div>
          <div class="link">`+
      '<p>' + file.src + '</p>' +
      `</div>
       <div class="tools">
         <a class="goto" target="_blank" href="` + file.src + `" title="Open Image"><i class="fas fa-external-link-alt"></i></a>
         <a class="download" href="`+ file.src + `" title="Download Image"><i class="fas fa-file-download"></i></a>
         </div>
         <div class="info">
         <div class="hover-popup-icon">
            <span class="fa-stack fa-1x">
              <i class="fas fa-square fa-stack-2x"></i>
              <i class="fas fa-info fa-stack-1x fa-inverse"></i>
            </span>
                <div class="hover-popup">` +
      imageTagsText +
      instancesText +
      `</div>
      </div>
              </div>
       </div>
     </div>
     `
  })
  //Add html to page
  if (html.length > 0)
    wrapper.innerHTML = html
  else
    wrapper.innerHTML = `<div class="empty-row">There are no items here.</div>`

}

/**
* Function to create a link object from an element
* @param {string} url - The url location of where this element was
* @param {Element} element - The element to create the link from
*/
function createLinkObject(url, element) {

  //Create the link object
  let link = {
    href: element.href || element.src || '',
    tags: { tag: element.tagName.toLowerCase() }
  }
  link.instances = [{
    title: element.title,
    text: element.text,
    tags: {},
    foundOn: url
  }]

  //Check if the element is opening a new tab
  if (element.target == "_blank")
    link.instances[0].tags.isNewTab = true

  if (link.href.indexOf("#") >= 0)
    link.tags.isAnchor = true

  link._href = link.href.replace(chromeExtensionRegex, '/')
  link.href = formatLink(url, link.href)

  if (isUrlLocal(link.href))
    link.tags.isLocal = true

  return link;
}

/**
* Function to create an asset object from a link
* @param {string} url - The url location of where this element was
* @param {string} link - The link to the asset
*/
function createAssetObject(url, link) {
  //Create the asset object
  let asset = {
    link,
    tags: {}
  }
  asset.instances = [{
    alt: link?.title,
    tags: {},
    foundOn: url
  }]

  //If it's script or css
  if (isUrlScript(link))
    asset.tags.isScript = true
  if (isUrlStyleSheet(link))
    asset.tags.isStyleSheet = true

  asset._link = asset.link.replace(chromeExtensionRegex, '/')
  asset.link = formatLink(url, asset.link)

  if (isUrlLocal(asset.link))
    asset.tags.isLocal = true

  return asset;
}

/**
* Function to create an Image Object from an element/link
* @param {string} url - The url location of where this element was
* @param {Element} element - The element to create the image from (Optional)
* @param {string} link - The link to the image - Will only use if element is null
*/
function createImageObject(url, element, src) {

  //Create the image object
  let image = {
    src: element?.src || element?.getAttribute("data-src") || src,
    tags: {}
  }
  image.instances = [{
    tags: {},
    foundOn: url
  }]

  image._src = image.src.replace(chromeExtensionRegex, '/')
  image.src = formatLink(url, image.src)

  if (isUrlLocal(image.src))
    image.tags.isLocal = true

  return image
}

const getPages = () => crawl.all.links.filter(link => isUrlLocal(link.href) && isUrlHTMLFile(link.href) && !isUrlAnchor(link.href) && !isUrlScript(link.href) && !isUrlStyleSheet(link.href))
const getLinks = () => crawl.all.links.filter(link => (isUrlHTMLFile(link.href) && !isUrlLocal(link.href)) || isUrlAnchor(link.href) || isUrlProtocol(link.href))
const getFiles = () => crawl.all.links.filter(link => !isUrlHTMLFile(link.href) && !isUrlProtocol(link.href))