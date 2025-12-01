//Crawled Pages
let crawl = { all: { media: [], links: [], assets: [] } }
//Cache for page hashes to optimize duplicate detection
const pageHashCache = new Map()
//Mutex lock to prevent race conditions
const crawlLocks = new Set()

// Separate queue systems for tabs (limited) and HTTP fetches (higher concurrency)
const tabQueue = []
const fetchQueue = []
let activeTabs = 0
let activeFetches = 0
let lastFetchTime = 0
let isProcessingTabQueue = false
let isProcessingFetchQueue = false

const getMaxConcurrentTabs = () => {
  return settings?.crawl?.maxConcurrentTabs || 5
}

const getMaxConcurrentFetches = () => {
  return 20 // Higher limit for HTTP requests
}

const rateLimitedTab = async (fetchFn) => {
  return new Promise((resolve, reject) => {
    // Add to tab queue
    tabQueue.push({ fetchFn, resolve, reject })
    
    // Start processing
    processTabQueue()
  })
}

const rateLimitedFetch = async (fetchFn) => {
  return new Promise((resolve, reject) => {
    // Add to fetch queue
    fetchQueue.push({ fetchFn, resolve, reject })
    
    // Start processing
    processFetchQueue()
  })
}

const processTabQueue = async () => {
  // Prevent concurrent execution of queue processor
  if (isProcessingTabQueue) {
    return
  }
  
  isProcessingTabQueue = true
  
  // Process multiple items concurrently up to the tab limit
  while (activeTabs < getMaxConcurrentTabs() && tabQueue.length > 0) {
    const { fetchFn, resolve, reject } = tabQueue.shift()
    
    // Apply rate limiting before starting new tab
    const now = Date.now()
    const timeSinceLastFetch = now - lastFetchTime
    const rateLimit = settings?.crawl?.rateLimitMs || 100
    
    if (timeSinceLastFetch < rateLimit) {
      const delay = rateLimit - timeSinceLastFetch
      await new Promise(r => setTimeout(r, delay))
    }
    
    lastFetchTime = Date.now()
    activeTabs++
    
    // Execute the fetch (don't await - let it run concurrently)
    fetchFn()
      .then(result => {
        resolve(result)
      })
      .catch(error => {
        reject(error)
      })
      .finally(() => {
        activeTabs--
        // Try to process more items (schedule it for next tick to avoid recursion)
        setTimeout(() => processTabQueue(), 0)
      })
  }
  
  isProcessingTabQueue = false
}

const processFetchQueue = async () => {
  // Prevent concurrent execution of queue processor
  if (isProcessingFetchQueue) {
    return
  }
  
  isProcessingFetchQueue = true
  
  // Process multiple items concurrently up to the fetch limit
  while (activeFetches < getMaxConcurrentFetches() && fetchQueue.length > 0) {
    const { fetchFn, resolve, reject } = fetchQueue.shift()
    
    // Apply rate limiting before starting new fetch
    const now = Date.now()
    const timeSinceLastFetch = now - lastFetchTime
    const rateLimit = settings?.crawl?.rateLimitMs || 100
    
    if (timeSinceLastFetch < rateLimit) {
      const delay = rateLimit - timeSinceLastFetch
      await new Promise(r => setTimeout(r, delay))
    }
    
    lastFetchTime = Date.now()
    activeFetches++
    
    // Execute the fetch (don't await - let it run concurrently)
    fetchFn()
      .then(result => {
        resolve(result)
      })
      .catch(error => {
        reject(error)
      })
      .finally(() => {
        activeFetches--
        // Try to process more items (schedule it for next tick to avoid recursion)
        setTimeout(() => processFetchQueue(), 0)
      })
  }
  
  isProcessingFetchQueue = false
}

/**
 * Fetch page content by opening in a tab (live crawling)
 * @param {string} url - URL to crawl
 * @param {boolean} isInitialPage - Whether this is the first page (use current tab)
 * @param {string} notificationId - ID of the crawling notification to dismiss when done
 * @returns {Promise<string>} - HTML content after JavaScript execution
 */
