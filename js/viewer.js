//Crawled Pages
let crawl = { all: { images: [], links: [], assets: [] } }
//Track lastHTML to show what has changed
let lastCounts = { pages: 0, assets: 0, links: 0, files: 0, images: 0 }

let crawling = []

//Regex for Chrome Extension
let chromeExtensionRegex = new RegExp(/(chrome-extension:\/\/)\w*\//g)
//Regex for background or background-image style
let urlRegex = new RegExp(/background(-image)?\s*:(.*?)(url)\(\s*(\'|")?(?<image>.*?)\3?(\'|")?\s*\)/g)
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

  //Crawl base url
  let baseURL = window.tabURL ?? 'https://Bimmr.com'
  document.querySelector("#crawledSiteText").innerHTML = baseURL
  crawlURL(baseURL)


  //Sidebar controls
  document.querySelectorAll(".sidebar-item").forEach(item => item.addEventListener("click", event => {
    document.querySelectorAll(".sidebar-item.active, .view.active").forEach(activeItem => activeItem.classList.remove("active"))
    item.classList.add("active")
    item.querySelector(".newContent")?.classList.remove("active")
    let view = item.querySelector("p").innerHTML.toLowerCase()
    document.querySelector(".view#" + view)?.classList.add("active")
  }))

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
  document.querySelectorAll(".view-title .select").forEach(item => item.addEventListener("click", event => {
    let view = item.parentNode.parentNode
    view.querySelectorAll(".view-items .select input").forEach(item => item.click())
  }))

  //Download all button
  document.querySelectorAll(".downloadSelected").forEach(item => item.addEventListener("click", event => {
    let items = document.querySelectorAll(".view.active .view-items .select input:checked")
    items.forEach(item => item.parentNode.parentNode.querySelector("a.download i").click())
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
    console.log(state)
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
      if (mutation.target.children.length != lastCounts[view]) {
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

/*
* Function to crawl the URL for images, links, scripts, and stylesheets
* @param {string} url - The url to crawl
*/
async function crawlURL(url) {

  //Update Overview with crawling info, and show loading
  if (crawling.length == 0)
    document.querySelector("#crawlingSiteText").innerHTML = url
  document.querySelector("#crawling").classList.add("active")

  //Remove Trailing /
  if (url.lastIndexOf('/') == url.length - 1)
    url = url.substr(0, url.length - 1)

  crawling.push(url)

  fetch(url)
    .then(res => {
      if (res.ok) return res.text()
      else throw new Error(res.error)
    })
    .then(data => {

      let type = "html"

      //If crawling a CSS page, add style tags to the page
      if (url.indexOf(".css") == url.length - 4) {
        data = "<style>" + data + "</style>"
        type = "css"
      }

      //If crawling a JS page, add script tags to the page
      if (url.indexOf(".js") == url.length - 3) {
        data = "<script>" + data + "</script>"
        type = "js"
      }

      // Get doc from fetched page data
      let doc = (new DOMParser()).parseFromString(data, "text/html")

      //Init lists
      let links = []
      let images = []
      let assets = []

      //Basic a tag - get link and add to crawl all list, but if already found add as an instance
      doc.querySelectorAll("a").forEach(element => {
        let link = createLinkObject(url, element)
        let found
        if (!(found = links.find(i => i.href == link.href))) {
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
        if (!(found = images.find(i => i.src == image.src)))
          images.push(image)
        else
          found.instances.push({
            foundOn: url,
            alt: image.instances[0].alt,
            tags: { isNewTab: image.instances[0].tags.isNewTab }
          })
      })

      //Background Image styles - get image and add to crawl all list, but if already found add as an instance
      doc.querySelectorAll('*[style*="background"]').forEach(element => {
        if (element.style.cssText.match(urlRegex)) {
          let src = urlRegex.exec(element.style.cssText).groups.image.replace(chromeExtensionRegex, '/').replace('viewer.html', '')
          urlRegex.lastIndex = 0;
          let image = createImageObject(url, null, src)
          let found
          if (isUrlImage(image.src))
            if (!(found = images.find(i => i.src == image.src))) {
              image.instances[0].alt = element.alt || element.title
              image.instances[0].tags.isBackground = true
              image.instances[0].tags.isInline = true
              images.push(image)
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
      doc.querySelectorAll('style').forEach(element => {
        if (element.innerHTML.match(urlRegex))
          element.innerHTML.match(urlRegex).forEach(style => {
            let src = urlRegex.exec(style).groups.image.replace(chromeExtensionRegex, '/').replace('viewer.html', '')
            urlRegex.lastIndex = 0
            let found
            let image = createImageObject(url, null, src)
            if (isUrlImage(image.src))
              if (!(found = images.find(i => i.src == image.src))) {
                image.instances[0].alt = element.alt || element.title
                image.instances[0].tags.isBackground = true
                image.instances[0].tags.isInStyleTag = true
                images.push(image)
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
      doc.querySelectorAll('script').forEach(element => {

        //Look for BackgroundImages
        if (element.innerHTML.match(urlRegex))
          element.innerHTML.match(urlRegex).forEach(style => {
            let src = urlRegex.exec(style).groups.image.replace(chromeExtensionRegex, '/').replace('viewer.html', '')
            urlRegex.lastIndex = 0
            let image = createImageObject(url, null, src)
            let found
            if (isUrlImage(image.src))
              if (!(found = images.find(i => i.src == image.src))) {
                image.instances[0].alt = element.alt || element.title
                image.instances[0].tags.isBackground = true
                image.instances[0].tags.isInScriptTag = true
                images.push(image)
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
        links: links.sort(sortLinks),
        images,
        assets
      }

      //For Links - add link to crawl all list or add to instance if already crawled
      page.links.forEach(link => {
        if (!crawl.all.links.find(i => i.href == link.href)) crawl.all.links.push(link)
        else {
          let instances = crawl.all.links.find(i => i.href == link.href).instances
          crawl.all.links.find(i => i.href == link.href).instances = [...instances, ...link.instances]
        }
      })
      //For images - add link to crawl all list or add to instance if already crawled
      page.images.forEach(image => {
        if (!crawl.all.images.find(i => i.src == image.src)) crawl.all.images.push(image)
        else {
          let instances = crawl.all.images.find(i => i.src == image.src).instances
          crawl.all.images.find(i => i.src == image.src).instances = [...instances, ...image.instances]
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
      crawl.all.links.sort(sortLinks)

      //Perform updates
      updatePages()
      updateAssets()
      updateLinks()
      updateFiles()
      updateImages()
      updateOverview()

      //Update Listeners
      updateAll()

      //find and remove element from array
      let index = crawling.indexOf(url)
      if (index > -1) crawling.splice(index, 1)

      //Remove Crawling overlay if not crawling anything else, otherwise update crawling text to the next thing thats been crawling the longest
      if (crawling.length == 0)
        document.querySelector("#crawling").classList.remove("active")
      else
        document.querySelector("#crawlingSiteText").innerHTML = crawling[0]

    }).catch(error => {
      console.log(error)

      //find and remove element from array
      let index = crawling.indexOf(url)
      if (index > -1) crawling.splice(index, 1)

      //Remove crawling overlay if not crawling anything else
      if (crawling.length == 0)
        document.querySelector("#crawling").classList.remove("active")
    })
}

/*
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

  //Add download event to all view-items that have a download icon
  //TODO: Add option in settings to enable if localizing (fetching and adding to HTML File) of assets is wanted
  document.querySelectorAll(".view-items .download").forEach(element => {
    element.onclick = event => {
      event.preventDefault()
      //Get url to download
      let url = event.target.parentNode.href
      //get file name removing the http(s)://
      let name = url.substr(url.indexOf("://") + 3)
      //If still containing a /, start the string after that
      if (name.indexOf("/") >= 0)
        name = name.substr(name.indexOf("/") + 1)
      //Replace any remaining / with double _ then replace all non alphanumeric characters with single _
      name = name.replace("/", "__").replace(nonWordRegex, '_')
      //If the name is empty, assume you're downloading the home page
      if (!name || name.length == 0)
        name = "index.html"
      //If there is no extension, add .html
      if (name.indexOf(".") < 0)
        name += ".html"
      //Download the file
      chrome.downloads.download({ url: url })
    }
  })

  //Add crawl event to all view-items that have a crawl icon
  document.querySelectorAll(".view-items .crawl").forEach(element => {
    element.onclick = event => {
      event.preventDefault()
      let url = event.target.parentNode.getAttribute("data-link")

      //Check if the item being crawled is an HTML page or an asset
      if (isUrlHTML(url))
        crawl.all.links[crawl.all.links.findIndex(i => i.href == url)].isCrawled = true
      else
        crawl.all.assets[crawl.all.assets.findIndex(i => i.link == url)].isCrawled = true

      //Remove Crawl Icon
      event.target.parentNode.remove()
      crawlURL(url)
    }
  })
}

/*
* Function to update the Overview view
*/
function updateOverview() {

  //Get count of view-rows in each view
  let targetCount = [
    document.querySelectorAll("#pages .view-row").length,
    document.querySelectorAll("#assets .view-row").length,
    document.querySelectorAll("#links .view-row").length,
    document.querySelectorAll("#files .view-row").length,
    document.querySelectorAll("#images .view-row").length
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

/*
* Function to update the Pages view
*/
function updatePages() {
  //Hide Multi-wrapper if view is updated
  document.querySelector("#pages .multi-wrapper").classList.remove("active")

  //Get view wrapper
  let wrapper = document.querySelector("#pages .view-items")

  //Iterate all links in the crawl object adding to the HTML string
  let html = ''
  crawl.all.links.forEach(link => {
    //Pages should only contain local HTML links but not anchors
    if (link.tags.isLocal && isUrlHTML(link.href) && !isUrlAnchor(link.href) && link.href != "/") {

      //Create string of tags and instances
      let linkTagsText = ''
      let instancesText = '<strong>Instances:</strong><ul>'
      linkTagsText += "Original URL: <strong>" + link._href + '</strong><br>'

      //No need to display isLocal if it's a page
      Object.keys(link.tags).forEach(i => linkTagsText += i != "isLocal" ? "" + i + ": <strong>" + link.tags[i] + "</strong><br>" : '')
      if (linkTagsText.length > 0)
        linkTagsText = linkTagsText.substr(0, linkTagsText.length - 4) + '<hr>'

      //Add all instances to the instance string
      link.instances.forEach(i => {
        instancesText += '<li>' + i.foundOn + '<ul>'
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
      if (!link.isCrawled)
        html += '<a class="crawl" target="_blank" href="#" data-link="' + link.href + '" title="Crawl page"><i class="fas fa-sitemap"></i></a>'
      else {
        html += '<a class="inspect" href="#" title="Inspect Page" data-link="' + link.href + '"><i class="fas fa-search"></i></a>'
      }
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
    }
  })
  //Add html to page
  if (html.length > 0)
    wrapper.innerHTML = html
  else
    wrapper.innerHTML = `<div class="empty-row">There are no items here.</div>`

  //Add click event for the inspect icon
  //TODO: Finish Popup, and decide if I want a popup per view-row or just a single one that needs to be updated on click
  document.querySelectorAll(".view .view-items .inspect").forEach(element => element.addEventListener("click", event => {
    event.preventDefault()
    let url = event.target.parentNode.getAttribute("data-link")
    setupPopup(url)
    document.querySelector(".popup").classList.add("active")
  }))
}

/* 
* Function to setup the popup according to the url
* @param {string} url - The url to setup the popup for
*/
function setupPopup(url) {

  //Remove any trailing /
  if (url.lastIndexOf("/") == url.length - 1)
    url = url.substr(0, url.length - 1)

  // Get the popup and the crawled object to inspect
  let popup = document.querySelector("#popup")
  let page = crawl[url]

  //Add popup content
  popup.querySelector(".card-title").innerHTML = '<h2>' + page.title + '</h2>' + '<h3>' + url + '<br><br></h3>'

  let html = { links: '', files: '', assets: '', images: '' }
  let htmlIndex = 'images'

  //Loop through all links and assets
  let items = [...page.links, ...page.assets]
  items.forEach(link => {

    let href = link.href ? link.href : link.link

    let isAsset = link.link ? true : false
    let isLocalPage = link.tags.isLocal && !isUrlAnchor(href)

    htmlIndex = 'images'

    //Check if it's an asset
    if (isAsset)
      htmlIndex = 'assets';

    //Files are only if the link isn't a HTML page or a protocol link
    else if (!isUrlHTML(href) && !isUrlProtocol(href))
      htmlIndex = 'files';

    //Links are only if not local or is an anchor link
    else
      htmlIndex = 'links';

    //Create string of tags and instances
    let linkTagsText = ''
    let instancesText = '<strong>Instances:</strong><ul>'

    if (link.tags.isLocal)
      linkTagsText += "Original URL: <strong>" + link._href + '</strong><br>'
    Object.keys(link.tags).forEach(i => linkTagsText += "" + i + ": <strong>" + link.tags[i] + "</strong><br>")
    if (linkTagsText.length > 0)
      linkTagsText = linkTagsText.substr(0, linkTagsText.length - 4) + '<hr>'

    //Add all instances to the instance string
    link.instances.forEach(i => {
      instancesText += '<li>' + i.foundOn + '<ul>'
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
      (isLocalPage && !isAsset ? '<i class="far fa-file"></i>' : getURLIcon(href)) +
      `</div>
            <div class="link">`+
      '<p>' + href + '</p>' +
      `</div>
        <div class="tools">`+
      '<a class="goto" target="_blank" href="' + href + '" title="Go to link"><i class="fas fa-external-link-alt"></i></a>'
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
  page.images.forEach(image => {

    //Create string of tags and instances
    let imageTagsText = ''
    let instancesText = '<strong>Instances:</strong><ul>'

    Object.keys(image.tags).forEach(i => imageTagsText += "" + i + ": <strong>" + image.tags[i] + "</strong><br>")
    if (imageTagsText.length > 0)
      imageTagsText = imageTagsText.substr(0, imageTagsText.length - 4) + '<hr>'

    image.instances.forEach(i => {
      instancesText += '<li>' + i.foundOn + '<ul>'
      if (i.alt)
        instancesText += '<li>Alt: <strong>' + i.alt + '</strong></li>'
      Object.keys(i.tags).forEach(i1 => instancesText += i.tags[i1] ? "<li>" + i1 + ": <strong>" + i.tags[i1] + "</strong></li>" : '')
      instancesText += '</ul></li>'
    })
    instancesText += '</ul>'

    //Add to HTML to html string for the item
    html.images += `
        <div class="view-row">
           
          <div class="image">`+
      '<img src="' + image.src + '">' +
      `</div>
          <div class="link">`+
      '<p>' + image.src + '</p>' +
      `</div>
       <div class="tools">
        <a class="goto" target="_blank" href="` + image.src + `" title="Open Image"><i class="fas fa-external-link-alt"></i></a>
         <a class="download" href="`+ image.src + `" title="Download Image"><i class="fas fa-file-download"></i></a>
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

  if (html.images.length == 0)
    html.images = '<div class="empty-row">There are no items here.</div>'
  popup.querySelector("#popup-view-images .view-items").innerHTML = html.images

  //UpdateAll to make sure goto and download icons are activated
  updateAll()
}

/*
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
    let instancesText = '<strong>Instances:</strong><ul>'
    if (link.tags.isLocal)
      linkTagsText += "Original URL: <strong>" + link._link + '</strong><br>'

    Object.keys(link.tags).forEach(i => linkTagsText += i != "isLocal" ? "" + i + ": <strong>" + link.tags[i] + "</strong><br>" : '')
    if (linkTagsText.length > 0)
      linkTagsText = linkTagsText.substr(0, linkTagsText.length - 4) + '<hr>'

    //Add all instances to the instance string
    link.instances.forEach(i => {
      instancesText += '<li>' + i.foundOn + '<ul>'
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
      getURLIcon(link.link) +
      `</div>
          <div class="link">
            <p>` + link.link + `</p>
          </div>
          <div class="tools">
            <a class="download" href="`+ link.link + `" title="Download Page"><i class="fas fa-file-download"></i></a>`
    if (!link.isCrawled && (isUrlScript(link.link) || isUrlStyleSheet(link.link)))
      html += '<a class="crawl" target="_blank" href="#" data-link="' + link.link + '" title="Crawl page"><i class="fas fa-sitemap"></i></a>'
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

/*
* Function to update the Links view
*/
function updateLinks() {
  //Hide Multi-wrapper if view is updated
  let wrapper = document.querySelector("#links .view-items")

  //Iterate all links in the crawl object adding to the HTML string
  let html = ''
  crawl.all.links.forEach(link => {
    //Links are only if not local or is an anchor link
    if (!link.tags.isLocal || isUrlAnchor(link.href)) {

      //Create string of tags and instances
      let linkTagsText = ''
      let instancesText = '<strong>Instances:</strong><ul>'

      if (link.tags.isLocal)
        linkTagsText += "Original URL: <strong>" + link._href + '</strong><br>'
      Object.keys(link.tags).forEach(i => linkTagsText += "" + i + ": <strong>" + link.tags[i] + "</strong><br>")
      if (linkTagsText.length > 0)
        linkTagsText = linkTagsText.substr(0, linkTagsText.length - 4) + '<hr>'

      //Add all instances to the instance string
      link.instances.forEach(i => {
        instancesText += '<li>' + i.foundOn + '<ul>'
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
          <!--<div class="select">
            <input type="checkbox">
          </div>-->
          <div class="type">`+
        getURLIcon(link.href) +
        `</div>
            <div class="link">`+
        '<p>' + link.href + '</p>' +
        `</div>
        <div class="tools">
          <a class="goto" target="_blank" href="`+ link.href + `" title="Go to link"><i class="fas fa-external-link-alt"></i></a>
          </div>
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
    }
  })
  //Add html to page
  if (html.length > 0)
    wrapper.innerHTML = html
  else
    wrapper.innerHTML = `<div class="empty-row">There are no items here.</div>`
}

/* 
* Function to update the Files view
*/
function updateFiles() {
  //Hide Multi-wrapper if view is updated
  document.querySelector("#files .multi-wrapper").classList.remove("active")

  //Iterate all links in the crawl object adding to the HTML string
  let wrapper = document.querySelector("#files .view-items")
  let html = ''
  crawl.all.links.forEach(link => {
    //Files are only if the link isn't a HTML page or a protocol link
    if (!isUrlHTML(link.href) && !isUrlProtocol(link.href)) {

      //Create string of tags and instances
      let linkTagsText = ''
      let instancesText = '<strong>Instances:</strong><ul>'

      if (link.tags.isLocal)
        linkTagsText += "Original URL: <strong>" + link._href + '</strong><br>'
      Object.keys(link.tags).forEach(i => linkTagsText += "" + i + ": <strong>" + link.tags[i] + "</strong><br>")
      if (linkTagsText.length > 0)
        linkTagsText = linkTagsText.substr(0, linkTagsText.length - 4) + '<hr>'

      //Add all instances to the instance string
      link.instances.forEach(i => {
        instancesText += '<li>' + i.foundOn + '<ul>'
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
        getURLIcon(link.href) +
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
    }
  })
  //Add html to page
  if (html.length > 0)
    wrapper.innerHTML = html
  else
    wrapper.innerHTML = `<div class="empty-row">There are no items here.</div>`
}

/*
* Function to update Image View
*/
function updateImages() {
  //Hide Multi-wrapper if view is updated
  document.querySelector("#images .multi-wrapper").classList.remove("active")

  //Iterate all images in the crawl object adding to the HTML string
  let wrapper = document.querySelector("#images .view-items")
  let html = ''

  crawl.all.images.forEach(image => {

    //Create string of tags and instances
    let imageTagsText = ''
    let instancesText = '<strong>Instances:</strong><ul>'


    Object.keys(image.tags).forEach(i => imageTagsText += "" + i + ": <strong>" + image.tags[i] + "</strong><br>")
    if (imageTagsText.length > 0)
      imageTagsText = imageTagsText.substr(0, imageTagsText.length - 4) + '<hr>'

    image.instances.forEach(i => {
      instancesText += '<li>' + i.foundOn + '<ul>'
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
          <div class="image">`+
      '<img src="' + image.src + '">' +
      `</div>
          <div class="link">`+
      '<p>' + image.src + '</p>' +
      `</div>
       <div class="tools">
         <a class="goto" target="_blank" href="` + image.src + `" title="Open Image"><i class="fas fa-external-link-alt"></i></a>
         <a class="download" href="`+ image.src + `" title="Download Image"><i class="fas fa-file-download"></i></a>
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

/*
* Function to create a link object from an element
* @param {string} url - The url location of where this element was
* @param {Element} element - The element to create the link from
*/
function createLinkObject(url, element) {
  //Create the link object
  let link = { tags: {} }
  link.href = element.href ? element.href.replace(chromeExtensionRegex, '/').replace('viewer.html', '') : '#'
  link.instances = [{
    title: element.title,
    text: element.text,
    tags: {},
    foundOn: url
  }]

  //Check if the element is opening a new tab
  if (element.target == "_blank")
    link.instances[0].tags.isNewTab = true

  //Check if link is local
  if (isUrlLocal(link.href) || link.href.indexOf(url) == 0) {
    link.tags.isLocal = true
    link._href = link.href;

    //Clean up link by adding the url to the beginning if needed
    while (url.lastIndexOf("/") >= 8)
      url = url.substr(0, url.lastIndexOf("/"))
    link.href = link.href.startsWith("/") ? url + link.href : url + "/" + link.href

    if (link._href == "/") {
      link.isCrawled = true;
      link.tags.isHomePage = true
    }
  }
  return link;
}

/*
* Function to create an asset object from a link
* @param {string} url - The url location of where this element was
* @param {string} link - The link to the asset
*/
function createAssetObject(url, link) {
  //Create the asset object
  let asset = { tags: {} }
  asset.link = link.replace(chromeExtensionRegex, '/')
  asset.instances = [{
    alt: link.title,
    tags: {},
    foundOn: url
  }]
  //Check if the asset link is local
  if (isUrlLocal(asset.link) || asset.link.indexOf(url) == 0) {
    asset.tags.isLocal = true
    asset._link = asset.link;

    //Clean up link by adding the url to the beginning if needed
    while (url.lastIndexOf("/") >= 8)
      url = url.substr(0, url.lastIndexOf("/"))
    asset.link = asset.link.startsWith("/") ? url + asset.link : url + "/" + asset.link
  }
  return asset;
}

/*
* Function to create an Image Object from an element/link
* @param {string} url - The url location of where this element was
* @param {Element} element - The element to create the image from (Optional)
* @param {string} link - The link to the image - Will only use if element is null
*/
function createImageObject(url, element, src) {

  //Create the image object
  let image = { tags: {} }
  image.instances = [{
    tags: {},
    foundOn: url
  }]
  //If the object is being made from an image tag
  if (element) {
    image.src = element.src.replace(chromeExtensionRegex, '/').replace('viewer.html', '')
    image.instances[0].alt = element.alt
  }
  //If the object is being made from a background style tag 
  else {
    image.src = src
  }

  //Check if the image src is local
  if (isUrlLocal(image.src) || image.src.indexOf(url) >= 0) {
    image.tags.isLocal = true
    image._src = image.src;

    //Clean up src by adding the url to the beginning if needed
    if (url.lastIndexOf("/") > 8)
      url = url.substr(0, url.lastIndexOf("/"))
    image.src = image.src.startsWith("/") ? url + image.src : url + "/" + image.src
  }
  return image
}