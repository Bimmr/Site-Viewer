/**
 * Determines if a URL points to an HTML file or page
 * @param {string} url - The URL to check
 * @returns {boolean} True if the URL is an HTML file/page
 */
const isUrlHTMLFile = url => {
  try {
    const pathname = new URL(url).pathname.split('/').pop();
    if (pathname.indexOf('.') <= 0) return true;
    if (url.includes(".html") || url.includes(".shtml") || url.includes(".htm") || url.includes(".aspx") || url.includes(".asp") || url.includes(".jsp") || url.includes(".php") || url.includes(".xhtml")) return true;
    
    const lastDotIndex = pathname.lastIndexOf('.');
    const lastSlashOrStart = pathname.lastIndexOf('/') + 1;
    
    if (lastDotIndex > lastSlashOrStart) {
      const afterDot = pathname.substring(lastDotIndex + 1);
      // Extensions longer than 4 chars or with special chars are likely not file extensions
      if (afterDot.length > 4 || afterDot.includes('-') || afterDot.includes('_') || afterDot.includes('@')) {
        return true;
      }
      return false;
    }
    return true;
  } catch {
    return false
  }
}

/**
 * Normalizes a URL by removing trailing slashes (except for root paths)
 * @param {string} url - The URL to normalize
 * @returns {string} Normalized URL
 */
const normalizeUrl = url => {
  if (!url) return url;
  try {
    const urlObj = new URL(url);
    if (urlObj.pathname === '/' || urlObj.pathname === '') {
      return url;
    }
    if (url.endsWith('/')) {
      return url.slice(0, -1);
    }
    return url;
  } catch {
    return url.endsWith('/') ? url.slice(0, -1) : url;
  }
}

// URL type checking utilities
const isUrlPDFFile = url => url.includes('.pdf')
const isUrlProtocol = url => /^[a-z][a-z0-9+.-]*:/i.test(url) && !url.match(/^https?:/i)

/**
 * Extracts the protocol from a URL (excluding http/https)
 * @param {string} url - The URL to parse
 * @returns {string|null} The protocol name (lowercase) or null
 */
const getUrlProtocol = url => {
  const match = url.match(/^([a-z][a-z0-9+.-]*):/i)
  if (!match) return null
  const protocol = match[1].toLowerCase()
  return (protocol === 'http' || protocol === 'https') ? null : protocol
}

const isUrlLocal = url => (url.toLowerCase().includes(hostURL.toLowerCase()) && url.toLowerCase().indexOf(hostURL.toLowerCase()) === 0) || (!url.match(httpRegex) && !isUrlProtocol(url))

/**
 * Checks if a URL is an anchor link on the same site
 * @param {string} url - The URL to check
 * @returns {boolean} True if the URL is an anchor on the current site
 */
const isUrlAnchor = url => {
  if (!url.includes("#")) return false
  try {
    const urlObj = new URL(url)
    const urlHost = urlObj.origin
    return urlHost === hostURL
  } catch {
    return url.includes("#")
  }
}
const isUrlImage = url => url.includes(".png") || url.includes(".gif") || url.includes(".svg") || url.includes(".jpg") || url.includes(".jpeg") || url.includes(".bmp") || url.includes(".webp") || url.includes(".ico") || url.includes(".tiff") || url.includes(".tif") || url.includes(".avif") || url.startsWith("data:image/")
const isUrlVideo = url => url.includes(".mp4") || url.includes(".webm") || url.includes(".ogg") || url.includes(".ogv") || url.includes(".avi") || url.includes(".mov") || url.includes(".wmv") || url.includes(".flv") || url.includes(".m4v") || url.includes(".mkv")
const isUrlAudio = url => url.includes(".mp3") || url.includes(".wav") || url.includes(".ogg") || url.includes(".oga") || url.includes(".m4a") || url.includes(".aac") || url.includes(".flac") || url.includes(".wma")
const isUrlStyleSheet = url => url.includes(".css") || url.includes(".scss") || url.includes(".sass") || url.includes(".less") || url.includes("fonts.googleapis.com/css")
const isUrlScript = url => url.includes(".js") || url.includes(".jsx") || url.includes(".ts") || url.includes(".tsx") || url.includes(".mjs") || url.includes(".cjs") || url.includes("googletagmanager.com/gtag/js")
const isUrlFont = url => url.includes(".ttf") || url.includes(".otf") || url.includes(".woff") || url.includes(".woff2") || url.includes(".eot") || url.includes("fonts.googleapis.com") || url.includes("fonts.gstatic.com")
const isUrlDocument = url => url.includes(".doc") || url.includes(".docx") || url.includes(".xls") || url.includes(".xlsx") || url.includes(".ppt") || url.includes(".pptx") || url.includes(".odt") || url.includes(".ods") || url.includes(".odp")
const isUrlArchive = url => url.includes(".zip") || url.includes(".rar") || url.includes(".7z") || url.includes(".tar") || url.includes(".gz") || url.includes(".bz2")
const isUrlData = url => url.includes(".json") || url.includes(".xml") || url.includes(".csv") || url.includes(".yaml") || url.includes(".yml")