async function fetchLive(url, isInitialPage = false, notificationId = null) {
  return rateLimitedTab(async () => {
    let tabId = null
    try {
      // Show notification when actually starting (only if notificationId provided)
      if (notificationId && typeof showNotification === 'function') {
        showNotification(`Crawling: ${url}`, 'info', 30000, notificationId)
      }
      
      // Check if tab crawling is supported
      if (typeof isTabCrawlingSupported !== 'function' || !(await isTabCrawlingSupported())) {
        throw new Error('Tab crawling not supported - missing permissions or APIs')
      }

      // Open tab (in background if not initial page)
      tabId = await openTabForCrawling(url, isInitialPage)
      
      // Wait for load + JS execution (skip wait for initial page as it's already loaded)
      if (!isInitialPage) {
        const waitTime = settings?.crawl?.liveWaitTime || 5000
        try {
          await waitForPageLoad(tabId, waitTime)
        } catch (loadError) {
          // Page load timeout or error
          await closeTab(tabId)
          throw new Error(`Page load failed: ${loadError.message}`)
        }
      }
      
      // Extract content with error handling
      let html
      try {
        html = await extractPageContent(tabId)
      } catch (extractError) {
        // Content extraction failed (CSP, permissions, etc.)
        if (tabId && !isInitialPage) {
          await closeTab(tabId)
        }
        throw new Error(`Content extraction failed: ${extractError.message}`)
      }
      
      // Close tab if not initial page
      if (!isInitialPage) {
        await closeTab(tabId)
      }
      
      return html
    } catch (error) {
      // Clean up tab on error
      if (tabId && !isInitialPage) {
        try {
          await closeTab(tabId)
        } catch (closeError) {
          console.warn('Failed to close tab after error:', closeError)
        }
      }
      
      // Log specific error types for debugging
      if (error.message.includes('not supported')) {
        console.error('Live crawling disabled: Missing permissions. Please reload the extension.')
      } else if (error.message.includes('timeout')) {
        console.warn('Live crawl timeout:', url)
      } else if (error.message.includes('blocked')) {
        console.warn('Tab blocked by popup blocker:', url)
      }
      
      throw new Error(`Live crawl failed: ${error.message}`)
    }
  })
}

/**
 * Remove HTML comments from string
 * @param {string} str - String to process
 * @returns {string} - String without HTML comments
 */
function removeHTMLComments(str) {
  return str.replace(/<!--[\s\S]*?-->/g, '')
}

/**
 * Remove JavaScript comments from string
 * @param {string} str - String to process
 * @returns {string} - String without JS comments
 */
