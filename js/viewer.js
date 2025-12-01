
//Track lastHTML to show what has changed
let lastCounts = { pages: 1, assets: 1, links: 1, files: 1, media: 1 }

// Download queue management
const DOWNLOAD_QUEUE = {
  queue: [],
  active: 0,
  maxConcurrent: 3
}

// Constants for magic numbers
const BLOB_CLEANUP_DELAY = 2000 // ms
const TEXT_FRAGMENT_MAX_LENGTH = 50 // characters

/**
 * Helper function to create a URL with text fragment for scroll-to-text functionality
 * @param {string} baseUrl - The base URL
 * @param {string} text - The text to create a fragment for (e.g., link text, alt text, title)
 * @returns {string} URL with text fragment appended
 */
function createTextFragmentUrl(baseUrl, text) {
  if (!text) return baseUrl
  
  // Encode the text for URL and limit to first 50 characters for reliability
  const textForFragment = encodeURIComponent(text.trim().substring(0, TEXT_FRAGMENT_MAX_LENGTH))
  return baseUrl + '#:~:text=' + textForFragment
}

/**
 * Create DocumentFragment from HTML string for better performance
 * @param {string} htmlString - HTML string to convert
 * @returns {DocumentFragment} - Document fragment containing the HTML elements
 */
function createFragment(htmlString) {
  const template = document.createElement('template')
  template.innerHTML = htmlString.trim()
  return template.content
}

/**
 * Efficiently render HTML to a container using DocumentFragment
 * @param {HTMLElement} container - Target container element
 * @param {string} htmlString - HTML string to render
 */
function renderToContainer(container, htmlString) {
  if (!htmlString || htmlString.length === 0) {
    container.innerHTML = '<div class="empty-row">There are no items here.</div>'
    return
  }
  
  const fragment = createFragment(htmlString)
  container.innerHTML = '' // Clear existing content
  container.appendChild(fragment)
}

/**
 * Process the download queue with concurrent limit
 */
function processDownloadQueue() {
  while (DOWNLOAD_QUEUE.active < DOWNLOAD_QUEUE.maxConcurrent && DOWNLOAD_QUEUE.queue.length > 0) {
    const downloadFn = DOWNLOAD_QUEUE.queue.shift()
    DOWNLOAD_QUEUE.active++
    
    downloadFn().finally(() => {
      DOWNLOAD_QUEUE.active--
      processDownloadQueue()
    })
  }
}

/**
 * Queue a download to prevent overwhelming the browser
 * @param {Function} downloadFn - Function that returns a Promise for the download
 */
function queueDownload(downloadFn) {
  DOWNLOAD_QUEUE.queue.push(downloadFn)
  processDownloadQueue()
}