/**
 * Creates an HTML element from a string
 * @param {string} htmlString - HTML string to convert
 * @returns {HTMLElement} The created HTML element
 */
function createElementFromHTML(htmlString) {
    const template = document.createElement('template');
    template.innerHTML = htmlString.trim();
    return template.content.firstChild;
}

/**
 * Returns the appropriate icon and sort order for a URL or tag type
 * @param {string} value - A URL or tag name (e.g., 'page', 'broken-link')
 * @returns {{icon: string, sortOrder: number}} Object containing icon HTML and sort order
 */
function getFAIcon(value) {
    // Protocol icons mapping
    const protocolIcons = {
        'tel': { icon: '<i class="fas fa-phone"></i>', sortOrder: 11 },
        'mailto': { icon: '<i class="fas fa-envelope"></i>', sortOrder: 12 },
        'fax': { icon: '<i class="fas fa-fax"></i>', sortOrder: 11 }
    }
    
    // Tag icons mapping
    const tagIcons = {
        'page': { icon: '<i class="fas fa-file-lines"></i>', sortOrder: 1 },
        'iframe': { icon: '<i class="fas fa-window-restore"></i>', sortOrder: 20 },
        'img': { icon: '<i class="fas fa-image"></i>', sortOrder: 21 },
        'video': { icon: '<i class="fas fa-file-video"></i>', sortOrder: 22 },
        'audio': { icon: '<i class="fas fa-file-audio"></i>', sortOrder: 23 },
        'link': { icon: '<i class="fab fa-css3-alt"></i>', sortOrder: 30 },
        'style': { icon: '<i class="fab fa-css3-alt"></i>', sortOrder: 30 },
        'script': { icon: '<i class="fab fa-js-square"></i>', sortOrder: 31 },
        'broken-link': { icon: '<i class="fas fa-unlink"></i>', sortOrder: 100 }
    }
    
    // URL type checks with icons (order matters - most specific first)
    const urlChecks = [
        { check: isUrlAnchor, icon: '<i class="fas fa-anchor"></i>', sortOrder: 1 },
        { check: isUrlPDFFile, icon: '<i class="fas fa-file-pdf"></i>', sortOrder: 20 },
        { check: isUrlDocument, icon: '<i class="fas fa-file-word"></i>', sortOrder: 21 },
        { check: isUrlArchive, icon: '<i class="fas fa-file-archive"></i>', sortOrder: 22 },
        { check: isUrlData, icon: '<i class="fas fa-file-code"></i>', sortOrder: 23 },
        { check: isUrlImage, icon: '<i class="fas fa-image"></i>', sortOrder: 24 },
        { check: isUrlVideo, icon: '<i class="fas fa-file-video"></i>', sortOrder: 25 },
        { check: isUrlAudio, icon: '<i class="fas fa-file-audio"></i>', sortOrder: 26 },
        { check: isUrlStyleSheet, icon: '<i class="fab fa-css3-alt"></i>', sortOrder: 30 },
        { check: isUrlScript, icon: '<i class="fab fa-js-square"></i>', sortOrder: 31 },
        { check: isUrlFont, icon: '<i class="fas fa-font"></i>', sortOrder: 32 },
        { check: isUrlHTMLFile, icon: '<i class="fas fa-link"></i>', sortOrder: 90 }
    ]
    
    // Check if it's a tag
    if (tagIcons[value]) return tagIcons[value]
    
    // Try to parse as URL
    try {
        new URL(value)
        
        // Check for specific protocols
        const protocol = getUrlProtocol(value)
        if (protocol) {
            return protocolIcons[protocol] || { icon: '<i class="fas fa-globe"></i>', sortOrder: 10 }
        }
        
        // Check URL type
        for (const { check, icon, sortOrder } of urlChecks) {
            if (check(value)) return { icon, sortOrder }
        }
    } catch (e) { }
    
    // Default fallback
    return { icon: '<i class="fas fa-file-alt"></i>', sortOrder: 100 }
}
/**
 * Sorts links by type, error status, crawl status, and alphabetically
 * @param {Object} a - First link object to compare
 * @param {Object} b - Second link object to compare
 * @returns {number} -1 if a comes before b, 1 if after, 0 if equal
 */
