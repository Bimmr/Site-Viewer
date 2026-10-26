import { normalizeUrl, getUrlCategories } from '../lib/url.js'
import { sortLinks } from '../lib/icons.js'

/**
 * Generates a simple hash from page content for duplicate detection
 * @param {Object} page - Page object with content
 * @returns {string} Hash string
 */
export function generatePageHash(page) {
  const content = [
    page.title || '',
    page.description || '',
    page.links.length,
    page.media.length,
    page.assets.length,
    page.links.slice(0, 15).map(l => l.href).sort().join('|'),
    page.media.slice(0, 10).map(m => m.src).sort().join('|'),
    page.assets.slice(0, 10).map(a => a.link).sort().join('|')
  ].join(':::')

  let hash = 0
  for (let i = 0; i < content.length; i++) {
    hash = ((hash << 5) - hash) + content.charCodeAt(i)
    hash = hash & hash
  }
  return hash.toString(36)
}

/**
 * Adds items to a collection, or adds their instances if an item with the same key is already in it
 * @param {Map} collection - Collection to merge into
 * @param {Array} items - Items to add
 * @param {Function} getKey - Returns the key items are matched by
 * @param {Function} onAdded - Called with each item that wasn't already in the collection
 * @param {Function} onExisting - Called with (existing, item) for items that were
 */
function mergeInto(collection, items, getKey, onAdded = () => { }, onExisting = () => { }) {
  items.forEach(item => {
    const key = getKey(item)
    const existing = collection.get(key)
    if (existing) {
      if (existing !== item) existing.instances.push(...item.instances)
      onExisting(existing, item)
    } else {
      collection.set(key, item)
      onAdded(item)
    }
  })
}

// Flags describing the result of the last crawl attempt
const CRAWL_RESULT_FLAGS = ['isError', 'isWarning', 'statusCode', 'errorMessage']

const linkKey = link => normalizeUrl(link.href)

/**
 * Everything found while crawling the site
 * All changes go through its methods, which notify listeners so the views can update
 */
class CrawlStore {
  constructor() {
    this.listeners = new Set()
    // Counters per collection, so views can skip re-rendering when nothing they show changed
    // They keep counting through resets so a view never mistakes new data for what it last rendered
    this.versions = { links: 0, media: 0, assets: 0, issues: 0 }
    this.reset(false)
  }

  /**
   * Clears all crawl data
   * @param {boolean} notify - Whether to notify listeners
   */
  reset(notify = true) {
    // Normalized href -> link object
    this.links = new Map()
    // src -> media object
    this.media = new Map()
    // link -> asset object
    this.assets = new Map()
    this.issues = []
    // URL -> crawled page data
    this.pages = new Map()
    // Page hash -> first URL crawled with that hash
    this.urlByHash = new Map()
    this.sortedLinks = null
    this.duplicateUrls = null
    if (notify) this.changed('links', 'media', 'assets', 'issues')
  }