//Settings
let settings = {
  crawl: {
    onPageScripts: true,
    onPageStyles: true,
    rateLimitMs: 100,
    corsProxyUrl: 'https://api.allorigins.win/get?url=',
    corsProxyRawUrl: 'https://api.allorigins.win/raw?url=',
    crawlMode: 'smart', // 'fetch', 'live', or 'smart'
    liveWaitTime: 5000,
    maxConcurrentTabs: 10
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
    // Clean up intervals to prevent memory leaks
    if (window.moreToCrawlInterval) {
      clearInterval(window.moreToCrawlInterval)
      window.moreToCrawlInterval = null
    }
    // Clean up observer
    if (window.viewObserver) {
      window.viewObserver.disconnect()
      window.viewObserver = null
    }
    // Clean up all crawler tabs
    if (typeof closeAllCrawlerTabs === 'function') {
      closeAllCrawlerTabs().catch(err => console.warn('Failed to close crawler tabs:', err))
    }
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
          corsProxyRawUrl: data.crawl?.corsProxyRawUrl || 'https://api.allorigins.win/raw?url=',
          crawlMode: data.crawl?.crawlMode || (data.crawl?.liveCrawling === true ? 'live' : 'smart'), // Migrate old liveCrawling setting
          liveWaitTime: data.crawl?.liveWaitTime !== undefined ? data.crawl.liveWaitTime : 5000,
          maxConcurrentTabs: data.crawl?.maxConcurrentTabs !== undefined ? data.crawl.maxConcurrentTabs : 10
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
      document.querySelectorAll("#settings.view input, #settings.view select").forEach(item => {

        let settingGroup = item.id.split("-")[0]
        let setting = item.id.split("-")[1]

        if (item.type === "checkbox")
          item.checked = settings[settingGroup][setting]
        else if (item.type === "radio")
          item.checked = (item.value === settings[settingGroup][setting])
        else if (item.type === "text" || item.type === "number")
          item.value = settings[settingGroup][setting]
        else if (item.tagName === "SELECT")
          item.value = settings[settingGroup][setting]

        if (settings.combine.enabled === true)
          document.querySelector(".combine-settings").classList.toggle("active")
      })
    }
    
    // Crawl base url after settings are loaded
    startInitialCrawl()
  }).catch(error => {
    showNotification('Failed to load settings', 'error', 3000)
    // Still start crawl even if settings fail to load (will use defaults)
    startInitialCrawl()
  })

  // Function to start the initial crawl
  function startInitialCrawl() {
    if (window.tabURL)
      baseUrl = window.tabURL
    
    // Store the tabId globally so it can be used for initial crawl
    if (window.tabId)
      window.initialTabId = window.tabId

    let url = new URL(baseUrl)
    hostURL = url.origin
    baseUrl = hostURL + (url.pathname ? url.pathname : '')

    document.querySelector("#crawledSiteText").textContent = baseUrl
    crawlURL(baseUrl, true, true)  // Pass true for isInitialPage on first crawl

    let link = createLinkObject(baseUrl, createElementFromHTML(`<a href="${baseUrl}"></a>`))
    link.isCrawled = true
    link.tags.isBaseUrl = true
    crawl.all.links.push(link)
  }

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

  // Overview card click handlers - navigate to respective views
  const overviewCards = document.querySelectorAll("#overview .card")
  const sidebarItems = document.querySelectorAll(".sidebar-item")
  
  overviewCards.forEach((card, index) => {
    card.addEventListener("click", () => {
      // Cards map to sidebar items: Pages(0), Assets(1), Links(2), Files(3), Media(4)
      const targetSidebarItem = sidebarItems[index]
      if (targetSidebarItem) {
        targetSidebarItem.click()
      }
    })
  })

  document.querySelector(".crawlAllBtn").addEventListener("click", event => {
    // Prevent multiple intervals from being created
    if (window.moreToCrawlInterval) {
      showNotification('Crawl already in progress', 'info')
      return
    }

    clickAllCrawlIcons()

    function clickAllCrawlIcons() {
      // Only click crawl icons for pages that:
      // 1. Are not already crawled (isCrawled = false)
      // 2. Are not currently being crawled (not in crawling array)
      // 3. Are not in error/warning state (haven't failed)
      const uncrawledPages = getPages().filter(link => 
        !link.isCrawled && 
        !crawling.includes(link.href) &&
        !link.isError &&
        !link.isWarning
      )
      
      uncrawledPages.forEach(link => {
        // Find the corresponding crawl icon in the DOM and click it
        const crawlIcon = Array.from(document.querySelectorAll("#pages .crawl"))
          .find(icon => icon.href === link.href)
        if (crawlIcon) {
          crawlIcon.querySelector('i')?.click()
        }
      })
    }

    // Store interval globally for proper cleanup
    window.moreToCrawlInterval = setInterval(() => {
      try {
        if (crawling.length === 0) {
          if (!getPages().some(link => !link.isCrawled)) {
            document.querySelector(".crawlAllBtn").classList.add("hidden")
            clearInterval(window.moreToCrawlInterval)
            window.moreToCrawlInterval = null
          }
          else {
            clickAllCrawlIcons()
          }
        }
      } catch (error) {
        showNotification('Error during crawl check', 'error', 3000)
        clearInterval(window.moreToCrawlInterval)
        window.moreToCrawlInterval = null
      }
    }, 500)
  })


  //Settings Controls
  document.querySelectorAll("#settings.view input, #settings.view select").forEach(item =>
    item.addEventListener("change", event => {

      let settingGroup = item.id.split("-")[0]
      let setting = item.id.split("-")[1]
      
      if (item.type === "checkbox")
        settings[settingGroup][setting] = item.checked
      else if (item.type === "radio")
        settings[settingGroup][setting] = item.value
      else if (item.type === "text")
        settings[settingGroup][setting] = item.value
      else if (item.type === "number")
        settings[settingGroup][setting] = parseInt(item.value, 10) || 0
      else if (item.tagName === "SELECT")
        settings[settingGroup][setting] = item.value

      if (settingGroup === "download") {
        let downloadDirectory = settings.download.directory
        if (downloadDirectory[downloadDirectory.length - 1] !== "/")
          downloadDirectory += "/"
        settings.download.directory = downloadDirectory
      }
      
      // Apply CORS URLs immediately when changed
      if (setting === "corsProxyUrl") {
        CORS_BYPASS_URL = settings.crawl.corsProxyUrl
      }
      if (setting === "corsProxyRawUrl") {
        CORS_BYPASS_URL_RAW = settings.crawl.corsProxyRawUrl
      }

      storageSet("settings", settings)
    })
  )

  //If managing downloads is disabled we can't combine files
  storageGet('manageDownloads').then(manageDownloads => {
    if (manageDownloads === false) {
      settings.combine.enabled = false
      document.querySelector("#settings").querySelectorAll(".needsManageDownloads").forEach(e => e.classList.add("hidden"))
    }
  }).catch(error => {
    showNotification('Failed to check download settings', 'error', 3000)
  })

  //Add event listeners to the combine section
  document.querySelector("#settings #combine-enabled").addEventListener("change", event => {
    document.querySelector(".combine-settings").classList.toggle("active")
  })

  document.querySelector("#settings #recrawlBtn").addEventListener("click", event => {
    // Show confirmation dialog
    if (!confirm("Are you sure you want to recrawl? This will clear all current crawl data and start fresh from the base URL.")) {
      return
    }
    
    // Clean up any existing intervals
    if (window.moreToCrawlInterval) {
      clearInterval(window.moreToCrawlInterval)
      window.moreToCrawlInterval = null
    }
    
    // Clean up crawling state
    crawlLocks.clear()
    
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
  
  // Delete crawl data button handler
  document.querySelector("#inspecter .popup-delete")?.addEventListener("click", async event => {
    const popup = document.querySelector("#inspecter")
    const urlElement = popup.querySelector(".card-title h3")
    if (!urlElement) return
    
    const url = urlElement.textContent.split('\n')[0].trim()
    
    // Prevent deleting the original URL
    if (url === baseUrl) {
      showNotification('Cannot delete crawl data for the original URL', 'warning', 3000)
      return
    }
    
    if (!confirm(`Delete crawl data for this page?\n\n${url}\n\nThis will remove all content found on this page, but keep it as a discovered link.`)) {
      return
    }
    
    // Close the popup
    popup.classList.remove("active")
    
    // Remove the page's crawled content but keep it as a link
    if (crawl[url]) {
      // Store the page data to get links/media/assets found on this page
      const pageData = crawl[url]
      
      // Remove all links found on this page from other links' instances
      crawl.all.links.forEach(link => {
        link.instances = link.instances.filter(instance => instance.foundOn !== url)
      })
      
      // Remove all media found on this page from other media's instances
      crawl.all.media.forEach(media => {
        media.instances = media.instances.filter(instance => instance.foundOn !== url)
      })
      
      // Remove all assets found on this page from other assets' instances
      crawl.all.assets.forEach(asset => {
        asset.instances = asset.instances.filter(instance => instance.foundOn !== url)
      })
      
      // Clean up items with no remaining instances
      crawl.all.links = crawl.all.links.filter(link => link.instances.length > 0)
      crawl.all.media = crawl.all.media.filter(media => media.instances.length > 0)
      crawl.all.assets = crawl.all.assets.filter(asset => asset.instances.length > 0)
      
      // Delete the crawled page data
      delete crawl[url]
      
      // Mark the link as not crawled anymore (so it can be crawled again)
      const linkIndex = crawl.all.links.findIndex(link => link.href === url)
      if (linkIndex > -1) {
        crawl.all.links[linkIndex].isCrawled = false
        // Clear any error/warning flags
        delete crawl.all.links[linkIndex].isError
        delete crawl.all.links[linkIndex].isWarning
        delete crawl.all.links[linkIndex].statusCode
        delete crawl.all.links[linkIndex].errorMessage
        delete crawl.all.links[linkIndex].isDuplicate
        delete crawl.all.links[linkIndex].duplicateOf
      }
    }
    
    // Update all views
    updatePages()
    updateAssets()
    updateLinks()
    updateFiles()
    updateMedia()
    updateOverview()
    
    showNotification(`Crawl data deleted for: ${url}`, 'success', 3000)
  })
  
  document.querySelectorAll(".popup .popup-outerWrapper").forEach(element => element.addEventListener("click", event => {
    if (Array.from(document.querySelectorAll(".popup .popup-outerWrapper")).some(element1 => element1 === event.target))
      document.querySelector(".popup.active").classList.remove("active")
  }))

  document.querySelectorAll("#inspecter .popup-nav-item").forEach(item => item.addEventListener("click", event => {
    document.querySelectorAll("#inspecter .popup-nav-item.active, #inspecter .popup-view.active").forEach(activeItem => activeItem.classList.remove("active"))
    item.classList.add("active")
    let view = item.querySelector("p").innerHTML.toLowerCase()
    document.querySelector("#inspecter .popup-view#popup-view-" + view)?.classList.add("active")
  }))

  //Select All controls
  document.querySelectorAll(".view-title .select input").forEach(item => item.addEventListener("click", event => {
    let view = item.parentNode.parentNode.parentNode
    let state = item.checked
    view.querySelectorAll(".view-items .select input").forEach(checkbox => {
      if (checkbox) checkbox.checked = state
    })
    
    //Check if the multi-wrapper needs to show
    const multiWrapper = document.querySelector(".view.active .multi-wrapper")
    const checkedCount = Array.from(view.querySelectorAll(".view-items .select input")).filter(i => i.checked).length
    if (checkedCount >= 1)
      multiWrapper.classList.add("active")
    else
      multiWrapper.classList.remove("active")
  }))

  //Download all button with queue management
  document.querySelectorAll(".downloadSelected").forEach(item => item.addEventListener("click", event => {
    let items = document.querySelectorAll(".view.active .view-items .select input:checked")
    const totalItems = items.length
    
    if (totalItems === 0) {
      showNotification('No items selected', 'warning')
      return
    }
    
    showNotification(`Queueing ${totalItems} download${totalItems > 1 ? 's' : ''}...`, 'info')
    
    items.forEach(item => {
      const downloadIcon = item.parentNode.parentNode.querySelector("a.download i")
      if (downloadIcon) {
        queueDownload(() => {
          return new Promise(resolve => {
            downloadIcon.click()
            // Small delay between downloads
            setTimeout(resolve, 200)
          })
        })
      }
    })
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
    const titleCheckbox = document.querySelector(".view.active .view-title .select input:checked")
    if (titleCheckbox) titleCheckbox.checked = false
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

  //Filter/Searchbar gets typed in (debounced to avoid excessive filtering)
  document.querySelectorAll(".searchbar .form-item input").forEach(item => item.addEventListener("keyup", debounce(function () {
    const view = item.parentNode.parentNode.parentNode
    const viewId = '#' + view.id
    applySearchFilter(viewId, item.value)
  }, 200)))


  //Track new items in views and indicate if new
  window.viewObserver = new MutationObserver(function (mutations) {
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
    window.viewObserver.observe(item, { childList: true })
  })

  // Global event delegation for dynamically created elements
  // Handle checkbox clicks to show/hide multi-wrapper
  document.body.addEventListener('click', event => {
    if (event.target.matches('.view .view-items .select input')) {
      const multiWrapper = document.querySelector(".view.active .multi-wrapper")
      const checkedCount = Array.from(document.querySelectorAll(".view.active .view-items .select input")).filter(i => i.checked).length
      if (checkedCount >= 1)
        multiWrapper.classList.add("active")
      else
        multiWrapper.classList.remove("active")
    }
  })

  // Handle inspect icon clicks
  document.body.addEventListener('click', event => {
    if (event.target.closest('.view .view-items .inspect')) {
      event.preventDefault()
      const inspectLink = event.target.closest('.inspect')
      let url = inspectLink.href
      setupPopup(url)
      document.querySelector("#inspecter").classList.add("active")
    }
  })

  // Handle expand image clicks
  document.body.addEventListener('click', event => {
    if (event.target.matches('.expand-image')) {
      document.querySelector(".expanded-image").src = event.target.src
      document.querySelector("#expander").classList.add("active")
    }
  })

  // Handle test link clicks
  document.body.addEventListener('click', event => {
    const testElement = event.target.closest('.view-items .test:not(.crawl), .view-items .warning:not(.crawl), .view-items .error:not(.crawl)')
    if (testElement) {
      event.preventDefault()
      let url = testElement.href
      testURL(url, testElement)
    }
  })

  // Handle crawl icon clicks
  document.body.addEventListener('click', event => {
    if (event.target.closest('.view .view-items .crawl')) {
      event.preventDefault()
      const crawlLink = event.target.closest('.crawl')
      let url = crawlLink.href

      //Check if the item being crawled is an HTML page or an asset
      if (isUrlHTMLFile(url))
        crawl.all.links[crawl.all.links.findIndex(i => i.href === url)].isCrawled = true
      else
        crawl.all.assets[crawl.all.assets.findIndex(i => i.link === url)].isCrawled = true

      //Remove Crawl Icon
      crawlLink.remove()
      crawlURL(url)
    }
  })

  // Handle download icon clicks
  document.body.addEventListener('click', event => {
    if (event.target.closest('.view-items .download')) {
      event.preventDefault()
      const downloadLink = event.target.closest('.download')
      let url = downloadLink.href
      handleDownload(url)
    }
  })

  // Enhanced hover popup system with intelligent positioning
  let activePopup = null
  
  document.body.addEventListener('mouseover', event => {
    const hoverIcon = event.target.closest('.hover-popup-icon')
    if (hoverIcon) {
      const popup = hoverIcon.querySelector('.hover-popup')
      if (popup && popup !== activePopup) {
        activePopup = popup
        
        // Use double requestAnimationFrame to position after CSS transitions start
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            positionPopup(popup, hoverIcon)
          })
        })
      }
    }
  })
  
  function positionPopup(popup, icon) {
    const iconRect = icon.getBoundingClientRect()
    const viewportHeight = window.innerHeight
    const popupMaxHeight = 200
    const padding = 10
    
    // Calculate available space above and below
    const spaceBelow = viewportHeight - iconRect.bottom
    const spaceAbove = iconRect.top
    
    // Reset previous positioning
    popup.style.top = ''
    popup.style.bottom = ''
    popup.style.marginTop = ''
    popup.style.marginBottom = ''
    
    // Vertical positioning: prefer below unless insufficient space
    if (spaceBelow >= popupMaxHeight + padding || spaceBelow > spaceAbove) {
      // Position below with overlap so mouse is over popup
      popup.style.top = '100%'
      popup.style.bottom = 'auto'
      popup.style.marginTop = '-10px'
      popup.style.marginBottom = '0'
    } else {
      // Position above with overlap so mouse is over popup
      popup.style.top = 'auto'
      popup.style.bottom = '100%'
      popup.style.marginTop = '0'
      popup.style.marginBottom = '-10px'
    }
  }
  
  // Clean up when mouse leaves
  document.body.addEventListener('mouseout', event => {
    if (event.target.closest('.hover-popup-icon') && !event.relatedTarget?.closest('.hover-popup-icon')) {
      activePopup = null
    }
  })

})

