//Crawled Pages
let crawl = { all: { images: [], links: [], assets: [] } }
//Track lastHTML to show what has changed
let lastCounts = { pages: 0, assets: 0, links: 0, files: 0, images: 0 }


//Regex for Chrome Extension
let chromeExtensionRegex = new RegExp(/(chrome-extension:\/\/)\w*\//g)
//Regex for background style

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
  document.querySelector(".popup-outerWrapper").addEventListener("click", event => {
    if (document.querySelector(".popup-outerWrapper") == event.target)
      document.querySelector(".popup.active").classList.remove("active")
  })

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
  document.querySelectorAll(".view-items").forEach(item => {
    observer.observe(item, { childList: true })
  })

})

async function crawlURL(url) {

  //Update Overview with crawling info, and show loading
  document.querySelector("#crawlingSiteText").innerHTML = url
  document.querySelector("#crawling").classList.add("active")

  //Remove Trailing /
  if (url.lastIndexOf('/') == url.length - 1)
    url = url.substr(0, url.length - 1)

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
        links,
        images,
        assets
      }

      //If this is the first time it's been crawled, add it to the list of pages
      page.links.forEach(link => { if (!crawl.all.links.find(i => i.href == link.href)) crawl.all.links.push(link) })
      page.images.forEach(image => { if (!crawl.all.images.find(i => i.src == image.src)) crawl.all.images.push(image) })
      page.assets.forEach(asset => { if (!crawl.all.assets.find(i => i.link == asset.link)) crawl.all.assets.push(asset) })

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

      updateAll()

    }).catch(error => {
      console.log(error)
    })

  //Remove Crawling overlay after 0.5s
  setTimeout(function () {
    document.querySelector("#crawling").classList.remove("active")
  }, 500)
}


