//TODO: Add settings to control crawling stylesheets and scripts

//Crawled Pages
let crawl = { all: { images: [], links: [], stylesheets: [], scripts: [] } }
let crawlScripts = false
let crawlStyleSheets = true

//Regex for Chrome Extension
let chromeExtensionRegex = new RegExp(/(chrome-extension:\/\/)\w*\//g)
//Regex for background style

//Regex for background or background-image style
let urlRegex = new RegExp(/(background|background-image):\s*url\((.*?)\)/g)
let backgroundReplaceRegex = new RegExp(/(background|background-image):\s*url\(/g)
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
  let baseURL = window.tabURL ?? 'https://Bimmr.com'
  document.querySelector("#crawledSiteText").innerHTML = baseURL
  crawlURL(baseURL)

  //Sidebar controls
  document.querySelectorAll(".sidebar-item").forEach(item => item.addEventListener("click", event => {
    document.querySelectorAll(".sidebar-item.active, .view.active").forEach(activeItem => activeItem.classList.remove("active"))
    item.classList.add("active")
    let view = item.querySelector("p").innerHTML.toLowerCase()
    document.querySelector(".view#" + view)?.classList.add("active")
  }))

  document.querySelectorAll(".view-title .select").forEach(item => item.addEventListener("click", event => {
    let view = item.parentNode.parentNode
    view.querySelectorAll(".view-items .select input").forEach(item => item.click())
  }))
  document.querySelectorAll(".downloadSelected").forEach(item => item.addEventListener("click", event => {
    let items = document.querySelectorAll(".view.active .view-items .select input:checked")
    items.forEach(item => item.parentNode.parentNode.querySelector("a.download i").click())
  }))
  document.querySelectorAll(".crawlSelected").forEach(item => item.addEventListener("click", event => {
    let items = document.querySelectorAll(".view.active .view-items .select input:checked")
    items.forEach(item => item.parentNode.parentNode.querySelector("a.crawl i")?.click())
    document.querySelector(".view.active .view-title .select input:checked").checked = false
  }))
})