/**
* Function to run AFTER each view and popup-view is updated
*/
function updateAll() {
  // Reset title checkboxes
  document.querySelectorAll(".view .view-title .select input").forEach(item => item.checked = false)
}

/**
* Handle download logic for a URL
* @param {string} url - The URL to download
*/
function handleDownload(url) {
  //If combining images and assets into one file
  if (isUrlHTMLFile(url) && settings.combine.enabled) {

        crawlIfNeeded(url).then(page => {

          convertAll(page);

          async function convertAll(page) {
            let pageDoc = page.doc.cloneNode(true)
            if (settings.combine.assets) {
              pageDoc = await convertAllScripts(pageDoc)
              pageDoc = await convertAllStyles(pageDoc)
            }
            if (settings.combine.imagesInAssets) {
              pageDoc = await convertAllStyleImages(pageDoc)
            }
            if (settings.combine.images) {
              pageDoc = await convertAllImages(pageDoc)
            }

            //Create blob
            let fileBlob = new Blob([pageDoc.querySelector("html").outerHTML], { type: "text/html" });
            blobUrl = URL.createObjectURL(fileBlob);

            //Save blob to localstorage
            storageSet(blobUrl, url)

            //Update url to blobUrl
            url = blobUrl

            showNotification('Starting download...', 'info')
            
            chrome.downloads.download({ 
              url,
              saveAs: false,
              conflictAction: 'uniquify'
            }, (downloadId) => {
              if (chrome.runtime.lastError) {
                showNotification('Download failed: ' + chrome.runtime.lastError.message, 'error', 5000)
              } else {
                showNotification('Download started successfully', 'success')
                // Cleanup blob URL after a delay to ensure download has started
                setTimeout(() => {
                  URL.revokeObjectURL(blobUrl)
                  storageSet(blobUrl, null)
                }, BLOB_CLEANUP_DELAY)
              }
            })

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
                          resolveImage([srcToReplace, dataUrl])
                        }).catch(err => rejectImage(err))
                      })
                      )
                    })
                    Promise.allSettled(imagePromises).then(data => {
                      let toReplace = []
                      data.forEach(image => {
                        if (image.value) {
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
                      matchedStyles.forEach(styleTag => styleTag.innerHTML = styleTag.innerHTML.replace(new RegExp(image[0], "g"), image[1]))
                    })
                  }
                })
                done(pageDoc)
              })
            })
          }

          /**
           * Convert all images to data URLs for embedding
           * @param {Document} pageDoc - The document to process
           * @returns {Promise<Document>} The processed document
           */
          async function convertAllImages(pageDoc) {
            return new Promise(done => {
              let images = pageDoc.querySelectorAll('img[src]:not([src^=data]), img[data-src], *[style*="background"]')
              let imagePromises = []
              let successCount = 0
              let failureCount = 0
              
              images.forEach(image => {
                imagePromises.push(new Promise((resolveImage, rejectImage) => {
                  try {
                    let isImageTag = image.tagName.toLowerCase() === "img"
                    let src = image.src || image.getAttribute("data-src")
                    
                    if (!isImageTag && image.style.cssText.match(imageUrlRegex)) {
                      src = imageUrlRegex.exec(image.style.cssText).groups.image
                      imageUrlRegex.lastIndex = 0;
                    }
                    
                    if (!src) {
                      return resolveImage()
                    }
                    
                    let img = createImageObject(baseUrl, null, src)
                    toDataURL(img.src).then(dataUrl => {
                      if (isImageTag)
                        image.src = dataUrl
                      else
                        image.style = image.style.cssText.replace(new RegExp(src, "g"), dataUrl)
                      successCount++
                      resolveImage()
                    }).catch(err => {
                      failureCount++
                      resolveImage() // Resolve anyway to continue processing
                    })
                  } catch (err) {
                    failureCount++
                    resolveImage() // Resolve to continue
                  }
                })
                )
              })
              
              Promise.allSettled(imagePromises).then(data => {
                console.log(`Image conversion complete: ${successCount} succeeded, ${failureCount} failed`)
                if (failureCount > 0) {
                  showNotification(`Warning: ${failureCount} images failed to convert`, 'warning', 3000)
                }
                done(pageDoc)
              })
            })
          }
        })

        /**
         * Crawl a URL if it hasn't been crawled yet
         * @param {string} url - The URL to crawl
         * @returns {Promise} Promise that resolves to the crawled page data
         */
        function crawlIfNeeded(url) {
          return new Promise((resolve, reject) => {
            if (Object.keys(crawl).find(i => i === url))
              resolve(crawl[url])
            else
              crawlURL(url, false).then(page => resolve(page)).catch(error => reject(error))
          })
        }

    } else {
      showNotification('Starting download...', 'info')
      
      chrome.downloads.download({ 
        url,
        saveAs: false,
        conflictAction: 'uniquify'
      }, (downloadId) => {
        if (chrome.runtime.lastError) {
          showNotification('Download failed: ' + chrome.runtime.lastError.message, 'error', 3000)
        } else {
          showNotification('Download started successfully', 'success')
        }
      })
    }
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
        // Handle as error without throwing
        element.classList.add("error")
        element.title = "Link doesn't exist or took too long to respond\nClick to retry"
        element.innerHTML = '<i class="fas fa-times-circle"></i>'
        if (linkIndex > -1) crawl.all.links[linkIndex].test = "failed"
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
      element.title = "Link doesn't exist or took too long to respond\nClick to retry"
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
  let sidebarBadges = document.querySelectorAll(".sidebar-item .count-badge")
  
  for (let i = 0; i < countElements.length; i++) {
    const element = countElements[i]
    const badge = sidebarBadges[i]
    const target = targetCount[i]

    //Have a nice animation counting up to the new count
    const updateCount = () => {
      const count = + element.innerText
      const speed = 5000
      const inc = target / speed;
      if (count < target) {
        const newCount = Math.ceil(count + inc)
        element.innerText = newCount
        if (badge) {
          // For pages badge (index 0), show crawled/total format
          if (i === 0) {
            const crawledPages = getPages().filter(link => link.isCrawled)
            const errorPages = crawledPages.filter(link => link.isError || link.isWarning)
            const validCrawledPages = crawledPages.length - errorPages.length
            badge.innerText = `${validCrawledPages}/${newCount}`
            if (errorPages.length > 0) {
              badge.title = `${errorPages.length} page(s) had errors or warnings`
            }
          } else {
            badge.innerText = newCount
          }
        }
        setTimeout(updateCount, 1)
      } else {
        element.innerText = target
        if (badge) {
          // For pages badge (index 0), show crawled/total format
          if (i === 0) {
            const crawledPages = getPages().filter(link => link.isCrawled).length
            badge.innerText = `${crawledPages}/${target}`
          } else {
            badge.innerText = target
          }
        }
      }
    }
    updateCount()
  }

  //If crawled more than one page, show the crawl count with a hover popup list of all crawled pages
  if (Object.keys(crawl).length - 2 > 0) {
    let crawledHTML = '<ul>'
    let crawledPages = []
    
    //Collect all crawled pages
    crawl.all.links.forEach(item => {
      if (item.isCrawled)
        crawledPages.push(item.href)
    })
    crawl.all.assets.forEach(item => {
      if (item.isCrawled)
        crawledPages.push(item.link)
    })
    
    //Show max 3 lines: if 3 or less show all, if 4+ show 2 + "..."
    let displayText = ''
    let counterText = ''
    if (crawledPages.length > 0) {
      if (crawledPages.length <= 3) {
        // Show all pages if 3 or less
        displayText = crawledPages.join('<br>')
      } else {
        // Show first 2 pages, counter will show "... (+X more)" on 3rd line
        const visibleUrls = crawledPages.slice(0, 2)
        const remaining = crawledPages.length - 2
        displayText = visibleUrls.join('<br>')
        counterText = `... <span class="count">(+${remaining} more)</span>`
      }
    }
    
    //Update banner text
    document.querySelector("#crawledSiteText").innerHTML = displayText
    
    //Update counter (displayed on 3rd line with hover popup, styled like URLs)
    document.querySelector("#crawledSiteCount").innerHTML = counterText
    
    //Update hover popup with full list
    crawledPages.forEach(url => {
      crawledHTML += '<li>' + url + '</li>'
    })
    crawledHTML += '</ul>'
    document.querySelector("#crawledLinks").innerHTML = crawledHTML
  } else {
    document.querySelector("#crawledSiteText").textContent = baseUrl
    document.querySelector("#crawledSiteCount").innerHTML = ''
    document.querySelector("#crawledLinks").innerHTML = ''
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

  // Sort pages by URL path hierarchically
  const sortedPages = getPages().sort((a, b) => {
    // Extract pathnames without query parameters
    const getPathname = (href) => {
      try {
        return new URL(href).pathname
      } catch (e) {
        return href.split('?')[0].split('#')[0].replace(/^https?:\/\/[^\/]+/, '')
      }
    }
    
    const pathA = getPathname(a.href)
    const pathB = getPathname(b.href)
    
    // Split by path segments
    const segmentsA = pathA.split('/').filter(s => s.length > 0)
    const segmentsB = pathB.split('/').filter(s => s.length > 0)
    
    // Compare each segment (case-insensitive to group properly)
    const minLength = Math.min(segmentsA.length, segmentsB.length)
    for (let i = 0; i < minLength; i++) {
      const comparison = segmentsA[i].toLowerCase().localeCompare(segmentsB[i].toLowerCase())
      if (comparison !== 0) return comparison
    }
    
    // If all segments match, shorter path comes first
    if (segmentsA.length !== segmentsB.length) {
      return segmentsA.length - segmentsB.length
    }
    
    // Finally, sort by full URL (including query params) for consistent ordering
    return a.href.localeCompare(b.href)
  })

  // Build a map to track actual parent-child relationships
  const pageMap = new Map()
  const pageMapWithParams = new Map() // Track pages that have query params
  
  sortedPages.forEach(link => {
    try {
      const url = new URL(link.href)
      const pathname = url.pathname
      const searchParams = url.searchParams
      
      // Store base pathname only if there are NO query params
      if (!searchParams.toString()) {
        pageMap.set(pathname, link)
      } else {
        // Track that this pathname exists but with params
        pageMapWithParams.set(pathname, link)
      }
    } catch (e) {
      const pathname = link.href.split('?')[0].split('#')[0].replace(/^https?:\/\/[^\/]+/, '')
      pageMap.set(pathname, link)
    }
  })

  // Function to calculate indent level based on actual parent chain
  const findIndentLevel = (pathname, searchParams) => {
    const segments = pathname.split('/').filter(s => s.length > 0)
    let indentLevel = 0
    
    // First check if there's a parent with the same path but no query params
    if (searchParams && searchParams.toString()) {
      if (pageMap.has(pathname)) {
        // The base path exists, so this query param version is a child
        indentLevel = findIndentLevel(pathname, null) + 1
        return indentLevel
      }
    }
    
    // Walk up the path checking for each potential parent
    for (let i = segments.length - 1; i > 0; i--) {
      const parentPath = '/' + segments.slice(0, i).join('/')
      if (pageMap.has(parentPath)) {
        // Found a parent, recursively get its indent level and add 1
        indentLevel = findIndentLevel(parentPath, null) + 1
        break
      }
    }
    
    return indentLevel
  }

  sortedPages.forEach(link => {
    //Pages should only contain local HTML links but not anchors

    // Calculate indentation based on actual parent-child relationships
    let pathname = ''
    let searchParams = null
    try {
      const url = new URL(link.href)
      pathname = url.pathname
      searchParams = url.searchParams
    } catch (e) {
      pathname = link.href.split('?')[0].split('#')[0].replace(/^https?:\/\/[^\/]+/, '')
    }
    
    const indentLevel = findIndentLevel(pathname, searchParams)
    const indentStyle = indentLevel > 0 ? `style="padding-left: ${indentLevel * 20}px;"` : ''

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
    instancesText = formatInstances(link.instances, i => i.text || i.alt || i.title)

    //Add to HTML to html string for the item
    html += `
        <div class="view-row">
          <div class="select">
            <input type="checkbox">
          </div>
          <div class="link">
            <p ${indentStyle}>` + link.href + `</p>
          </div>
          <div class="tools">
            <a class="download" href="`+ link.href + `" title="Download Page"><i class="fas fa-file-download"></i></a>` +
      '<a class="goto" target="_blank" href="' + link.href + '" title="Go to page"><i class="fas fa-external-link-alt"></i></a>'
    if (link.isCrawling)
      html += '<a class="crawling" title="Crawling in progress..."><i class="fas fa-spinner fa-spin"></i></a>'
    else if (link.isError)
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
      `<div class="info">
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
  //Add html to page using DocumentFragment for better performance
  renderToContainer(wrapper, html)
  
  // Reapply search filter if active
  applySearchFilter('#pages')
}

/**
 * Apply search filter to a view
 * @param {string} viewSelector - CSS selector for the view (e.g., '#pages')
 * @param {string} [searchTerm] - Optional search term. If not provided, uses the view's search input value
 */
function applySearchFilter(viewSelector, searchTerm) {
  const view = document.querySelector(viewSelector)
  if (!view) return
  
  const searchbar = view.querySelector('.searchbar')
  const searchInput = searchbar?.querySelector('input')
  
  // Use provided search term or get from input
  const search = (searchTerm !== undefined ? searchTerm : searchInput?.value || '').toLowerCase()
  
  // Apply filter to all rows
  view.querySelectorAll('.view-items .view-row').forEach(row => {
    const text = row.querySelector('p')?.innerHTML.toLowerCase() || ''
    if (text.indexOf(search) >= 0) {
      row.classList.remove('hidden')
    } else {
      row.classList.add('hidden')
    }
  })
}

/**
 * Build tags HTML for popup hover
 * @param {Object} item - Link or file object
 * @param {string} originalUrl - Original URL before formatting
 * @returns {string} HTML string for tags section
 */
function buildTagsHTML(item, originalUrl) {
  let tagsHTML = ''
  
  if (item.tags.isLocal && originalUrl) {
    tagsHTML += `Original URL: <strong>${originalUrl}</strong><br>`
  }
  
  Object.keys(item.tags).forEach(key => {
    tagsHTML += `${key}: <strong>${item.tags[key]}</strong><br>`
  })
  
  return tagsHTML ? tagsHTML.slice(0, -4) + '<hr>' : ''
}

/**
 * Build test status icons for links
 * @param {Object} link - Link object
 * @param {string} href - Link URL
 * @returns {string} HTML string for test icons
 */
function buildTestIconsHTML(link, href) {
  if (!link.test || link.test === null) {
    return `<a class="test" target="_blank" href="${href}" title="Test the link"><i class="fas fa-question-circle"></i></a>`
  }
  
  const testIcons = {
    success: { class: 'success', icon: 'check-circle', title: 'Link is valid' },
    warning: { class: 'warning', icon: 'exclamation-circle', title: `Returned a status code of ${link.statusCode}\nClick to retry` },
    error: { class: 'error', icon: 'times-circle', title: "Link doesn't exist or took too long to respond\nClick to retry" }
  }
  
  const config = testIcons[link.test]
  if (!config) return ''
  
  return `<a class="${config.class}" target="_blank" href="${href}" title="${config.title}"><i class="fas fa-${config.icon}"></i></a>`
}

/**
 * Build view row HTML for popup link/asset
 * @param {Object} link - Link object
 * @param {string} category - Category ('links', 'files', 'assets')
 * @returns {string} HTML string for view row
 */
function buildPopupLinkRow(link, category) {
  const href = link.href || link.link
  const originalUrl = link._href || link._link
  const isAsset = !!link.link
  const isLocalPage = isUrlLocal(href) && !isUrlAnchor(href)
  
  const tagsHTML = buildTagsHTML(link, originalUrl)
  const instancesHTML = formatInstances(link.instances, i => i.text || i.alt || i.title)
  
  let testIconsHTML = ''
  if (!isUrlProtocol(href) && !isUrlAnchor(href) && category === 'links') {
    testIconsHTML = buildTestIconsHTML(link, href)
  }
  
  const downloadHTML = category !== 'links' 
    ? `<a class="download" href="${href}" title="Download"><i class="fas fa-file-download"></i></a>` 
    : ''
  
  // Determine the icon to display
  let iconHTML
  if (link.isBroken) {
    iconHTML = getFAIcon('broken-link')
  } else if (isLocalPage && !isAsset) {
    iconHTML = getFAIcon('page')
  } else {
    iconHTML = getFAIcon(href)
  }
  
  return `
    <div class="view-row">
      <div class="type">
        ${iconHTML}
      </div>
      <div class="link">
        <p>${href}</p>
      </div>
      <div class="tools">
        <a class="goto" target="_blank" href="${href}" title="Open"><i class="fas fa-external-link-alt"></i></a>
        ${testIconsHTML}
        ${downloadHTML}
        <div class="info">
          <div class="hover-popup-icon">
            <span class="fa-stack fa-1x">
              <i class="fas fa-square fa-stack-2x"></i>
              <i class="fas fa-info fa-stack-1x fa-inverse"></i>
            </span>
            <div class="hover-popup">
              ${tagsHTML}
              ${instancesHTML}
            </div>
          </div>
        </div>
      </div>
    </div>
  `
}

/**
 * Build view row HTML for popup media
 * @param {Object} file - Media file object
 * @returns {string} HTML string for view row
 */
function buildPopupMediaRow(file) {
  const isImage = isUrlImage(file.src)
  const altText = file.instances?.[0]?.alt || ''
  
  const tagsHTML = buildTagsHTML(file, file._src)
  const instancesHTML = formatInstances(file.instances, i => i.alt || i.title)
  
  const imageHTML = isImage 
    ? `<img src="${file.src}" alt="${altText}" title="${altText}">` 
    : getFAIcon(file.src)
  
  return `
    <div class="view-row">
      <div class="image">${imageHTML}</div>
      <div class="link">
        <p>${file.src}</p>
      </div>
      <div class="tools">
        <a class="goto" target="_blank" href="${file.src}" title="Open"><i class="fas fa-external-link-alt"></i></a>
        <a class="download" href="${file.src}" title="Download"><i class="fas fa-file-download"></i></a>
        <div class="info">
          <div class="hover-popup-icon">
            <span class="fa-stack fa-1x">
              <i class="fas fa-square fa-stack-2x"></i>
              <i class="fas fa-info fa-stack-1x fa-inverse"></i>
            </span>
            <div class="hover-popup">
              ${tagsHTML}
              ${instancesHTML}
            </div>
          </div>
        </div>
      </div>
    </div>
  `
}

/**
 * Categorize link into appropriate section
 * @param {Object} link - Link object
 * @returns {string} Category name ('links', 'files', 'assets')
 */
function categorizeLink(link) {
  const href = link.href || link.link
  const isAsset = !!link.link
  
  if (isAsset) return 'assets'
  
  // Broken links should go in 'links' section
  if (link.isBroken) return 'links'
  
  if (!isUrlHTMLFile(href) && !isUrlProtocol(href)) return 'files'
  return 'links'
}

/** 
 * Setup the popup inspector for a crawled page
 * @param {string} url - The URL to setup the popup for
 */
function setupPopup(url) {
  const popup = document.querySelector("#inspecter")
  const page = crawl[url]

  // Hide delete button if this is the original URL
  const deleteButton = popup.querySelector(".popup-delete")
  if (deleteButton) {
    deleteButton.style.display = url === baseUrl ? 'none' : ''
  }

  // Set popup title content
  const crawlMethodIcon = page.crawlMethod === 'live' 
    ? '<i class="fas fa-window-restore" title="Crawled using Live Mode (JavaScript executed)"></i>' 
    : '<i class="fas fa-download" title="Crawled using Fetch Mode (raw HTML)"></i>'
  const crawlMethodLabel = page.crawlMethod === 'live' ? 'Live Crawl' : 'Fetch Crawl'
  
  popup.querySelector(".card-title").innerHTML = `
    <h2>${page.title}</h2>
    <h3>${url}<br><br></h3>
    <p>${page.description}</p>
    <p style="margin-top: 10px; font-size: 0.9em; opacity: 0.8;">
      ${crawlMethodIcon} ${crawlMethodLabel}
    </p>
  `

  // Categorize and build HTML for links and assets
  const html = { links: '', files: '', assets: '', media: '' }
  const items = [...page.links, ...page.assets]
  
  // Sort items using the sortLinks function before displaying
  items.sort(sortLinks)
  
  items.forEach(link => {
    const category = categorizeLink(link)
    html[category] += buildPopupLinkRow(link, category)
  })

  // Build HTML for media
  page.media.forEach(file => {
    html.media += buildPopupMediaRow(file)
  })

  // Render all sections with empty state fallback
  const sections = ['links', 'files', 'assets', 'media']
  sections.forEach(section => {
    const content = html[section] || '<div class="empty-row">There are no items here.</div>'
    popup.querySelector(`#popup-view-${section} .view-items`).innerHTML = content
  })

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

    //Add all instances to the instance string (filter out duplicates)
    instancesText = formatInstances(link.instances, i => i.alt || i.title)

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
      `<div class="info">
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
  
  // Reapply search filter if active
  applySearchFilter('#assets')

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
    instancesText = formatInstances(link.instances, i => i.text || i.title)

    //Add to HTML to html string for the item
    html += `
        <div class="view-row">
          <div class="select">`
    if (!isUrlProtocol(link.href) && !isUrlAnchor(link.href))
      html += `<input type="checkbox">`
    html += `</div>
        <div class="type">`
    if (link.isBroken)
      html += getFAIcon('broken-link')
    else if (link.tags.tag == 'a')
      html += getFAIcon(link.href)
    else
      html += getFAIcon(link.tags.tag)
    html += `</div>
            <div class="link">`+
      '<p>' + link.href + '</p>' +
      `</div>
        <div class="tools">`
    if (!link.isBroken)
      html += '<a class="goto" target="_blank" href="' + link.href + '" title="Open link"><i class="fas fa-external-link-alt"></i></a>'
    if (!isUrlProtocol(link.href) && !isUrlAnchor(link.href) && !link.isBroken) {
      if (!link.test || link.test === null)
        html += '<a class="test" target="_blank" href="' + link.href + '" title="Test the link"><i class="fas fa-question-circle"></i></a>'
      else if (link.test === "success")
        html += '<a class="success" target="_blank" href="' + link.href + '" title="Link is valid"><i class="fas fa-check-circle"></i></a>'
      else if (link.test === "warning")
        html += '<a class="warning" target="_blank" href="' + link.href + '" title="Returned a status code of ' + link.statusCode + '"><i class="fas fa-exclamation-circle"></i></a>'
      else if (link.test === "failed")
        html += '<a class="error" target="_blank" href="' + link.href + '" title="Test the link"><i class="fas fa-exclamation-circle"></i></a>'
    }
    html += `<div class="info">
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
      </div>
      `

  })
  //Add html to page
  if (html.length > 0)
    wrapper.innerHTML = html
  else
    wrapper.innerHTML = `<div class="empty-row">There are no items here.</div>`
  
  // Reapply search filter if active
  applySearchFilter('#links')
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
    instancesText = formatInstances(link.instances, i => i.text || i.title)

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
      </div>
      `
  })
  //Add html to page
  if (html.length > 0)
    wrapper.innerHTML = html
  else
    wrapper.innerHTML = `<div class="empty-row">There are no items here.</div>`
  
  // Reapply search filter if active
  applySearchFilter('#files')
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

    instancesText = formatInstances(file.instances, i => i.alt)

    //Add to HTML to html string for the item
    html += `
        <div class="view-row">
            <div class="select">
            <input type="checkbox">
          </div>
          <div class="image">`
    if (isImage) {
      const altText = file.instances && file.instances[0] && file.instances[0].alt ? file.instances[0].alt : ''
      html += '<img class="expand-image" src="' + file.src + '" alt="' + altText + '" title="' + altText + '">'
    }
    else html += getFAIcon(file.src)
    html += `</div>
          <div class="link">`+
      '<p>' + file.src + '</p>' +
      `</div>
       <div class="tools">
         <a class="goto" target="_blank" href="` + file.src + `" title="Open Image"><i class="fas fa-external-link-alt"></i></a>
         <a class="download" href="`+ file.src + `" title="Download Image"><i class="fas fa-file-download"></i></a>
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
     </div>
     `
  })
  //Add html to page
  if (html.length > 0)
    wrapper.innerHTML = html
  else
    wrapper.innerHTML = `<div class="empty-row">There are no items here.</div>`
  
  // Reapply search filter if active
  applySearchFilter('#media')

}