function removeJSComments(str) {
  // Remove single-line comments
  str = str.replace(/\/\/.*$/gm, '')
  // Remove multi-line comments
  str = str.replace(/\/\*[\s\S]*?\*\//g, '')
  return str
}

/**
 * Remove CSS comments from string
 * @param {string} str - String to process
 * @returns {string} - String without CSS comments
 */
function removeCSSComments(str) {
  return str.replace(/\/\*[\s\S]*?\*\//g, '')
}

/**
 * Generate a simple hash from page content for duplicate detection
 * @param {object} page - Page object with content
 * @returns {string} - Hash string
 */
function generatePageHash(page) {
  // Create a hash based on multiple content characteristics
  const content = [
    page.title || '',
    page.description || '',
    page.links.length,
    page.media.length,
    page.assets.length,
    // Sample of link hrefs for better comparison (first 15)
    page.links.slice(0, 15).map(l => l.href).sort().join('|'),
    // Sample of media sources (first 10)
    page.media.slice(0, 10).map(m => m.src).sort().join('|'),
    // Sample of asset links (first 10)
    page.assets.slice(0, 10).map(a => a.link).sort().join('|')
  ].join(':::')
  
  // Simple string hash function
  let hash = 0
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32bit integer
  }
  return hash.toString(36)
}

/**
 * Analyze HTML to determine if page needs live crawling (framework detection)
 * @param {string} html - Raw HTML content
 * @returns {boolean} - True if live crawling is recommended
 */
function shouldUseLiveCrawling(html) {
  let score = 0
  
  // Framework indicators (+2 each)
  if (html.includes('id="root"') || html.includes('data-reactroot') || html.includes('__REACT_') || html.includes('_reactRootContainer')) {
    score += 2
    console.log('Detected React framework')
  }
  if (html.includes('id="app"') || html.includes('v-app') || html.includes('v-cloak') || html.includes('__VUE__')) {
    score += 2
    console.log('Detected Vue framework')
  }
  if (html.includes('ng-app') || html.includes('ng-controller') || html.match(/\[ng-/) || html.includes('__ngContext__')) {
    score += 2
    console.log('Detected Angular framework')
  }
  if (html.includes('__NEXT_DATA__') || html.includes('_next')) {
    score += 2
    console.log('Detected Next.js framework')
  }
  if (html.includes('__NUXT__')) {
    score += 2
    console.log('Detected Nuxt framework')
  }
  if (html.includes('data-svelte-h')) {
    score += 2
    console.log('Detected Svelte framework')
  }
  
  // Low content density (+1)
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
  if (bodyMatch) {
    const bodyText = bodyMatch[1]
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, '')
      .trim()
    
    if (bodyText.length < 100) {
      score += 1
      console.log('Detected low content density (likely client-side rendered)')
    }
  }
  
  // Many script tags (+1)
  const scriptCount = (html.match(/<script/gi) || []).length
  if (scriptCount > 5) {
    score += 1
    console.log(`Detected ${scriptCount} script tags`)
  }
  
  const needsLive = score >= 3
  console.log(`Smart mode analysis: score=${score}, needsLive=${needsLive}`)
  return needsLive
}

/**
 * Check if a page is a duplicate of an already crawled page
 * @param {object} page - Page object to check
 * @param {string} currentUrl - Current URL being checked
 * @returns {string|null} - URL of duplicate page if found, null otherwise
 */
function findDuplicatePage(page, currentUrl) {
  const currentHash = generatePageHash(page)
  
  // Check hash cache for duplicates
  for (const [url, hash] of pageHashCache) {
    if (url !== currentUrl && hash === currentHash) {
      return url
    }
  }
  
  // Store hash in cache
  pageHashCache.set(currentUrl, currentHash)
  return null
}


/**
 * Update all views after crawl completion or error
 */
function updateAllViews() {
  updatePages()
  updateAssets()
  updateLinks()
  updateFiles()
  updateMedia()
  updateOverview()
  updateAll()
}

/**
* Function to crawl the URL for images, links, scripts, and stylesheets
* @param {string} url - The url to crawl
* @param {boolean} addToAll - If true add to crawl all
* @param {boolean} isInitialPage - Whether this is the initial page (for live crawling)
* @returns {promise} - A promise that resolves when the crawl is complete
*/
async function crawlURL(url, addToAll = true, isInitialPage = false) {
    return new Promise(async (resolve, reject) => {
  
      // Check for race condition - if already crawling this URL, skip
      if (crawlLocks.has(url)) {
        console.log(`Already crawling ${url}, skipping duplicate request`)
        return
      }
      
      // Acquire lock
      crawlLocks.add(url)
      
      // Set isCrawling flag on the link object
      const linkIndex = crawl.all.links.findIndex(i => normalizeUrl(i.href) === normalizeUrl(url))
      if (linkIndex > -1) {
        crawl.all.links[linkIndex].isCrawling = true
        
        // Update pages view to show crawling icon (debounced to avoid excessive updates)
        if (typeof updatePages === 'function') {
          // Use a small delay to batch updates when multiple crawls start at once
          clearTimeout(window.updatePagesTimeout)
          window.updatePagesTimeout = setTimeout(() => updatePages(), 50)
        }
      }
      
      // Notification ID for this crawl
      const notificationId = `crawl-${url}`
  
      // Helper function to attempt fetch with CORS bypass
      const fetchWithCorsProxy = async (url, showNotif = true) => {
        return rateLimitedFetch(async () => {
          // Show notification when actually starting (only if requested)
          if (showNotif && typeof showNotification === 'function') {
            showNotification(`Crawling: ${url}`, 'info', 30000, notificationId)
          }
          
          const res = await fetch(CORS_BYPASS_URL + encodeURIComponent(url))
          if (!res.ok) throw new Error(`Network request failed with status ${res.status}`)
          const data = await res.json()
          if (data.status && data.status.http_code !== 200) {
            throw new Error(data.status.http_code)
          }
          if (!data.contents) {
            throw new Error('No content received from the URL')
          }
          return data.contents
        })
      }
  
      // Helper function to attempt direct fetch
      const fetchDirect = async (url, showNotif = true) => {
        return rateLimitedFetch(async () => {
          // Show notification when actually starting (only if requested)
          if (showNotif && typeof showNotification === 'function') {
            showNotification(`Crawling: ${url}`, 'info', 30000, notificationId)
          }
          
          const res = await fetch(url)
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          return await res.text()
        })
      }
  
      // Try direct fetch first, fall back to CORS proxy if it fails
      const fetchData = async (url, isInitialPage = false) => {
        const crawlMode = settings?.crawl?.crawlMode || 'smart'
        
        // Smart mode: analyze first, then decide
        if (crawlMode === 'smart') {
          // For the initial page, always use live crawling (it's already loaded)
          if (isInitialPage) {
            console.log(`Smart mode: using live crawl for initial page (already loaded): ${url}`)
            try {
              // Pass notificationId to show notification when fetch actually starts
              const html = await fetchLive(url, isInitialPage, notificationId)
              console.log(`Smart mode: successfully extracted initial page content (${html.length} chars)`)
              return { html, crawlMethod: 'live' }
            } catch (liveError) {
              console.error(`Failed to extract from initial page, falling back to fetch:`, liveError.message)
              console.error('Full error:', liveError)
              // Fall through to regular fetch logic below
            }
          }
          
          console.log(`Smart mode: analyzing ${url}...`)
          
          try {
            // First fetch the HTML to analyze it (no notification during analysis)
            let html
            try {
              html = await fetchDirect(url, false)
            } catch (directError) {
              html = await fetchWithCorsProxy(url, false)
            }
            
            // Analyze if it needs live crawling
            if (shouldUseLiveCrawling(html)) {
              console.log(`Smart mode: re-crawling ${url} with live mode`)
              try {
                // Show notification now that we've decided on live mode
                const liveHtml = await fetchLive(url, isInitialPage, notificationId)
                return { html: liveHtml, crawlMethod: 'live' }
              } catch (liveError) {
                console.warn(`Live crawling failed, using fetched HTML:`, liveError.message)
                // Note: notification will be shown via success completion message
                // since we're using the already-fetched HTML
                return { html, crawlMethod: 'fetch' } // Fall back to the already-fetched HTML
              }
            } else {
              console.log(`Smart mode: using fetched HTML for ${url}`)
              // Note: notification will be shown via success completion message
              // since the fetch already completed during analysis
              return { html, crawlMethod: 'fetch' } // Use the fetched HTML
            }
          } catch (error) {
            console.error(`Smart mode failed for ${url}:`, error.message)
            throw error
          }
        }
        
        // Live mode: always use live crawling
        if (crawlMode === 'live') {
          console.log(`Live mode: crawling ${url}${isInitialPage ? ' (initial page)' : ''}`)
          
          try {
            const html = await fetchLive(url, isInitialPage, notificationId)
            return { html, crawlMethod: 'live' }
          } catch (liveError) {
            console.error(`Live crawling failed for ${url}:`, liveError.message)
            throw liveError
          }
        }
        
        // Fetch mode: regular fetch method (no live crawling)
        try {
          const html = await fetchDirect(url, true)
          return { html, crawlMethod: 'fetch' }
        } catch (directError) {
          // Silently fall back to CORS proxy
          try {
            const html = await fetchWithCorsProxy(url, true)
            return { html, crawlMethod: 'fetch' }
          } catch (proxyError) {
            // If both fail, throw the proxy error
            throw proxyError
          }
        }
      }
  
      fetchData(url, isInitialPage)
        .then(result => {
          const { html: data, crawlMethod } = result
  
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
            element => {
              const href = element.getAttribute("href")
              return href !== null &&
                !href.startsWith("javascript:") &&
                !href.startsWith("?") &&
                href !== "about:blank"
            }
          ).forEach(element => {
            let link = createLinkObject(url, element)
            let found
            // Normalize URLs to prevent duplicates with/without trailing slashes
            if (!(found = links.find(i => normalizeUrl(i.href) === normalizeUrl(link.href) || normalizeUrl(i.href) === normalizeUrl(link._href)))) {
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
            // Filter out about:blank
            const src = element.getAttribute("src")
            if (src === "about:blank" || link.href === "about:blank" || link._href === "about:blank") return
            let found
            // Normalize URLs to prevent duplicates with/without trailing slashes
            if (!(found = links.find(i => normalizeUrl(i.href) === normalizeUrl(link.href) || normalizeUrl(i.href) === normalizeUrl(link._href)))) {
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
              if (!(found = media.find(i => i.src === image.src)))
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
              if (!(foundImage = media.find(i => i.src === image.src)))
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
              if (!(foundVideo = media.find(i => i.src === video.src)))
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
              if (!(foundAudio = media.find(i => i.src === audio.src)))
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
            const imageUrlRegex = getImageUrlRegex();
            const match = imageUrlRegex.exec(element.style.cssText);
            if (match) {
              let src = match.groups.image.replace(chromeExtensionRegex, '/').replace('viewer.html', '')
              let image = createImageObject(url, null, src)
              let found
              if (isUrlImage(image.src))
                if (!(found = media.find(i => i.src === image.src))) {
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
              // Remove CSS comments before parsing
              const cleanContent = removeCSSComments(element.innerHTML)
              const imageUrlRegex = getImageUrlRegex();
              const matches = cleanContent.match(imageUrlRegex);
              if (matches)
                matches.forEach(style => {
                  const regex = getImageUrlRegex();
                  const match = regex.exec(style);
                  if (match) {
                    let src = match.groups.image.replace(chromeExtensionRegex, '/').replace('viewer.html', '')
                    let found
                    let image = createImageObject(url, null, src)
                    if (isUrlImage(image.src))
                    if (!(found = media.find(i => i.src === image.src))) {
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
                  }
                })
            })
  
          //Find Background Images/Links in script tags - get links/images and add to crawl all list, but if already found add as an instance
          if (!isUrlHTMLFile(url) || (isUrlHTMLFile(url) && settings.crawl.onPageScripts))
            doc.querySelectorAll('script').forEach(element => {
              // Remove JS comments before parsing
              const cleanContent = removeJSComments(element.innerHTML)
  
              //Look for BackgroundImages
              const imageMatches = cleanContent.match(getImageUrlRegex());
              if (imageMatches)
                imageMatches.forEach(style => {
                  const regex = getImageUrlRegex();
                  const match = regex.exec(style);
                  if (match) {
                    let src = match.groups.image.replace(chromeExtensionRegex, '/').replace('viewer.html', '')
                    let image = createImageObject(url, null, src)
                    let found
                    if (isUrlImage(image.src))
                    if (!(found = media.find(i => i.src === image.src))) {
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
                  }
                })
  
              //Look for Links
              const aTagMatches = cleanContent.match(getATagRegex());
              if (aTagMatches)
                aTagMatches.forEach(element => {
                  element += "</a>"
                  let linkElement = createElementFromHTML(element)
                  
                  if (!linkElement) {
                    return
                  }
                  
                  let link = createLinkObject(url, linkElement)
                  
                  // Skip if link creation failed
                  if (!link) {
                    showNotification('Failed to create link object', 'warning', 3000)
                    return
                  }
                  
                  if ((link._href && (link._href.startsWith("?")))) return
                  let found

                  if (!(found = links.find(i => i.href === link.href) || (link.href.length === 1 && link.href[0] === '/'))) {
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
            title: doc.querySelector("title")?.textContent,
            description: doc.querySelector("meta[name='description']")?.content,
            links: links.sort(sortLinks),
            media,
            assets,
            doc,
            data,
            crawlMethod: crawlMethod || 'unknown'
          }
  
          if (addToAll) {
  
            //For Links - add link to crawl all list or add to instance if already crawled
            page.links.forEach(link => {
              // Normalize URLs to prevent duplicates with/without trailing slashes
              const existingLink = crawl.all.links.find(i => normalizeUrl(i.href) === normalizeUrl(link.href))
              if (!existingLink) {
                crawl.all.links.push(link)
              } else {
                existingLink.instances = [...existingLink.instances, ...link.instances]
              }
            })
            //For images - add link to crawl all list or add to instance if already crawled
            page.media.forEach(file => {
              const existingMedia = crawl.all.media.find(i => i.src === file.src)
              if (!existingMedia) {
                crawl.all.media.push(file)
              } else {
                existingMedia.instances = [...existingMedia.instances, ...file.instances]
              }
            })
            //For assets - add link to crawl all list or add to instance if already crawled
            page.assets.forEach(asset => {
              const existingAsset = crawl.all.assets.find(i => i.link === asset.link)
              if (!existingAsset) {
                crawl.all.assets.push(asset)
              } else {
                existingAsset.instances = [...existingAsset.instances, ...asset.instances]
              }
            })
  
            //Add crawled page to crawl object
            crawl[url] = page
            
            // Clear any previous error/warning flags on successful crawl
            const linkIndex = crawl.all.links.findIndex(i => normalizeUrl(i.href) === normalizeUrl(url))
            if (linkIndex > -1) {
              delete crawl.all.links[linkIndex].isError
              delete crawl.all.links[linkIndex].isWarning
              delete crawl.all.links[linkIndex].statusCode
              delete crawl.all.links[linkIndex].errorMessage
            }
            
            // Check for duplicate pages
            const duplicateOf = findDuplicatePage(page, url)
            if (duplicateOf) {
              // Mark this page as a duplicate
              if (linkIndex > -1) {
                crawl.all.links[linkIndex].isDuplicate = true
                crawl.all.links[linkIndex].duplicateOf = duplicateOf
              }
            }
  
            //Sort links
            crawl.all.links = crawl.all.links.sort(sortLinks)
          }
          
          // Clear isCrawling flag
          const linkIndex = crawl.all.links.findIndex(i => normalizeUrl(i.href) === normalizeUrl(url))
          if (linkIndex > -1) {
            delete crawl.all.links[linkIndex].isCrawling
          }
          
          // Release lock
          crawlLocks.delete(url)
  
          // Update all views
          updateAllViews()

          // Replace the crawling notification with completion
          if (typeof replaceNotification === 'function') {
            replaceNotification(notificationId, `Crawl completed: ${url}`, 'success', 2000)
          }

          resolve(page)        
        }).catch(error => {
          
          // Release lock
          crawlLocks.delete(url)
          
          // Replace the crawling notification with error
          if (typeof replaceNotification === 'function') {
            replaceNotification(notificationId, `Failed to crawl: ${url}`, 'error', 5000)
          }
          
          const linkIndex = crawl.all.links.findIndex(i => normalizeUrl(i.href) === normalizeUrl(url))
          
          // Clear isCrawling flag
          if (linkIndex > -1) {
            delete crawl.all.links[linkIndex].isCrawling
          }
          
          // Update pages view to show error icon instead of crawling icon
          if (typeof updatePages === 'function') {
            updatePages()
          }
          
          if (linkIndex > -1) {
            if (!isNaN(error.message)) {
              crawl.all.links[linkIndex].isWarning = true
              crawl.all.links[linkIndex].statusCode = error.message
              crawl.all.links[linkIndex].errorMessage = `Received HTTP status code ${error.message}`
            } else {
              crawl.all.links[linkIndex].isError = true
              crawl.all.links[linkIndex].errorMessage = error.message || 'Failed to load page - it may be inaccessible, blocked by CORS, or taking too long to respond'
            }
          }
  
          // Update all views
          updateAllViews()
  
          reject(error[0] ?? error)
        })
    })
  }

/**
* Function to create a link object from an element
* @param {string} url - The url location of where this element was
* @param {Element} element - The element to create the link from
* @returns {Object} Link object with href, tags, instances, and potentially isBroken flag
*/
function createLinkObject(url, element) {
    // Return null if element is invalid
    if (!element) return null

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
    try {
      link.href = formatLink(url, link.href)
    } catch (e) {
      link.isBroken = true
    }
  
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