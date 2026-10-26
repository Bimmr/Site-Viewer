import { site } from '../state/site.js'

//Regex for Chrome Extension
export const chromeExtensionRegex = /(chrome-extension:\/\/\w*\/(viewer\.html)?)|(chrome-extension:\/)/

//Regex for links starting with a protocol or //
export const httpRegex = /^((http|https):)?\/\//

//Regex for background or background-image style - Function to create fresh instance, ignoring if it contains 'data:'
export const getImageUrlRegex = () => /background(-image)?\s*:(.*?)(url)\(\s*(\'|")?((?!['']?data:).*?)(?<image>.*?)\3?(\'|")?\s*\)/g

//Regex for a tag link - Function to create fresh instance
export const getATagRegex = () => /(<a)(?:(?!<\/a>).)*/g

/**
 * Gets the file extension of a URL's last path segment, ignoring the host, query and hash
 * @param {string} url - The URL to check
 * @returns {string} Lowercase extension without the dot, or '' if there is none
 */
export const getUrlExtension = url => {
  let path
  try {
    path = new URL(url, site.hostURL || undefined).pathname
  } catch {
    path = url.split(/[?#]/)[0]
  }
  const fileName = path.split('/').pop()
  const dotIndex = fileName.lastIndexOf('.')
  return dotIndex > 0 ? fileName.substring(dotIndex + 1).toLowerCase() : ''
}

const hasUrlExtension = (url, extensions) => extensions.includes(getUrlExtension(url))

// URL type checking utilities
export const isUrlPDFFile = url => hasUrlExtension(url, ["pdf"])
export const isUrlImage = url => hasUrlExtension(url, ["png", "gif", "svg", "jpg", "jpeg", "bmp", "webp", "ico", "tiff", "tif", "avif"]) || url.startsWith("data:image/")
export const isUrlVideo = url => hasUrlExtension(url, ["mp4", "webm", "ogg", "ogv", "avi", "mov", "wmv", "flv", "m4v", "mkv"])
export const isUrlAudio = url => hasUrlExtension(url, ["mp3", "wav", "ogg", "oga", "m4a", "aac", "flac", "wma"])
export const isUrlStyleSheet = url => hasUrlExtension(url, ["css", "scss", "sass", "less"]) || url.includes("fonts.googleapis.com/css")
export const isUrlScript = url => hasUrlExtension(url, ["js", "jsx", "ts", "tsx", "mjs", "cjs"]) || url.includes("googletagmanager.com/gtag/js")
export const isUrlFont = url => hasUrlExtension(url, ["ttf", "otf", "woff", "woff2", "eot"]) || url.includes("fonts.googleapis.com") || url.includes("fonts.gstatic.com")
export const isUrlDocument = url => hasUrlExtension(url, ["doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "odp"])
export const isUrlArchive = url => hasUrlExtension(url, ["zip", "rar", "7z", "tar", "gz", "tgz", "bz2"])
export const isUrlData = url => hasUrlExtension(url, ["json", "xml", "csv", "yaml", "yml"])
export const isUrlProtocol = url => /^[a-z][a-z0-9+.-]*:/i.test(url) && !url.match(/^https?:/i)

/**
 * Determines if a URL points to an HTML file or page
 * @param {string} url - The URL to check
 * @returns {boolean} True if the URL is an HTML file/page
 */
export const isUrlHTMLFile = url => {
  try {

    // Known non-page file types
    if (isUrlPDFFile(url)
        || isUrlImage(url)
        || isUrlVideo(url)
        || isUrlAudio(url)
        || isUrlStyleSheet(url)
        || isUrlScript(url)
        || isUrlFont(url)
        || isUrlDocument(url)
        || isUrlArchive(url)
        || isUrlData(url)
    ) {
      return false
    }

    new URL(url) // Relative or invalid URLs aren't treated as pages
    const extension = getUrlExtension(url)
    if (!extension) return true
    if (["html", "shtml", "htm", "aspx", "asp", "jsp", "php", "xhtml"].includes(extension)) return true

    // Extensions longer than 4 chars or with special chars are likely not file extensions
    return extension.length > 4 || /[-_@]/.test(extension)
  } catch {
    return false
  }
}

/**
 * Normalizes a URL by removing trailing slashes (except for root paths)
 * @param {string} url - The URL to normalize
 * @returns {string} Normalized URL
 */
export const normalizeUrl = url => {
  if (!url) return url
  try {
    const urlObj = new URL(url)
    if (urlObj.pathname === '/' || urlObj.pathname === '') {
      return url
    }
    if (url.endsWith('/')) {
      return url.slice(0, -1)
    }
    return url
  } catch {
    return url.endsWith('/') ? url.slice(0, -1) : url
  }
}

/**
 * Checks if an href is unrendered template/code rather than a real URL
 * e.g. "${isEnglish ? '/contact' : '/contact-fr'}", "' + postLink + '", "{{ url }}", "<%= link %>"
 * @param {string} href - The raw href attribute value
 * @returns {boolean} True if the href contains template or string concatenation syntax
 */
export const isUrlTemplate = href => /\$\{|\{\{|<%|%>|['"`]\s*\+|\+\s*['"`]/.test(href)

/**
 * Extracts the protocol from a URL (excluding http/https)
 * @param {string} url - The URL to parse
 * @returns {string|null} The protocol name (lowercase) or null
 */
export const getUrlProtocol = url => {
  const match = url.match(/^([a-z][a-z0-9+.-]*):/i)
  if (!match) return null
  const protocol = match[1].toLowerCase()
  return (protocol === 'http' || protocol === 'https') ? null : protocol
}

export const isUrlLocal = url => {
  const hostURL = site.hostURL.toLowerCase()
  return (hostURL && url.toLowerCase().indexOf(hostURL) === 0) || (!url.match(httpRegex) && !isUrlProtocol(url))
}

/**
 * Checks if a URL is an anchor link on the same site
 * @param {string} url - The URL to check
 * @returns {boolean} True if the URL is an anchor on the current site
 */
export const isUrlAnchor = url => {
  if (!url.includes("#")) return false
  try {
    return new URL(url).origin === site.hostURL
  } catch {
    return true
  }
}

/**
 * Works out which views a link belongs in
 * A link can be in more than one, e.g. a local file link with a hash is both a link and a file
 * @param {string} href - The link's URL
 * @param {boolean} isBroken - Whether the link couldn't be parsed
 * @returns {{isPage: boolean, isLink: boolean, isFile: boolean}} The views the link belongs in
 */
export const getUrlCategories = (href, isBroken = false) => {
  const isHTML = isUrlHTMLFile(href)
  const isLocal = isUrlLocal(href)
  const isAnchor = isUrlAnchor(href)
  const isProtocol = isUrlProtocol(href)
  return {
    isPage: isLocal && isHTML && !isAnchor && !isUrlScript(href) && !isUrlStyleSheet(href) && !isBroken,
    isLink: (isHTML && !isLocal) || isAnchor || isProtocol || isBroken,
    isFile: !isHTML && !isProtocol && !isBroken
  }
}

/**
 * Resolves a relative or absolute href to a full URL against the viewer page
 * @param {string} href - The href to resolve
 * @returns {string} The resolved full URL
 */
const getLocation = href => {
  const link = document.createElement("a")
  link.href = href
  return link.href
}

/**
 * Formats a link relative to a base URL and handles chrome extension URLs
 * @param {string} url - The base URL
 * @param {string} link - The link to format
 * @returns {string} The formatted absolute URL
 */
export const formatLink = (url, link) => {
  const chromeExtensionProtocol = 'chrome-extension:'
  const chromeExtensionId = globalThis.chrome?.runtime?.id

  // Raw (unresolved) links can be resolved against the page they were found on directly
  if (!link.startsWith(chromeExtensionProtocol)) {
    try {
      return new URL(link, url).href
    } catch (e) { }
  }

  const urlLocation = new URL(url)
  const linkLocation = new URL(getLocation(link))

  // If it's not a local link or a // link
  if (linkLocation.protocol !== chromeExtensionProtocol) return link

  // If it's a // link
  if (linkLocation.host !== chromeExtensionId) {
    return `${urlLocation.protocol}//${linkLocation.host}${linkLocation.pathname}${linkLocation.search}${linkLocation.hash}`
  }

  // If it's a local link
  const basePath = linkLocation.pathname === "/viewer.html" ? "/" : linkLocation.pathname
  return `${urlLocation.protocol}//${urlLocation.host}${basePath}${linkLocation.search}${linkLocation.hash}`
}

/**
 * Builds the file name a URL is saved as, e.g. https://site.com/blog/post -> blog__post.html
 * @param {string} url - The URL being downloaded
 * @param {string} directory - Optional folder inside the downloads folder, ending in /
 * @returns {string} Relative path for the download
 */
export const getDownloadFilename = (url, directory = '') => {
  let name = new URL(url).pathname
  if (name.startsWith("/"))
    name = name.substring(1)
  name = name.replaceAll("/", "__").replace(/[^a-z0-9A-Z.]/gi, '_')

  //If the name is empty, assume you're downloading the home page
  if (name === "__" || name === "")
    name = "index.html"

  //If there is no extension, add .html
  if (name.indexOf(".") === -1)
    name += ".html"

  return directory + name
}