// Helper function to check if a URL is a duplicate page
const isDuplicatePage = (url) => {
  const page = crawl.all.links.find(link => link.href === url)
  return page && page.isDuplicate
}

/**
 * Helper function to filter and format instances, excluding duplicates
 * Groups instances by foundOn URL and shows count suffix for multiple occurrences
 * @param {Array} instances - Array of instance objects
 * @param {Function} getTextFn - Function to extract text for fragment URL
 * @returns {string} Formatted HTML string of instances
 */
const formatInstances = (instances, getTextFn) => {
  const nonDuplicateInstances = instances.filter(i => !isDuplicatePage(i.foundOn))
  
  // Group instances by foundOn URL
  const groupedInstances = new Map()
  nonDuplicateInstances.forEach(instance => {
    const url = instance.foundOn
    if (!groupedInstances.has(url)) {
      groupedInstances.set(url, [])
    }
    groupedInstances.get(url).push(instance)
  })
  
  let instancesText = '<strong>Instances:</strong>(' + nonDuplicateInstances.length + ')<ul>'
  
  groupedInstances.forEach((instanceGroup, url) => {
    const count = instanceGroup.length
    const firstInstance = instanceGroup[0]
    const fragmentUrl = createTextFragmentUrl(url, getTextFn(firstInstance))
    
    // Add count suffix if multiple instances on same page
    const countSuffix = count > 1 ? ` (${count})` : ''
    instancesText += '<li><a href="' + fragmentUrl + '" target="_blank">' + url + countSuffix + '</a><ul>'
    
    // Show details from first instance
    if (firstInstance.title)
      instancesText += '<li>Title: <strong>' + firstInstance.title + '</strong></li>'
    if (firstInstance.text)
      instancesText += '<li>Text: <strong>' + firstInstance.text + '</strong></li>'
    if (firstInstance.alt)
      instancesText += '<li>Alt: <strong>' + firstInstance.alt + '</strong></li>'
    Object.keys(firstInstance.tags).forEach(i1 => instancesText += firstInstance.tags[i1] ? "<li>" + i1 + ": <strong>" + firstInstance.tags[i1] + "</strong></li>" : '')
    
    instancesText += '</ul></li>'
  })
  
  instancesText += '</ul>'
  return instancesText
}

const getPages = () => crawl.all.links.filter(link => isUrlLocal(link.href) && isUrlHTMLFile(link.href) && !isUrlAnchor(link.href) && !isUrlScript(link.href) && !isUrlStyleSheet(link.href) && !link.isBroken)
const getLinks = () => crawl.all.links.filter(link => (isUrlHTMLFile(link.href) && !isUrlLocal(link.href)) || isUrlAnchor(link.href) || isUrlProtocol(link.href) || link.isBroken)
const getFiles = () => crawl.all.links.filter(link => !isUrlHTMLFile(link.href) && !isUrlProtocol(link.href) && !link.isBroken)