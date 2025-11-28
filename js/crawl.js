//Crawled Pages
let crawl = { all: { media: [], links: [], assets: [] } }
//Track whats being crawled
let crawling = []
//Cache for page hashes to optimize duplicate detection
const pageHashCache = new Map()
//Mutex lock to prevent race conditions
const crawlLocks = new Set()

// Rate limiting queue implementation
const fetchQueue = []
let isProcessingQueue = false
let lastFetchTime = 0

const rateLimitedFetch = async (fetchFn) => {
  return new Promise((resolve, reject) => {
    // Add to queue
    fetchQueue.push({ fetchFn, resolve, reject })
    
    // Start processing if not already running
    if (!isProcessingQueue) {
      processQueue()
    }
  })
}

const processQueue = async () => {
  if (fetchQueue.length === 0) {
    isProcessingQueue = false
    return
  }
  
  isProcessingQueue = true
  const { fetchFn, resolve, reject } = fetchQueue.shift()
  
  // Apply rate limiting
  const now = Date.now()
  const timeSinceLastFetch = now - lastFetchTime
  const rateLimit = settings?.crawl?.rateLimitMs || 100
  
  if (timeSinceLastFetch < rateLimit) {
    const delay = rateLimit - timeSinceLastFetch
    await new Promise(r => setTimeout(r, delay))
  }
  
  lastFetchTime = Date.now()
  
  // Execute the fetch
  try {
    const result = await fetchFn()
    resolve(result)
  } catch (error) {
    reject(error)
  }
  
  // Process next item in queue
  processQueue()
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
 * Check if a URL is valid and doesn't contain unresolved template variables
 * @param {string} url - URL to validate
 * @returns {boolean} - True if valid, false otherwise
 */
/**
 * Validate if a URL is valid and not a template/variable
 * @param {string} url - URL to validate
 * @returns {boolean} - True if valid URL
 */
function isValidURL(url) {
  return true;
  if (!url || typeof url !== 'string') return false
  
  try {
    // Filter out template literals and JavaScript expressions
    if (url.includes('${') || url.includes('%7B') || url.includes('%7D')) return false
    if (url.includes('{') && url.includes('}')) return false
    
    // Filter out JavaScript ternary operators and logical expressions
    if (url.includes('?') && url.includes(':') && (url.includes("'") || url.includes('"'))) return false
    
    // Filter out other variable patterns
    if (url.match(/\$\w+/)) return false // $variable
    if (url.match(/\{\{.*\}\}/)) return false // {{variable}}
    if (url.match(/%[A-Z0-9]{2}%[A-Z0-9]{2}/)) return false // Multiple encoded special chars that suggest template syntax
    
    // Additional validation: try to parse as URL for http/https URLs
    if (url.startsWith('http://') || url.startsWith('https://')) {
      const urlObj = new URL(url)
      // Check for invalid characters in hostname
      if (!urlObj.hostname || urlObj.hostname.includes(' ')) return false
    }
    
    return true
  } catch (error) {
    showNotification('Invalid URL detected: ' + url, 'warning', 3000)
    return false
  }
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
* Function to crawl the URL for images, links, scripts, and stylesheets
* @param {string} url - The url to crawl
* @param {boolean} addToAll - If true add to crawl all
* @returns {promise} - A promise that resolves when the crawl is complete
*/
async function crawlURL(url, addToAll = true) {
    return new Promise(async (resolve, reject) => {
  
      // Check for race condition - if already crawling this URL, skip
      if (crawlLocks.has(url)) {
        console.log(`Already crawling ${url}, skipping duplicate request`)
        return
      }
      
      // Acquire lock
      crawlLocks.add(url)
      
      // Show toast notification for crawling
      if (typeof showNotification === 'function') {
        showNotification(`Crawling: ${url}`, 'info', 2000)
      }
  
      //Remove any old filter and search stuff
      document.querySelectorAll(".filter-icon").forEach(item => item.classList.remove("active"))
      document.querySelectorAll(".searchbar").forEach(item => item.classList.remove("active"))
      document.querySelectorAll(".searchbar .form-item input").forEach(item => item.value = "")
      document.querySelectorAll(".view-items .view-row").forEach(item => item.classList.remove("hidden"))
  
      crawling.push(url)
  
      // Helper function to attempt fetch with CORS bypass
      const fetchWithCorsProxy = async (url) => {
        return rateLimitedFetch(async () => {
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
      const fetchDirect = async (url) => {
        return rateLimitedFetch(async () => {
          const res = await fetch(url)
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          return await res.text()
        })
      }
  
      // Try direct fetch first, fall back to CORS proxy if it fails
      const fetchData = async (url) => {
        try {
          return await fetchDirect(url)
        } catch (directError) {
          // Silently fall back to CORS proxy
          try {
            return await fetchWithCorsProxy(url)
          } catch (proxyError) {
            // If both fail, throw the proxy error
            throw proxyError
          }
        }
      }
  
      fetchData(url)
        .then(data => {
  
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
            element => element.getAttribute("href") !== null &&
              element.getAttribute("href").indexOf("javascript:void(0);") === -1 &&
              !element.getAttribute("href").startsWith("?")
          ).forEach(element => {
            let link = createLinkObject(url, element)
            // Validate URL before adding
            //if ((!isValidURL(link.href) || !isValidURL(link._href)) && !link.isBroken) {console.log("Invalid URL detected in <a> tag:", link); return}
            let found
            if (!(found = links.find(i => i.href === link.href || i.href === link._href))) {
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
            // Validate URL before adding
            if (!isValidURL(link.href) || !isValidURL(link._href)) return
            if ((link._href && (link._href.startsWith("?")))) return
            let found
            if (!(found = links.find(i => i.href === link.href || i.href === link._href))) {
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
            // Validate URL before adding
            if (!isValidURL(image.src)) return
  
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
              // Validate URL before adding
              if (!isValidURL(src)) return
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
                    // Validate URL before adding
                    if (!isValidURL(src)) return
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
                    // Validate URL before adding
                    if (!isValidURL(src)) return
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
                  
                  // Validate URL before adding
                  if (!isValidURL(link.href) || !isValidURL(link._href)) return
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
            data
          }
  
          if (addToAll) {
  
            //For Links - add link to crawl all list or add to instance if already crawled
            page.links.forEach(link => {
              const existingLink = crawl.all.links.find(i => i.href === link.href)
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
            const linkIndex = crawl.all.links.findIndex(i => i.href == url)
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
          
          // Release lock
          crawlLocks.delete(url)

          // Show completion toast for this URL
          if (typeof showNotification === 'function') {
            showNotification(`Crawl completed: ${url}`, 'success', 3000)
            // Show next crawl item if there is one
            if (crawling.length > 0) {
              showNotification(`Crawling: ${crawling[0]}`, 'info', 2000)
            }
          }

          resolve(page)        }).catch(error => {
  
          //find and remove element from array
          let index = crawling.indexOf(url)
          if (index > -1) crawling.splice(index, 1)
          
          // Release lock
          crawlLocks.delete(url)
  
          // Show error toast and next crawl item if there is one
          if (typeof showNotification === 'function') {
            showNotification(`Failed to crawl: ${url}`, 'error', 5000)
            if (crawling.length > 0) {
              showNotification(`Crawling: ${crawling[0]}`, 'info', 5000)
            }
          }
          
          const linkIndex = crawl.all.links.findIndex(i => i.href === url)
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