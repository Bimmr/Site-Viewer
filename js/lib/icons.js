import {
  getUrlProtocol, isUrlAnchor, isUrlPDFFile, isUrlDocument, isUrlArchive, isUrlData, isUrlImage, isUrlVideo,
  isUrlAudio, isUrlStyleSheet, isUrlScript, isUrlFont, isUrlHTMLFile, isUrlLocal
} from './url.js'

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

/**
 * Returns the appropriate icon and sort order for a URL or tag type
 * @param {string} value - A URL or tag name (e.g., 'page', 'broken-link')
 * @returns {{icon: string, sortOrder: number}} Object containing icon HTML and sort order
 */
export function getFAIcon(value) {
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

// Cached URL checks for sortLinks, they're slow and a sort runs them many times per link
const sortKeyCache = new WeakMap()

/**
 * Gets the URL-based parts of a link's sort order
 * @param {Object} link - Link object
 * @returns {{href: string, isLocalPage: boolean, urlOrder: number, tagOrder: number}} Sort key
 */
function getSortKey(link) {
  const href = link.href || ''
  let key = sortKeyCache.get(link)
  if (!key || key.href !== href || key.tag !== link.tags.tag) {
    key = {
      href,
      tag: link.tags.tag,
      isLocalPage: isUrlLocal(href) && isUrlHTMLFile(href) && !isUrlAnchor(href),
      urlOrder: getFAIcon(href).sortOrder,
      tagOrder: getFAIcon(link.tags.tag).sortOrder
    }
    sortKeyCache.set(link, key)
  }
  return key
}

/**
 * Sorts links by type, error status, crawl status, and alphabetically
 * @param {Object} a - First link object to compare
 * @param {Object} b - Second link object to compare
 * @returns {number} -1 if a comes before b, 1 if after, 0 if equal
 */
export function sortLinks(a, b) {
  const aKey = getSortKey(a)
  const bKey = getSortKey(b)

  if (aKey.isLocalPage && !bKey.isLocalPage) return -1
  if (!aKey.isLocalPage && bKey.isLocalPage) return 1

  const bothAnchors = a.tags.tag === 'a' && b.tags.tag === 'a'
  const aIndex = bothAnchors ? aKey.urlOrder : aKey.tagOrder
  const bIndex = bothAnchors ? bKey.urlOrder : bKey.tagOrder

  if (aIndex !== bIndex) return aIndex - bIndex

  if (!!a.isError !== !!b.isError) return a.isError ? -1 : 1
  if (!!a.isCrawled !== !!b.isCrawled) return a.isCrawled ? -1 : 1

  return aKey.href.localeCompare(bKey.href)
}
