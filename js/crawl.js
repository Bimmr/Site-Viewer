//Crawled Pages
let crawl = { all: { media: [], links: [], assets: [] } }
//Track whats being crawled
let crawling = []


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
          if (!isUrlHTMLFile(url) || (isUrlHTMLFile(url) && settings.crawl.onPageScripts))
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
      src: element?.src ?? element?.getAttribute("data-src") ?? src ?? '',
      tags: {}
    }
    image.instances = [{
      tags: {},
      foundOn: url,
    }]
    if(element?.alt)
      image.instances[0].alt = element.alt
    
    image._src = image.src.replace(chromeExtensionRegex, '/')
    image.src = formatLink(url, image.src)
  
    if (isUrlLocal(image.src))
      image.tags.isLocal = true
  
    return image
  }  