function sortLinks(a, b) {
    const aUrl = a.href || ''
    const bUrl = b.href || ''
    
    const aIsLocalPage = isUrlLocal(aUrl) && isUrlHTMLFile(aUrl) && !isUrlAnchor(aUrl)
    const bIsLocalPage = isUrlLocal(bUrl) && isUrlHTMLFile(bUrl) && !isUrlAnchor(bUrl)
    
    if (aIsLocalPage && !bIsLocalPage) return -1
    if (!aIsLocalPage && bIsLocalPage) return 1
    
    const aIndex = a.tags.tag === 'a' && b.tags.tag === 'a' 
        ? getFAIcon(aUrl).sortOrder 
        : getFAIcon(a.tags.tag).sortOrder
    const bIndex = b.tags.tag === 'a' && a.tags.tag === 'a'
        ? getFAIcon(bUrl).sortOrder
        : getFAIcon(b.tags.tag).sortOrder

    if (aIndex !== bIndex) return aIndex - bIndex

    if (a.isError !== b.isError) return a.isError ? -1 : 1
    if (a.isCrawled !== b.isCrawled) return a.isCrawled ? -1 : 1
    
    return aUrl.localeCompare(bUrl)
}
/**
 * Debounces function calls to avoid excessive invocations
 * @param {Function} fn - The function to debounce
 * @param {number} ms - Delay in milliseconds
 * @returns {Function} Debounced function
 */
function debounce(fn, ms) {
    let timer = 0;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(fn.bind(this, ...args), ms || 0);
    };
}

const delay = debounce // Alias for backward compatibility

/**
 * Retrieves a value from Chrome storage
 * @param {string|string[]} key - The key(s) to retrieve
 * @returns {Promise<Object>} Promise that resolves to the stored values
 */
function storageGet(key) {
    if (!(key instanceof Array))
        key = [key];

    return new Promise((resolve, reject) => {
        chrome.storage.local.get(key, result => {
            let value = result ? Object.keys(result).length > 1 ? result : result[key] : null
            resolve(value)
        })
    })
}

/**
 * Function to set the value of a key in the storage
 * @param {any} key - the key to set the value to
 * @param {*} value  - the value to set
 */
function storageSet(key, value) {
    chrome.storage.local.set({ [key]: value });
}

/**
 * Converts a URL to a base64 data URL
 * @param {string} url - The URL to convert
 * @returns {Promise<string>} Promise that resolves to the data URL
 */
function toDataURL(url) {
    return new Promise(async (resolve, reject) => {
        try {
            // Try direct fetch first
            let res, blob
            try {
                res = await fetch(url)
                if (res.ok) {
                    blob = await res.blob()
                } else {
                    throw new Error('Direct fetch failed')
                }
            } catch (directError) {
                // Fall back to CORS proxy
                res = await fetch(CORS_BYPASS_URL_RAW + encodeURIComponent(url))
                if (!res.ok) throw new Error(res.error)
                blob = await res.blob()
            }
            
            const reader = new FileReader()
            reader.onloadend = () => resolve(reader.result)
            reader.onerror = reject
            reader.readAsDataURL(blob)
        } catch (err) {
            reject(err)
        }
    })
}

/**
 * Resolves a relative or absolute href to a full URL
 * @param {string} href - The href to resolve
 * @returns {string} The resolved full URL
 */
const getLocation = href => {
    const link = document.createElement("a");
    link.href = href;
    return link.href; // Return the resolved href string, not the element
}

/**
 * Formats a link relative to a base URL and handles chrome extension URLs
 * @param {string} url - The base URL
 * @param {string} link - The link to format
 * @returns {string} The formatted absolute URL
 */
const formatLink = (url, link) => {
    const chromeExtensionProtocol = 'chrome-extension:'
    const chromeExtensionId = window.extensionId

        const urlLocation = new URL(url)
        const linkLocation = new URL(getLocation(link))

        // If it's not a local link or a // link
        if (linkLocation.protocol !== chromeExtensionProtocol) return link

        // If it's a // link
        if (linkLocation.host !== chromeExtensionId) {
            return `${urlLocation.protocol}//${linkLocation.host}${linkLocation.pathname}${linkLocation.hash}${linkLocation.search}`
        }

        // If it's a local link 
        const basePath = linkLocation.pathname === "/viewer.html" ? "/" : linkLocation.pathname
        return `${urlLocation.protocol}//${urlLocation.host}${basePath}${linkLocation.hash}${linkLocation.search}`
}