async function crawlURL(url) {

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

      if (url.indexOf(".css") == url.length - 4) {
        data = "<style>" + data + "</style>"
        type = "css"
      }

      if (url.indexOf(".js") == url.length - 3) {
        data = "<script>" + data + "</script>"
        type = "js"
      }

      let doc = (new DOMParser()).parseFromString(data, "text/html")

      let links = []
      let images = []

      //Basic a tag
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

      //Basic img tag
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

      //Background Image styles
      doc.querySelectorAll('*[style*="background"]').forEach(element => {
        if (element.style.cssText.match(urlRegex)) {
          let src = element.style.cssText.match(urlRegex)[0].replace(chromeExtensionRegex, '/').replace('viewer.html', '').replace(backgroundReplaceRegex, '').replace(quoteRegex, '')
          src = src.substr(0, src.length - 1)
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

      //Find Background Images hidden in style tags
      doc.querySelectorAll('style').forEach(element => {
        if (element.innerHTML.match(urlRegex))
          element.innerHTML.match(urlRegex).forEach(style => {
            let src = style.match(urlRegex)[0].replace(chromeExtensionRegex, '/').replace('viewer.html', '').replace(backgroundReplaceRegex, '').replace(quoteRegex, '')
            src = src.substr(0, src.length - 1)
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

      //Find Background Images/Links in script tags
      doc.querySelectorAll('script').forEach(element => {
        //Look for BackgroundImages
        if (element.innerHTML.match(urlRegex))
          element.innerHTML.match(urlRegex).forEach(style => {
            let src = element.innerHTML.match(urlRegex)[0].replace(chromeExtensionRegex, '/').replace('viewer.html', '').replace(backgroundReplaceRegex, '').replace(quoteRegex, '')
            src = src.substr(0, src.length - 1)
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

      if (crawlStyleSheets && type == "html")
        doc.querySelectorAll('link').forEach(element => {
          if (element.rel == "stylesheet") {
            let linkSheet = element.href
            linkSheet = linkSheet.replace(chromeExtensionRegex, '/').replace('viewer.html', '')
            if (isUrlLocal(linkSheet))
              linkSheet = url + linkSheet
            if (!crawl.all.stylesheets.find(i => i == linkSheet))
              crawlURL(linkSheet)
            crawl.all.stylesheets.push(linkSheet)
          }
        })
      if (crawlScripts && type == "html")
        doc.querySelectorAll('script').forEach(element => {
          if (element.src) {
            let linkScript = element.src
            linkScript = linkScript.replace(chromeExtensionRegex, '/').replace('viewer.html', '')
            if (isUrlLocal(linkScript))
              linkScript = url + linkScript
            if (!crawl.all.scripts.find(i => i == linkScript))
              crawlURL(linkScript)
            crawl.all.scripts.push(linkScript)
          }
        })

      //Page
      let page = {
        title: doc.querySelector("title")?.innerHTML,
        links,
        images
      }
      page.links.forEach(link => { if (!crawl.all.links.find(i => i.href == link.href)) crawl.all.links.push(link) })
      page.images.forEach(image => { if (!crawl.all.images.find(i => i.src == image.src)) crawl.all.images.push(image) })
      crawl[url] = page
      crawl.all.links.sort(sortLinks)


      updatePages()
      updateLinks()
      updateImages()
      updateFiles()
      updateOverview()

      updateAll()

      console.log(crawl)

    }).catch(error => {
      console.log(url)
      console.log(error)
    })

  setTimeout(function () {
    document.querySelector("#crawling").classList.remove("active")
  }, 500)
}
function updateAll() {

  document.querySelectorAll(".view .view-items .select input").forEach(i => i.addEventListener("click", function () {
    if (Array.from(document.querySelectorAll(".view.active .view-items .select input")).filter(i => i.checked).length >= 2)
      document.querySelector(".view.active .multi-wrapper").classList.add("active")
    else
      document.querySelector(".view.active .multi-wrapper").classList.remove("active")
  }))
}

function updateOverview() {
  let targetCount = [
    document.querySelectorAll("#pages .view-row").length,
    document.querySelectorAll("#links .view-row").length,
    document.querySelectorAll("#files .view-row").length,
    document.querySelectorAll("#images .view-row").length
  ]

  let countElements = document.querySelectorAll("#overview .count")
  for (let i = 0; i < countElements.length; i++) {
    const element = countElements[i]
    const target = targetCount[i]

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
  if (Object.keys(crawl).length - 2 > 0)
    document.querySelector("#crawledSiteCount").innerHTML = '(+' + (Object.keys(crawl).length - 2) + ')'
}
function updatePages() {
  let wrapper = document.querySelector("#pages .view-items")

  let html = ''
  crawl.all.links.forEach(link => {
    if (link.tags.isLocal && isUrlHTML(link.href) && !isUrlAnchor(link.href) && link.href != "/") {

      let linkTagsText = ''
      let instancesText = ''
      linkTagsText += "<strong>Original URL</strong>: " + link._href + '<br>'

      Object.keys(link.tags).forEach(i => linkTagsText += i != "isLocal" ? "<strong>" + i + "</strong>: " + link.tags[i] + "<br>" : '')
      if (linkTagsText.length > 0)
        linkTagsText = linkTagsText.substr(0, linkTagsText.length - 4) + '<hr>'

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

      html += `
        <div class="view-row">
          <div class="select">
            <input type="checkbox">
          </div>
          <div class="link">
            <p>` + link.href + `</p>
          </div>
          <div class="tools">
            <a class="download" href="`+ link.href + `" title="Download Page"><i class="fas fa-file-download"></i></a>
            <a class="goto" target="_blank" href="`+ link.href + `" title="Go to page"><i class="fas fa-external-link-alt"></i></a>`
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
  if (html.length > 0)
    wrapper.innerHTML = html
  else
    wrapper.innerHTML = `<div class="empty-row">There are no items here.</div>`

  document.querySelectorAll("#pages .download").forEach(element => element.addEventListener("click", event => {
    event.preventDefault()
    let url = event.target.parentNode.href
    let name = url.substr(url.indexOf("://")+3)
    if(name.indexOf("/") >= 0)
      name = name.substr(name.indexOf("/")+1)
    name = name.replace(nonWordRegex, '_')
    if(!name || name.length == 0)
      name ="index.html"
    chrome.downloads.download({ url: url, filename: name })
  }))
  document.querySelectorAll("#pages .crawl").forEach(element => element.addEventListener("click", event => {
    event.preventDefault()
    let url = event.target.parentNode.getAttribute("data-link")
    let linkObject = crawl.all.links.findIndex(i => i.href == url)

    crawl.all.links[linkObject].isCrawled = true
    event.target.parentNode.remove()
    crawlURL(url)
  }))

}
function updateLinks() {

  let wrapper = document.querySelector("#links .view-items")
  let html = ''
  crawl.all.links.forEach(link => {
    if (!link.tags.isLocal || isUrlAnchor(link.href)) {

      let linkTagsText = ''
      let instancesText = ''

      if (link.tags.isLocal)
        linkTagsText += "<strong>Original URL</strong>: " + link._href + '<br>'
      Object.keys(link.tags).forEach(i => linkTagsText += "<strong>" + i + "</strong>: " + link.tags[i] + "<br>")
      if (linkTagsText.length > 0)
        linkTagsText = linkTagsText.substr(0, linkTagsText.length - 4) + '<hr>'

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
  if (html.length > 0)
    wrapper.innerHTML = html
  else
    wrapper.innerHTML = `<div class="empty-row">There are no items here.</div>`
}
function updateFiles() {

  let wrapper = document.querySelector("#files .view-items")
  let html = ''
  crawl.all.links.forEach(link => {
    if (!isUrlHTML(link.href) && !isUrlProtocol(link.href)) {

      let linkTagsText = ''
      let instancesText = ''

      if (link.tags.isLocal)
        linkTagsText += "<strong>Original URL</strong>: " + link._href + '<br>'
      Object.keys(link.tags).forEach(i => linkTagsText += "<strong>" + i + "</strong>: " + link.tags[i] + "<br>")
      if (linkTagsText.length > 0)
        linkTagsText = linkTagsText.substr(0, linkTagsText.length - 4) + '<hr>'

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
  if (html.length > 0)
    wrapper.innerHTML = html
  else
    wrapper.innerHTML = `<div class="empty-row">There are no items here.</div>`


  document.querySelectorAll("#files .download").forEach(element => element.addEventListener("click", event => {
    event.preventDefault()

    let url = event.target.parentNode.href
    let name = url.substr(url.indexOf("://")+3)
    if(name.indexOf("/") >= 0)
      name = name.substr(name.indexOf("/")+1)
    name = name.replace(nonWordRegex, '_')
    chrome.downloads.download({ url: url, filename: name })
  }))
}
function updateImages() {
  let wrapper = document.querySelector("#images .view-items")
  let html = ''

  crawl.all.images.forEach(image => {
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
  if (html.length > 0)
    wrapper.innerHTML = html
  else
    wrapper.innerHTML = `<div class="empty-row">There are no items here.</div>`

  document.querySelectorAll("#images .download").forEach(element => element.addEventListener("click", event => {
    event.preventDefault()

    let url = event.target.parentNode.href
    let name = url.substr(url.indexOf("://")+3)
    if(name.indexOf("/") >= 0)
      name = name.substr(name.indexOf("/")+1)
    name = name.replace(nonWordRegex, '_')
    chrome.downloads.download({ url: url, filename: name })
  }))

}

function createLinkObject(url, element) {
  let link = { tags: {} }
  link.href = element.href ? element.href.replace(chromeExtensionRegex, '/').replace('viewer.html', '') : '#'
  link.instances = [{
    title: element.title,
    text: element.text,
    tags: {},
    foundOn: url
  }]

  //Optionals
  if (element.target == "_blank")
    link.instances[0].tags.isNewTab = true

  if (isUrlLocal(link.href) || link.href.indexOf(url) == 0) {
    link.tags.isLocal = true
    link._href = link.href;
    while (url.lastIndexOf("/") >= 8)
      url = url.substr(0, url.lastIndexOf("/"))
    link.href = link.href.startsWith("/") ? url + link.href : url + "/" + link.href
  }
  return link;
}
function createImageObject(url, element, src) {
  let image = { tags: {} }
  image.instances = [{
    tags: {},
    foundOn: url
  }]
  //If being grabbed from an img tag
  if (element) {
    image.src = element.src.replace(chromeExtensionRegex, '/').replace('viewer.html', '')
    image.instances[0].alt = element.alt
  }
  //If being grabbed from a background-image style
  else {
    image.src = src
  }
  if (isUrlLocal(image.src) || image.src.indexOf(url) >= 0) {
    image.tags.isLocal = true
    image._src = image.src;
    if (url.lastIndexOf("/") > 8)
      url = url.substr(0, url.lastIndexOf("/"))
    image.src = image.src.startsWith("/") ? url + image.src : url + "/" + image.src
  }
  return image
}