
//Track lastHTML to show what has changed
let lastCounts = { pages: 1, assets: 1, links: 1, files: 1, media: 1 }

/**
 * Helper function to create a URL with text fragment for scroll-to-text functionality
 * @param {string} baseUrl - The base URL
 * @param {string} text - The text to create a fragment for (e.g., link text, alt text, title)
 * @returns {string} URL with text fragment appended
 */
function createTextFragmentUrl(baseUrl, text) {
  if (!text) return baseUrl
  
  // Encode the text for URL and limit to first 50 characters for reliability
  const textForFragment = encodeURIComponent(text.trim().substring(0, 50))
  return baseUrl + '#:~:text=' + textForFragment
}

//Settings
let settings = {
  crawl: {
    onPageScripts: true,
    onPageStyles: true,
    rateLimitMs: 100,
    corsProxyUrl: 'https://api.allorigins.win/get?url=',
    corsProxyRawUrl: 'https://api.allorigins.win/raw?url='
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

//When DOM is loaded set up the listeners and events
document.addEventListener("DOMContentLoaded", function () {

  // Remove preload class after initial render to enable transitions
  setTimeout(() => {
    document.body.classList.remove("preload")
  }, 100)

  //Prevent Refreshing the popup as that breaks things
  window.onunload = refreshParent;
  function refreshParent() {
    console.log("Refreshing parent window")
    window.close()
  }

  //Load settings from local storage and update settings
  storageGet("settings").then(data => {
    if (data !== null) {
      // Merge with defaults to ensure new fields are present
      settings = {
        crawl: {
          onPageScripts: data.crawl?.onPageScripts !== undefined ? data.crawl.onPageScripts : true,
          onPageStyles: data.crawl?.onPageStyles !== undefined ? data.crawl.onPageStyles : true,
          rateLimitMs: data.crawl?.rateLimitMs !== undefined ? data.crawl.rateLimitMs : 100,
          corsProxyUrl: data.crawl?.corsProxyUrl || 'https://api.allorigins.win/get?url=',
          corsProxyRawUrl: data.crawl?.corsProxyRawUrl || 'https://api.allorigins.win/raw?url='
        },
        combine: data.combine || settings.combine,
        download: data.download || settings.download
      }
      
      // Apply CORS URLs from settings
      if (settings.crawl.corsProxyUrl) {
        CORS_BYPASS_URL = settings.crawl.corsProxyUrl
      }
      if (settings.crawl.corsProxyRawUrl) {
        CORS_BYPASS_URL_RAW = settings.crawl.corsProxyRawUrl
      }
      
      //Settings Controls
      document.querySelectorAll("#settings.view input").forEach(item => {

        let settingGroup = item.id.split("-")[0]
        let setting = item.id.split("-")[1]

        if (item.type === "checkbox")
          item.checked = settings[settingGroup][setting]
        else if (item.type === "text" || item.type === "number")
          item.value = settings[settingGroup][setting]

        if (settings.combine.enabled === true)
          document.querySelector(".combine-settings").classList.toggle("active")
      })
    }
  }).catch(error => {
    console.error("Failed to load settings:", error)
  })

  //Crawl base url
  if (window.tabURL)
    baseUrl = window.tabURL


  let url = new URL(baseUrl)
  hostURL = url.origin
  baseUrl = hostURL + (url.pathname ? url.pathname : '')

  document.querySelector("#crawledSiteText").textContent = baseUrl
  crawlURL(baseUrl)

  let link = createLinkObject(baseUrl, createElementFromHTML(`<a href="${baseUrl}"></a>`))
  link.isCrawled = true
  link.tags.isBaseUrl = true
  crawl.all.links.push(link)

  document.querySelector(".sidebar .sidebar-footer .version").innerHTML = window.version


  //Sidebar controls
  document.querySelectorAll(".sidebar-item").forEach(item => item.addEventListener("click", event => {
    const previousActive = document.querySelector(".view.active")
    const previousSidebarItem = document.querySelector(".sidebar-item.active")
    
    const newActiveView = document.querySelector(".view#" + item.querySelector("p").innerHTML.toLowerCase())
    
    // Update sidebar active states
    document.querySelectorAll(".sidebar-item.active").forEach(activeItem => activeItem.classList.remove("active"))
    item.classList.add("active")
    item.querySelector(".newContent")?.classList.remove("active")
    
    // Handle view transitions
    if (previousActive && previousActive !== newActiveView && previousSidebarItem) {
      const allSidebarItems = Array.from(document.querySelectorAll(".sidebar-item"))
      const previousIndex = allSidebarItems.indexOf(previousSidebarItem)
      const newIndex = allSidebarItems.indexOf(item)
      const isMovingForward = newIndex > previousIndex
      
      // Clean up any existing transition classes
      document.querySelectorAll(".view").forEach(v => {
        v.classList.remove("slide-in-left", "slide-in-right", "slide-out-left", "slide-out-right")
      })
            
      // Apply transitions
      requestAnimationFrame(() => {
        previousActive.classList.remove("active")
        previousActive.classList.add(isMovingForward ? "slide-out-left" : "slide-out-right")
        
        newActiveView.classList.add("active", isMovingForward ? "slide-in-left" : "slide-in-right")
      })
      
      // Cleanup after animation completes
      setTimeout(() => {
        document.querySelectorAll(".view").forEach(v => {
          v.classList.remove("slide-in-left", "slide-in-right", "slide-out-left", "slide-out-right")
        })
      }, 500)

    } else {
      // No transition needed, just switch
      document.querySelectorAll(".view.active").forEach(activeItem => activeItem.classList.remove("active"))
      newActiveView?.classList.add("active")
    }
  }))

  document.querySelector(".crawlAllBtn").addEventListener("click", event => {
    // Prevent multiple intervals from being created
    if (window.moreToCrawlInterval) {
      console.log("Crawl already in progress")
      return
    }

    clickAllCrawlIcons()

    function clickAllCrawlIcons() {
      crawl.all.links.forEach(link => {
        document.querySelectorAll("#pages .crawl i").forEach(pageCrawl => pageCrawl.click())
      })
    }

    // Store interval globally for proper cleanup
    window.moreToCrawlInterval = setInterval(() => {
      console.log("Checking crawl status")

      try {
        if (crawling.length === 0) {
          if (!getPages().some(link => !link.isCrawled)) {
            document.querySelector(".crawlAllBtn").classList.add("hidden")
            console.log("All links crawled")
            console.log("Clearing Interval")
            clearInterval(window.moreToCrawlInterval)
            window.moreToCrawlInterval = null
          }
          else {
            console.log("Crawling more links")
            clickAllCrawlIcons()
          }
        }
      } catch (error) {
        console.error("Error during crawl check:", error)
        clearInterval(window.moreToCrawlInterval)
        window.moreToCrawlInterval = null
      }
    }, 500)
  })


  //Settings Controls
  document.querySelectorAll("#settings.view input").forEach(item =>
    item.addEventListener("change", event => {

      let settingGroup = item.id.split("-")[0]
      let setting = item.id.split("-")[1]
      
      if (item.type === "checkbox")
        settings[settingGroup][setting] = item.checked
      else if (item.type === "text")
        settings[settingGroup][setting] = item.value
      else if (item.type === "number")
        settings[settingGroup][setting] = parseInt(item.value, 10) || 0

      if (settingGroup === "download") {
        let downloadDirectory = settings.download.directory
        if (downloadDirectory[downloadDirectory.length - 1] !== "/")
          downloadDirectory += "/"
        settings.download.directory = downloadDirectory
      }
      
      // Apply CORS URLs immediately when changed
      if (setting === "corsProxyUrl") {
        CORS_BYPASS_URL = settings.crawl.corsProxyUrl
        console.log("Updated CORS Proxy URL:", CORS_BYPASS_URL)
      }
      if (setting === "corsProxyRawUrl") {
        CORS_BYPASS_URL_RAW = settings.crawl.corsProxyRawUrl
        console.log("Updated CORS Proxy Raw URL:", CORS_BYPASS_URL_RAW)
      }

      storageSet("settings", settings)
    })
  )

  //If managing downloads is disabled we can't combine files
  storageGet('manageDownloads').then(manageDownloads => {
    console.log("Manage downloads: " + manageDownloads)
    if (manageDownloads === false) {
      settings.combine.enabled = false
      document.querySelector("#settings").querySelectorAll(".needsManageDownloads").forEach(e => e.classList.add("hidden"))
    }
  }).catch(error => {
    console.error("Failed to check manageDownloads setting:", error)
  })

  //Add event listeners to the combine section
  document.querySelector("#settings #combine-enabled").addEventListener("change", event => {
    document.querySelector(".combine-settings").classList.toggle("active")
  })

  document.querySelector("#settings #recrawlBtn").addEventListener("click", event => {
    //Reset
    crawl = { all: { media: [], links: [], assets: [] } }
    pageHashCache.clear() // Clear hash cache on recrawl
    lastCounts = { pages: 1, assets: 1, links: 1, files: 1, media: 1 }
    document.querySelector("#crawledSiteCount").innerHTML = ''

    //Recrawl
    crawlURL(baseUrl)
    const link = createLinkObject(baseUrl, createElementFromHTML(`<a href="${baseUrl}"></a>`))
    link.isCrawled = true
    link.tags.isBaseUrl = true
    crawl.all.links.push(link)
  })

  //Popup Controls
  document.querySelectorAll(".popup .popup-close i").forEach(element => element.addEventListener("click", event => {
    document.querySelector(".popup.active").classList.remove("active")
  }))
  document.querySelectorAll(".popup .popup-outerWrapper").forEach(element => element.addEventListener("click", event => {
    if (Array.from(document.querySelectorAll(".popup .popup-outerWrapper")).some(element1 => element1 === event.target))
      document.querySelector(".popup.active").classList.remove("active")
  }))

  document.querySelectorAll("#inspecter .popup-nav-item").forEach(item => item.addEventListener("click", event => {
    document.querySelectorAll("#inspecter .popup-nav-item.active, #inspecter .popup-view.active").forEach(activeItem => activeItem.classList.remove("active"))
    item.classList.add("active")
    let view = item.querySelector("p").innerHTML.toLowerCase()
    console.log(view)
    document.querySelector("#inspecter .popup-view#popup-view-" + view)?.classList.add("active")
  }))

  //Select All controls
  document.querySelectorAll(".view-title .select input").forEach(item => item.addEventListener("click", event => {
    let view = item.parentNode.parentNode.parentNode
    let state = item.checked
    view.querySelectorAll(".view-items .select input").forEach(item => item.checked = state)
    
    //Check if the multi-wrapper needs to show
    const multiWrapper = document.querySelector(".view.active .multi-wrapper")
    const checkedCount = Array.from(view.querySelectorAll(".view-items .select input")).filter(i => i.checked).length
    if (checkedCount >= 1)
      multiWrapper.classList.add("active")
    else
      multiWrapper.classList.remove("active")
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
    const searchbar = view.querySelector(".searchbar")
    searchbar.classList.toggle("active")
    let state = searchbar.classList.contains("active")
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
      if (mutation.target.children.length !== lastCounts[view] && mutation.target.children.length > lastCounts[view]) {
        lastCounts[view] = mutation.target.children.length
        let sidebarItem = Array.from(document.querySelectorAll(".sidebar-item p")).find(i => i.innerHTML.toLocaleLowerCase() === view)
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
* Function to run AFTER each view and popup-view is updated
*/
function updateAll() {
  document.querySelectorAll(".view .view-title .select input").forEach(item => item.checked = false)

  //If one or more items is selected, show the multi-item wrapper
  document.querySelectorAll(".view .view-items .select input").forEach(i => i.onclick = function () {
    const multiWrapper = document.querySelector(".view.active .multi-wrapper")
    if (Array.from(document.querySelectorAll(".view.active .view-items .select input")).filter(i => i.checked).length >= 1)
      multiWrapper.classList.add("active")
    else
      multiWrapper.classList.remove("active")
  })

  //Add click event for the inspect icon
  document.querySelectorAll(".view .view-items .inspect").forEach(element => element.addEventListener("click", event => {
    event.preventDefault()
    let url = event.target.parentNode.href
    setupPopup(url)
    document.querySelector("#inspecter ").classList.add("active")
  }))

  document.querySelectorAll(".expand-image").forEach(element => element.addEventListener("click", event => {
    document.querySelector(".expanded-image").src = event.target.src
    document.querySelector("#expander").classList.add("active")

  }))

  //Add click event for the inspect icon
  document.querySelectorAll(".view-items .test:not(.crawl), view-items .warning:not(.crawl), .view-items .error:not(.crawl)").forEach(element => element.addEventListener("click", event => {
    event.preventDefault()
    let url = event.target.href || event.target.parentNode.href
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
        crawl.all.links[crawl.all.links.findIndex(i => i.href === url)].isCrawled = true
      else
        crawl.all.assets[crawl.all.assets.findIndex(i => i.link === url)].isCrawled = true

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
                const bodyElement = pageDoc.querySelector("body")

                data.forEach((styleSheet) => {
                  if (styleSheet.value) {
                    let url = styleSheet.value[0]
                    let page = styleSheet.value[1]
                    let elm = createElementFromHTML(page)
                    elm.setAttribute("data-link", url)
                    bodyElement.appendChild(elm)
                  }
                })
                console.log("Moving older Styles to bottom")
                pageDoc.querySelectorAll("style:not([data-link])").forEach(style => bodyElement.appendChild(style))
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
                const bodyElement = pageDoc.querySelector("body")
                
                data.forEach((script) => {
                  if (script.value) {
                    let url = script.value[0]
                    let page = script.value[1]
                    let elm = createElementFromHTML(page)
                    elm.setAttribute("data-link", url)
                    bodyElement.appendChild(elm)
                  }
                })
                console.log("Moving older Scripts to bottom")
                pageDoc.querySelectorAll("script:not([data-link])").forEach(script => bodyElement.appendChild(script))
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
                  if (!isImageTag && image.style.cssText.match(imageUrlRegex)) {
                    src = imageUrlRegex.exec(element.style.cssText).groups.image
                    imageUrlRegex.lastIndex = 0;
                  }
                  console.log(src)
                  let img = createImageObject(baseUrl, null, src)
                  toDataURL(img.src).then(dataUrl => {
                    console.log("Wants to replace", src, "with", "...")
                    if (isImageTag)
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
              if (pageDoc.querySelectorAll('img[src], *[style*="background"]').length === 0) resolve(pageDoc)

              let count = 0

              pageDoc.querySelectorAll('img[src], *[style*="background"], img[data-src]').forEach(element => {

                let isBackground = element.tagName === "IMG" ? false : true
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
                    if (count === 0)
                      resolve(pageDoc)
                  }).catch(() => {
                    count--
                    if (count === 0)
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
            if (Object.keys(crawl).find(i => i === url))
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

/**
 * Test a URL to see if it is valid, if not return the status code
 * @param {string} url 
 * @param {object} element 
 */
function testURL(url, element) {
  element.classList.remove("test")
  element.classList.remove("success")
  element.classList.remove("warning")
  element.classList.remove("error")
  element.classList.add("testing")
  element.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 10000)
  
  // Try direct fetch first
  const testFetch = async () => {
    try {
      const directRes = await fetch(url, { signal: controller.signal })
      clearTimeout(timeoutId)
      return { ok: true, status: directRes.status }
    } catch (directError) {
      // Fall back to CORS proxy
      const proxyRes = await fetch(CORS_BYPASS_URL + encodeURIComponent(url), { signal: controller.signal })
      if (!proxyRes.ok) throw new Error(proxyRes.error)
      const data = await proxyRes.json()
      clearTimeout(timeoutId)
      return { ok: true, status: data.status.http_code, data: data }
    }
  }
  
  testFetch()
    .then(result => {
      const linkIndex = crawl.all.links.findIndex(i => i.href === url)
      if (result.status === 200) {
        element.classList.add("success")
        element.title = "Link is valid"
        element.innerHTML = '<i class="fas fa-check-circle"></i>'
        if (linkIndex > -1) crawl.all.links[linkIndex].test = "success"
      }
      else if (result.data && (result.data.error || result.data.status?.error)) {
        throw new Error()
      }
      else {
        element.classList.add("warning")
        element.title = "Returned a status code of " + result.status + "\nClick to retry"
        element.innerHTML = '<i class="fas fa-exclamation-circle"></i>'
        if (linkIndex > -1) {
          crawl.all.links[linkIndex].test = "warning"
          crawl.all.links[linkIndex].statusCode = result.status
        }
      }
    })
    .catch(() => {
      element.classList.add("error")
      element.title = "Link doesn't exist or took to long to respond\nClick to retry"
      element.innerHTML = '<i class="fas fa-times-circle"></i>'
      const linkIndex = crawl.all.links.findIndex(i => i.href === url)
      if (linkIndex > -1) crawl.all.links[linkIndex].test = "failed"
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

  // Sort pages alphabetically by href
  const sortedPages = getPages().sort((a, b) => {
    return a.href.localeCompare(b.href)
  })

  sortedPages.forEach(link => {
    //Pages should only contain local HTML links but not anchors


    //Create string of tags and instances
    let linkTagsText = ''
    let instancesText = '<strong>Instances:</strong>(' + link.instances.length + ')<ul>'
    linkTagsText += "Original URL: <strong>" + link._href + '</strong><br>'
    
    // Add duplicate information if applicable
    if (link.isDuplicate) {
      linkTagsText += '<span style="color: #2196F3;">Duplicate of: <strong>' + link.duplicateOf + '</strong></span><br>'
    }

    //No need to display isLocal if it's a page
    Object.keys(link.tags).forEach(i => linkTagsText += i !== "isLocal" ? "" + i + ": <strong>" + link.tags[i] + "</strong><br>" : '')
    if (linkTagsText.length > 0)
      linkTagsText = linkTagsText.substr(0, linkTagsText.length - 4) + '<hr>'

    //Add all instances to the instance string
    link.instances.forEach(i => {
      const fragmentUrl = createTextFragmentUrl(i.foundOn, i.text || i.alt || i.title)
      instancesText += '<li><a href="' + fragmentUrl + '" target="_blank">' + i.foundOn + '</a><ul>'
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
      html += '<a class="error crawl" target="_blank" href="' + link.href + '" title="Page doesn\'t exist or took to long to respond\nClick to retry"><i class="fas fa-times-circle"></i></a>'
    else if (link.isWarning)
      html += '<a class="warning crawl" target="_blank" href="' + link.href + '" title="Returned a status code of ' + link.statusCode + '\nClick to retry"><i class="fas fa-exclamation-circle"></i></a>'
    else if (link.isDuplicate)
      html += '<a class="info duplicate" title="Duplicate of ' + link.duplicateOf + '"><i class="fas fa-info-circle"></i></a>'
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
  let popup = document.querySelector("#inspecter")
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
      const fragmentUrl = createTextFragmentUrl(i.foundOn, i.text || i.alt || i.title)
      instancesText += '<li><a href="' + fragmentUrl + '" target="_blank">' + i.foundOn + '</a><ul>'
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
    if (!isUrlProtocol(href) && !isUrlAnchor(href) && htmlIndex === 'links') {
      if (link.test === null)
        html[htmlIndex] += '<a class="test" target="_blank" href="' + href + '" title="Test the link"><i class="fas fa-question-circle"></i></a>'
      if (link.test === "success")
        html[htmlIndex] += '<a class="success" target="_blank" href="' + href + '" title="Link is valid"><i class="fas fa-check-circle"></i></a>'
      else if (link.test === "warning")
        html[htmlIndex] += '<a class="warning" target="_blank" href="' + href + '" title="Returned a status code of ' + link.statusCode + '\nClick to retry"><i class="fas fa-exclamation-circle"></i></a>'
      else if (link.test === "error")
        html[htmlIndex] += '<a class="error" target="_blank" href="' + href + '" title="Link doesn\'t exist or took to long to respond\nClick to retry"><i class="fas fa-times-circle"></i></a>'
    }
    if (htmlIndex !== 'links')
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
      const fragmentUrl = createTextFragmentUrl(i.foundOn, i.alt || i.title)
      instancesText += '<li><a href="' + fragmentUrl + '" target="_blank">' + i.foundOn + '</a><ul>'
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
      const fragmentUrl = createTextFragmentUrl(i.foundOn, i.text || i.title)
      instancesText += '<li><a href="' + fragmentUrl + '" target="_blank">' + i.foundOn + '</a><ul>'
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
        html += '<a class="warning" target="_blank" href="' + link.href + '" title="Returned a status code of ' + link.statusCode + '"><i class="fas fa-exclamation-circle"></i></a>'
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
      const fragmentUrl = createTextFragmentUrl(i.foundOn, i.text || i.title)
      instancesText += '<li><a href="' + fragmentUrl + '" target="_blank">' + i.foundOn + '</a><ul>'
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
      const fragmentUrl = createTextFragmentUrl(i.foundOn, i.alt)
      instancesText += '<li><a href="' + fragmentUrl + '" target="_blank">' + i.foundOn + '</a><ul>'
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
      html += '<img class="expand-image"  src="' + file.src + '">'
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

const getPages = () => crawl.all.links.filter(link => isUrlLocal(link.href) && isUrlHTMLFile(link.href) && !isUrlAnchor(link.href) && !isUrlScript(link.href) && !isUrlStyleSheet(link.href))
const getLinks = () => crawl.all.links.filter(link => (isUrlHTMLFile(link.href) && !isUrlLocal(link.href)) || isUrlAnchor(link.href) || isUrlProtocol(link.href))
const getFiles = () => crawl.all.links.filter(link => !isUrlHTMLFile(link.href) && !isUrlProtocol(link.href))