  /**
   * Listens for changes
   * @param {Function} listener - Called with the list of collections that changed
   * @returns {Function} Removes the listener
   */
  onChange(listener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /**
   * Notifies listeners that collections changed
   * @param {...string} collections - Names of the changed collections
   */
  changed(...collections) {
    collections.forEach(collection => this.versions[collection]++)
    if (collections.includes('links')) this.sortedLinks = null
    this.listeners.forEach(listener => listener(collections))
  }

  // === Reading ===

  /**
   * Gets a link by URL, ignoring trailing slashes
   * @param {string} url - Link URL
   * @returns {Object|undefined} Link object
   */
  getLink(url) {
    return this.links.get(normalizeUrl(url))
  }

  getAsset(url) {
    return this.assets.get(url)
  }

  getPage(url) {
    return this.pages.get(url)
  }

  /**
   * Gets all links in display order
   * @returns {Array} Sorted links, cached until links change
   */
  getAllLinks() {
    if (!this.sortedLinks)
      this.sortedLinks = Array.from(this.links.values()).sort(sortLinks)
    return this.sortedLinks
  }

  /**
   * Gets the views a link belongs in, cached on the link since the checks parse its URL
   * @param {Object} link - Link object
   * @returns {{isPage: boolean, isLink: boolean, isFile: boolean}}
   */
  categoriesOf(link) {
    if (!link._categories || link._categories.href !== link.href || link._categories.isBroken !== !!link.isBroken)
      link._categories = { href: link.href, isBroken: !!link.isBroken, ...getUrlCategories(link.href, link.isBroken) }
    return link._categories
  }

  // Local HTML pages
  getPages() {
    return this.getAllLinks().filter(link => this.categoriesOf(link).isPage)
  }

  // External links, anchors, protocol links (mailto: etc.) and broken links
  getLinks() {
    return this.getAllLinks().filter(link => this.categoriesOf(link).isLink)
  }

  // Links to non-HTML files
  getFiles() {
    return this.getAllLinks().filter(link => this.categoriesOf(link).isFile)
  }

  getMedia() {
    return Array.from(this.media.values())
  }

  getAssets() {
    return Array.from(this.assets.values())
  }

  /**
   * Gets the URLs of pages whose content duplicates an earlier page
   * @returns {Set<string>} Duplicate page URLs
   */
  getDuplicateUrls() {
    if (!this.duplicateUrls || this.duplicateUrlsVersion !== this.versions.links) {
      this.duplicateUrls = new Set(Array.from(this.links.values()).filter(link => link.isDuplicate).map(link => link.href))
      this.duplicateUrlsVersion = this.versions.links
    }
    return this.duplicateUrls
  }

  // === Changing ===

  /**
   * Adds a link that wasn't found by crawling a page, e.g. the start page or a sitemap entry
   * @param {Object} link - Link object
   * @param {number} depth - Clicks from the start page
   * @returns {Object} The link in the store
   */
  addDiscoveredLink(link, depth) {
    this.addDiscoveredLinks([link], depth)
    return this.getLink(link.href)
  }

  /**
   * Adds several links that weren't found by crawling a page, notifying listeners once
   * @param {Array} links - Link objects
   * @param {number} depth - Clicks from the start page
   * @returns {number} How many of the links were new
   */
  addDiscoveredLinks(links, depth) {
    let added = 0
    links.forEach(link => {
      const existing = this.getLink(link.href)
      if (existing) {
        existing.depth = Math.min(existing.depth ?? Infinity, depth)
      } else {
        link.depth = depth
        this.links.set(linkKey(link), link)
        added++
      }
    })
    if (added > 0) this.changed('links')
    return added
  }

  /**
   * Records why Crawl All skipped pages, replacing previous reasons
   * @param {Map<string, string>} reasons - URL -> reason
   */
  setSkipReasons(reasons) {
    this.links.forEach(link => {
      const reason = reasons.get(link.href)
      if (reason) link.skipReason = reason
      else delete link.skipReason
    })
    this.changed('links')
  }

  /**
   * Marks a page or asset as being crawled
   * @param {string} url - URL being crawled
   */
  markCrawling(url) {
    const item = this.getLink(url) || this.getAsset(url)
    if (!item) return
    item.isCrawled = true
    item.isCrawling = true
    this.changed(item.link ? 'assets' : 'links')
  }

  /**
   * Adds a crawled page and everything found on it
   * @param {string} url - URL that was crawled
   * @param {Object} page - Page data from extractPage
   */
  addPage(url, page) {
    const pageLink = this.getLink(url)
    const childDepth = (pageLink?.depth ?? 0) + 1

    this.issues.push(...page.issues)

    // Links found on this page are one click deeper than it
    mergeInto(this.links, page.links, linkKey,
      link => link.depth = childDepth,
      existing => existing.depth = Math.min(existing.depth ?? Infinity, childDepth))
    mergeInto(this.media, page.media, file => file.src)
    mergeInto(this.assets, page.assets, asset => asset.link)

    this.pages.set(url, page)

    const crawled = pageLink || this.getAsset(url)
    if (crawled) {
      crawled.isCrawled = true
      delete crawled.isCrawling
      CRAWL_RESULT_FLAGS.forEach(flag => delete crawled[flag])
    }

    // Check for duplicate pages
    if (pageLink) {
      const hash = generatePageHash(page)
      const firstUrl = this.urlByHash.get(hash)
      if (firstUrl && firstUrl !== url) {
        pageLink.isDuplicate = true
        pageLink.duplicateOf = firstUrl
      } else {
        this.urlByHash.set(hash, url)
      }
    }

    this.changed('links', 'media', 'assets', 'issues')
  }

  /**
   * Records that crawling a URL failed
   * @param {string} url - URL that failed
   * @param {Error} error - The failure, with httpStatus if the server responded with an error status
   */
  markFailed(url, error) {
    const item = this.getLink(url) || this.getAsset(url)
    if (!item) return
    delete item.isCrawling
    if (error.httpStatus) {
      item.isWarning = true
      item.statusCode = error.httpStatus
      item.errorMessage = `Received HTTP status code ${error.httpStatus}`
    } else {
      item.isError = true
      item.errorMessage = error.message || 'Failed to load page - it may be inaccessible, blocked, or taking too long to respond'
    }
    this.changed(item.link ? 'assets' : 'links')
  }

  /**
   * Returns a URL to uncrawled after its crawl was cancelled
   * @param {string} url - URL whose crawl was cancelled
   */
  markCancelled(url) {
    const item = this.getLink(url) || this.getAsset(url)
    if (!item) return
    delete item.isCrawling
    if (!this.pages.has(url)) item.isCrawled = false
    this.changed(item.link ? 'assets' : 'links')
  }

  /**
   * Records the result of testing a link
   * @param {string} url - Link URL
   * @param {string} result - 'success' | 'warning' | 'failed'
   * @param {number} statusCode - HTTP status, for warnings
   */
  setLinkTest(url, result, statusCode) {
    const link = this.getLink(url)
    if (!link) return
    link.test = result
    if (statusCode) link.statusCode = statusCode
    this.changed('links')
  }

  /**
   * Removes a crawled page's data, keeping the page itself as an uncrawled link
   * @param {string} url - URL of the crawled page
   */
  removePage(url) {
    const notFoundOnPage = instance => instance.foundOn !== url

    if (this.pages.has(url)) {
      const pageKey = normalizeUrl(url)
      const removeFrom = (collection, isKept = () => false) => {
        collection.forEach((item, key) => {
          item.instances = item.instances.filter(notFoundOnPage)
          if (item.instances.length === 0 && !isKept(key)) collection.delete(key)
        })
      }
      // The page's own link is kept so it can be crawled again
      removeFrom(this.links, key => key === pageKey)
      removeFrom(this.media)
      removeFrom(this.assets)

      this.issues = this.issues.filter(issue => issue.location !== url)
      this.pages.delete(url)
      this.urlByHash.forEach((hashUrl, hash) => {
        if (hashUrl === url) this.urlByHash.delete(hash)
      })
    }

    const link = this.getLink(url)
    if (link) {
      link.isCrawled = false
      CRAWL_RESULT_FLAGS.forEach(flag => delete link[flag])
      delete link.isDuplicate
      delete link.duplicateOf
    }

    this.changed('links', 'media', 'assets', 'issues')
  }
}

// The store for the crawl in this viewer window
export const store = new CrawlStore()