function updateAll() {

  //If more than one item is selected, show the multi-item wrapper
  document.querySelectorAll(".view .view-items .select input").forEach(i => i.addEventListener("click", function () {
    if (Array.from(document.querySelectorAll(".view.active .view-items .select input")).filter(i => i.checked).length >= 2)
      document.querySelector(".view.active .multi-wrapper").classList.add("active")
    else
      document.querySelector(".view.active .multi-wrapper").classList.remove("active")
  }))

  //Add download event to all view items that have a download icon
  //TODO: Add option in settings to enable if localizing (fetching and adding to HTML File) of assets is wanted
  document.querySelectorAll(".view .view-items .download").forEach(element => element.addEventListener("click", event => {
    event.preventDefault()
    let url = event.target.parentNode.href
    let name = url.substr(url.indexOf("://") + 3)
    if (name.indexOf("/") >= 0)
      name = name.substr(name.indexOf("/") + 1)
    name = name.replace(nonWordRegex, '_')
    if (!name || name.length == 0)
      name = "index.html"
    chrome.downloads.download({ url: url, filename: name })
  }))

  //Add crawl event to all view items that have a crawl icon
  document.querySelectorAll(".view .view-items .crawl").forEach(element => element.addEventListener("click", event => {
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
  }))
}
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
      let instancesText = ''
      linkTagsText += "<strong>Original URL</strong>: " + link._href + '<br>'

      //No need to display isLocal if it's a page
      Object.keys(link.tags).forEach(i => linkTagsText += i != "isLocal" ? "<strong>" + i + "</strong>: " + link.tags[i] + "<br>" : '')
      if (linkTagsText.length > 0)
        linkTagsText = linkTagsText.substr(0, linkTagsText.length - 4) + '<hr>'

      //Add all instances to the instance string
      link.instances.forEach(i => {
        instancesText += '<strong>' + i.foundOn + '</strong><br>'
        if (i.title)
          instancesText += '&nbsp;&nbsp;&nbsp;<strong>Title</strong>: ' + i.title + '<br>'
        if (i.text)
          instancesText += '&nbsp;&nbsp;&nbsp;<strong>Text</strong>: ' + i.text + '<br>'
        Object.keys(i.tags).forEach(i1 => instancesText += i.tags[i1] ? "&nbsp;&nbsp;&nbsp;<strong>" + i1 + "</strong>: " + i.tags[i1] + "<br>" : '')
        instancesText += '<hr>'
      })

      if (instancesText.length > 0)
        instancesText = instancesText.substr(0, instancesText.length - 8)

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
        '<a class="inspect" href="#" title="Inspect Page" data-link="' + link.href + '"><i class="fas fa-search"></i></a>' +
        '<a class="goto" target="_blank" href="`+ link.href + `" title="Go to page"><i class="fas fa-external-link-alt"></i></a>'
      if (!link.isCrawled)
        html += '<a class="crawl" target="_blank" href="#" data-link="' + link.href + '" title="Crawl page"><i class="fas fa-sitemap"></i></a>'
      html +=
        `</div>
          <div class="info">
            <div class="hover-popup-icon">
            <span class="fa-stack fa-1x">
            <i class="fas fa-square fa-stack-2x"></i>
            <i class="fas fa-info fa-stack-1x fa-inverse"></i>
          </span>
              <div class="hover-popup">
                <p>` + linkTagsText + `</p>
                <p>` + instancesText + `</p>
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

  //Add click event for the inspect icon
  //TODO: Finish Popup, and decide if I want a popup per view-row or just a single one that needs to be updated on click
  document.querySelectorAll(".view .view-items .inspect").forEach(element => element.addEventListener("click", event => {
    event.preventDefault()
    let url = event.target.parentNode.getAttribute("data-link")

    document.querySelector(".popup").classList.add("active")

  }))
}
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
    let instancesText = ''
    if (link.tags.isLocal)
      linkTagsText += "<strong>Original URL</strong>: " + link._link + '<br>'

    Object.keys(link.tags).forEach(i => linkTagsText += i != "isLocal" ? "<strong>" + i + "</strong>: " + link.tags[i] + "<br>" : '')
    if (linkTagsText.length > 0)
      linkTagsText = linkTagsText.substr(0, linkTagsText.length - 4) + '<hr>'

    //Add all instances to the instance string
    link.instances.forEach(i => {
      instancesText += '<strong>' + i.foundOn + '</strong><br>'
      Object.keys(i.tags).forEach(i1 => instancesText += i.tags[i1] ? "&nbsp;&nbsp;&nbsp;<strong>" + i1 + "</strong>: " + i.tags[i1] + "<br>" : '')
      instancesText += '<hr>'
    })

    if (instancesText.length > 0)
      instancesText = instancesText.substr(0, instancesText.length - 8)

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
              <div class="hover-popup">
                <p>` + linkTagsText + `</p>
                <p>` + instancesText + `</p>
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
      let instancesText = ''

      if (link.tags.isLocal)
        linkTagsText += "<strong>Original URL</strong>: " + link._href + '<br>'
      Object.keys(link.tags).forEach(i => linkTagsText += "<strong>" + i + "</strong>: " + link.tags[i] + "<br>")
      if (linkTagsText.length > 0)
        linkTagsText = linkTagsText.substr(0, linkTagsText.length - 4) + '<hr>'

      //Add all instances to the instance string
      link.instances.forEach(i => {
        instancesText += '<strong>' + i.foundOn + '</strong><br>'
        if (i.title)
          instancesText += '&nbsp;&nbsp;&nbsp;<strong>Title</strong>: ' + i.title + '<br>'
        if (i.text)
          instancesText += '&nbsp;&nbsp;&nbsp;<strong>Text</strong>: ' + i.text + '<br>'
        Object.keys(i.tags).forEach(i1 => instancesText += i.tags[i1] ? "&nbsp;&nbsp;&nbsp;<strong>" + i1 + "</strong>: " + i.tags[i1] + "<br>" : '')
        instancesText += '<hr>'
      })

      if (instancesText.length > 0)
        instancesText = instancesText.substr(0, instancesText.length - 8)

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
        '<p>' + linkTagsText + '</p>' +
        '<p>' + instancesText + '</p>' +
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
      let instancesText = ''

      if (link.tags.isLocal)
        linkTagsText += "<strong>Original URL</strong>: " + link._href + '<br>'
      Object.keys(link.tags).forEach(i => linkTagsText += "<strong>" + i + "</strong>: " + link.tags[i] + "<br>")
      if (linkTagsText.length > 0)
        linkTagsText = linkTagsText.substr(0, linkTagsText.length - 4) + '<hr>'

      //Add all instances to the instance string
      link.instances.forEach(i => {
        instancesText += '<strong>' + i.foundOn + '</strong><br>'
        if (i.title)
          instancesText += '&nbsp;&nbsp;&nbsp;<strong>Title</strong>: ' + i.title + '<br>'
        if (i.text)
          instancesText += '&nbsp;&nbsp;&nbsp;<strong>Text</strong>: ' + i.text + '<br>'
        Object.keys(i.tags).forEach(i1 => instancesText += i.tags[i1] ? "&nbsp;&nbsp;&nbsp;<strong>" + i1 + "</strong>: " + i.tags[i1] + "<br>" : '')
        instancesText += '<hr>'
      })

      if (instancesText.length > 0)
        instancesText = instancesText.substr(0, instancesText.length - 8)

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
        '<p>' + linkTagsText + '</p>' +
        '<p>' + instancesText + '</p>' +
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
function updateImages() {
  //Hide Multi-wrapper if view is updated
  document.querySelector("#images .multi-wrapper").classList.remove("active")

  //Iterate all images in the crawl object adding to the HTML string
  let wrapper = document.querySelector("#images .view-items")
  let html = ''

  crawl.all.images.forEach(image => {

    //Create string of tags and instances
    let imageTagsText = ''
    let instancesText = ''

    Object.keys(image.tags).forEach(i => imageTagsText += "<strong>" + i + "</strong>: " + image.tags[i] + "<br>")
    image.instances.forEach(i => {
      instancesText += '<strong>' + i.foundOn + '</strong><br>'
      if (i.alt)
        instancesText += '&nbsp;&nbsp;&nbsp;<strong>Alt</strong>: ' + i.alt + '<br>'
      Object.keys(i.tags).forEach(i1 => instancesText += i.tags[i1] ? "&nbsp;&nbsp;&nbsp;<strong>" + i1 + "</strong>: " + i.tags[i1] + "<br>" : '')
      instancesText += '<br>'
    })

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
         <a class="download" href="`+ image.src + `" title="Download Image"><i class="fas fa-file-download"></i></a>
         </div>
         <div class="info">
         <div class="hover-popup-icon">
            <span class="fa-stack fa-1x">
              <i class="fas fa-square fa-stack-2x"></i>
              <i class="fas fa-info fa-stack-1x fa-inverse"></i>
            </span>
                <div class="hover-popup">` +
      '<p>' + imageTagsText + '<br></p>' +
      '<p>' + instancesText + '</p>' +
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
* @param {url} url - The url location of where this element was
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
  }
  return link;
}
/*
* Function to create an asset object from a link
* @param {url} url - The url location of where this element was
* @param {link} link - The link to the asset
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
* @param {url} url - The url location of where this element was
* @param {Element} element - The element to create the image from (Optional)
* @param {link} link - The link to the image - Will only use if element is null
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