// Functions to check if the url is a specific type
const isUrlHTMLFile = url => {
  try {
    const pathname = new URL(url).pathname.split('/').pop();
    return pathname.indexOf('.') <= 0 || url.includes(".html") || url.includes(".shtml") || url.includes(".htm") || url.includes(".aspx") || url.includes(".asp") || url.includes(".jsp") || url.includes(".php") || url.includes(".xhtml");
  } catch {
    return false
  }
}
const isUrlPDFFile = url => url.includes('.pdf')
const isUrlProtocol = url => isUrlProtocolMailto(url) || isUrlProtocolTel(url)
const isUrlProtocolMailto = url => url.includes('mailto:')
const isUrlProtocolTel = url => url.includes('tel:')
const isUrlLocal = url => (url.toLowerCase().includes(hostURL.toLowerCase()) && url.toLowerCase().indexOf(hostURL.toLowerCase()) === 0) || (!url.match(httpRegex) && !isUrlProtocol(url))
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
* Function to create HTML Element from string
* @param {string} htmlString - HTML string to turn into html element
* @returns {HTMLElement} - HTML element
*/
function createElementFromHTML(htmlString) {
    const template = document.createElement('template');
    template.innerHTML = htmlString.trim();
    return template.content.firstChild;
}

/**
 * Function to get the icon based of either a URL or a tag
 * @param {string} tag - either a tag or a URL
 */
function getFAIcon(value, getIndex = false) {
    let icon
    try {
        //Urls
        new URL(value)


        if (isUrlProtocolTel(value))
            icon = ['<i class="fas fa-phone"></i>', 11]
        else if (isUrlProtocolMailto(value))
            icon = ['<i class="fas fa-envelope"></i>', 12]
        else if (isUrlProtocol(value))
            icon = ['<i class="fas fa-globe"></i>', 10]
        else if (isUrlAnchor(value))
            icon = ['<i class="fas fa-anchor"></i>', 1]
        else if (isUrlPDFFile(value))
            icon = ['<i class="fas fa-file-pdf"></i>', 20]
        else if (isUrlDocument(value))
            icon = ['<i class="fas fa-file-word"></i>', 21]
        else if (isUrlArchive(value))
            icon = ['<i class="fas fa-file-archive"></i>', 22]
        else if (isUrlData(value))
            icon = ['<i class="fas fa-file-code"></i>', 23]
        else if (isUrlImage(value))
            icon = ['<i class="fas fa-image"></i>', 24]
        else if (isUrlVideo(value))
            icon = ['<i class="fas fa-file-video"></i>', 25]
        else if (isUrlAudio(value))
            icon = ['<i class="fas fa-file-audio"></i>', 26]
        else if (isUrlStyleSheet(value))
            icon = ['<i class="fab fa-css3-alt"></i>', 30]
        else if (isUrlScript(value))
            icon = ['<i class="fab fa-js-square"></i>', 31]
        else if (isUrlFont(value))
            icon = ['<i class="fas fa-font"></i>', 32]
        else if (isUrlHTMLFile(value))
            icon = ['<i class="fas fa-link"></i>', 90]


    } catch (e) { }
    //Tags
    switch (value) {
        case 'page':
            icon = ['<i class="fas fa-file-lines"></i>', 1]
            break;
        case 'iframe':
            icon = ['<i class="fas fa-window-restore"></i>', 20]
            break;
        case 'img':
            icon = ['<i class="fas fa-image"></i>', 21]
            break;
        case 'video':
            icon = ['<i class="fas fa-file-video"></i>', 22]
            break;
        case 'audio':
            icon = ['<i class="fas fa-file-audio"></i>', 23]
            break;
        case 'link':
            icon = ['<i class="fab fa-css3-alt"></i>', 30]
            break;
        case 'style':
            icon = ['<i class="fab fa-css3-alt"></i>', 30]
            break;
        case 'script':
            icon = ['<i class="fab fa-js-square"></i>', 31]
            break;
        case 'broken-link':
            icon = ['<i class="fas fa-unlink"></i>', 100]
            break;
    }

    if (!icon)
        icon = ['<i class="fas fa-file-alt"></i>', 100]


    if (getIndex)
        return icon[1]
    else
        return icon[0]
}
/**
* Function to sort links depending on file type, and than alphabetically
* @param {string} a - first link to compare
* @param {string} b - second link to compare
* @returns {number} -1 if a is before b, 1 if a is after b, alphabetically if they are equal
*/
function sortLinks(a, b) {
    // Get href for comparison (default to empty string if undefined)
    const aUrl = a.href || ''
    const bUrl = b.href || ''
    
    // Check if items are local HTML pages (should appear first)
    const aIsLocalPage = isUrlLocal(aUrl) && isUrlHTMLFile(aUrl) && !isUrlAnchor(aUrl)
    const bIsLocalPage = isUrlLocal(bUrl) && isUrlHTMLFile(bUrl) && !isUrlAnchor(bUrl)
    
    // Local pages always come first
    if (aIsLocalPage && !bIsLocalPage) return -1
    if (!aIsLocalPage && bIsLocalPage) return 1
    
    // Get icon indices for comparison
    const aIndex = a.tags.tag === 'a' && b.tags.tag === 'a' 
        ? getFAIcon(aUrl, true) 
        : getFAIcon(a.tags.tag, true)
    const bIndex = b.tags.tag === 'a' && a.tags.tag === 'a'
        ? getFAIcon(bUrl, true)
        : getFAIcon(b.tags.tag, true)

    if (aIndex !== bIndex) return aIndex - bIndex

    // Sort by error status
    if (a.isError !== b.isError) return a.isError ? -1 : 1
    
    // Sort by crawled status
    if (a.isCrawled !== b.isCrawled) return a.isCrawled ? -1 : 1
    
    // Sort alphabetically by href
    return aUrl.localeCompare(bUrl)
}
/**
* Function to debounce calls to avoid excessive invocations
* @param {function} fn - function to call
* @param {number} ms - delay in ms
* @returns {function} - debounced function
*/
function debounce(fn, ms) {
    let timer = 0;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(fn.bind(this, ...args), ms || 0);
    };
}

// Alias for backward compatibility
const delay = debounce


/**
 * Function to get the value of a key from the storage
 * @param {any} key - the key to get the value from
 * @returns {Promise} - a promise that resolves to the value
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

const getLocation = href => {
    const link = document.createElement("a");
    link.href = href;
    return link.href; // Return the resolved href string, not the element
}

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