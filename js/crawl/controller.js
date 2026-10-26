import { store } from '../state/store.js'
import { site, setSite } from '../state/site.js'
import { settings } from '../settings.js'
import { fetchPage, fetchResourceText, isAbortError } from './network.js'
import { extractPage, createLinkObject } from './extract.js'
import { parseRobotsTxt, getRobotsRules, isAllowedByRobots, parseSitemap, isExcluded } from './rules.js'
import { showNotification, replaceNotification, dismissNotification } from '../../modules/notifications/notifications.js'

// Most sitemap files read when a site splits its sitemap up with a sitemap index
const MAX_SITEMAPS = 20

// In-progress crawls, so repeat requests for the same URL share one crawl
const inProgress = new Map()

// Cancels every crawl when starting over
let sessionAbort = new AbortController()

const crawlKey = (url, addToAll) => `${addToAll ? 'all' : 'page'}:${url}`

/**
 * Checks if a URL is being crawled into the results
 * @param {string} url - URL to check
 * @returns {boolean}
 */
export const isCrawlInProgress = url => inProgress.has(crawlKey(url, true))

/**
 * Crawls a URL for links, media, assets and issues
 * @param {string} url - The URL to crawl
 * @param {Object} options
 * @param {boolean} options.addToAll - Add the results to the store, false when only the page data is needed
 * @param {boolean} options.isInitialPage - Whether this is the page the viewer was opened from
 * @param {AbortSignal} options.signal - Cancels the crawl
 * @param {boolean} options.quiet - Don't show per-page notifications, Crawl All shows progress instead
 * @returns {Promise<Object>} The crawled page
 */
export function crawlPage(url, { addToAll = true, isInitialPage = false, signal, quiet = false } = {}) {
  const key = crawlKey(url, addToAll)
  const existing = inProgress.get(key)
  if (existing) return existing

  const signals = [sessionAbort.signal, signal].filter(Boolean)
  const crawl = runCrawl(url, { addToAll, isInitialPage, quiet, signal: AbortSignal.any(signals) })
  inProgress.set(key, crawl)
  crawl.catch(() => { }).finally(() => {
    if (inProgress.get(key) === crawl) inProgress.delete(key)
    if (currentRun) schedulePump(currentRun)
  })
  return crawl
}

async function runCrawl(url, { addToAll, isInitialPage, quiet, signal }) {
  const notificationId = `crawl-${url}`
  if (addToAll) store.markCrawling(url)

  try {
    const { html, method } = await fetchPage(url, {
      isInitialPage,
      signal,
      onStart: () => quiet || showNotification(`Crawling: ${url}`, 'info', 30000, notificationId)
    })
    const page = extractPage(html, url, settings.crawl)
    page.crawlMethod = method

    if (addToAll) store.addPage(url, page)
    if (!quiet) replaceNotification(notificationId, `Crawl completed: ${url}`, 'success', 2000)
    return page
  } catch (error) {
    if (isAbortError(error)) {
      store.markCancelled(url)
      dismissNotification(notificationId, true)
    } else {
      console.warn(`Failed to crawl ${url}:`, error)
      store.markFailed(url, error)
      if (!quiet) replaceNotification(notificationId, `Failed to crawl: ${url}`, 'error', 5000)
    }
    throw error
  }
}

/**
 * Creates a link object for a URL that wasn't found in a page's HTML
 * @param {string} url - Link URL
 * @param {string} foundOn - Where it was found
 * @returns {Object} Link object
 */
function createDiscoveredLink(url, foundOn) {
  const element = document.createElement('a')
  element.href = url
  return createLinkObject(foundOn, element)
}

/**
 * Starts crawling a site from a URL
 * @param {string} url - Starting URL
 * @param {Object} options
 * @param {boolean} options.isInitialPage - Whether the URL is already loaded in the tab the viewer was opened from
 * @returns {Promise<Object>} The crawled start page
 */
export function startCrawl(url, { isInitialPage = true } = {}) {
  setSite(url)
  const link = createDiscoveredLink(site.baseUrl, site.baseUrl)
  link.tags.isBaseUrl = true
  store.addDiscoveredLink(link, 0)
  return crawlPage(site.baseUrl, { isInitialPage })
}

/**
 * Cancels all crawls, clears the results and crawls the start page again
 * @returns {Promise<Object>} The crawled start page
 */
export function recrawl() {
  stopCrawlAll()
  sessionAbort.abort()
  sessionAbort = new AbortController()
  inProgress.clear()
  store.reset()
  return startCrawl(site.baseUrl, { isInitialPage: false })
}

// === Crawl All ===

// The running Crawl All, or null
let currentRun = null
const progressListeners = new Set()

export const isCrawlAllRunning = () => currentRun !== null

/**
 * Listens for Crawl All progress
 * @param {Function} listener - Called with the progress object from getProgress
 * @returns {Function} Removes the listener
 */
export function onCrawlAllProgress(listener) {
  progressListeners.add(listener)
  return () => progressListeners.delete(listener)
}

/**
 * Summarizes a run for progress listeners
 * @param {Object} run - Crawl All run
 * @returns {Object} Progress
 */
function getProgress(run) {
  const skippedBy = reason => Array.from(run.skipped.values()).filter(value => value === reason).length
  return {
    running: currentRun === run,
    preparing: run.preparing,
    stopped: run.stopped,
    crawled: run.crawled,
    failed: run.failed,
    active: run.active.size,
    total: run.crawled + run.failed + run.active.size,
    limitReached: run.limitReached,
    sitemapPages: run.sitemapPages,
    skipped: {
      robots: skippedBy('robots'),
      depth: skippedBy('depth'),
      excluded: skippedBy('excluded')
    }
  }
}

function report(run) {
  const progress = getProgress(run)
  progressListeners.forEach(listener => listener(progress))
}

/**
 * Crawls every page found on the site, including pages found along the way
 * Follows the page, depth, exclude and robots.txt settings, and adds pages listed in the sitemap
 * @returns {Promise<Object>} Final progress once finished or stopped
 */
export async function startCrawlAll() {
  if (currentRun) return currentRun.finished

  const run = {
    abort: new AbortController(),
    // URLs this run is crawling
    active: new Set(),
    // URL -> reason this run won't crawl it
    skipped: new Map(),
    crawled: 0,
    failed: 0,
    sitemapPages: 0,
    limitReached: false,
    preparing: true,
    stopped: false,
    robotsRules: null,
    pumpTimer: null
  }
  run.finished = new Promise(resolve => run.resolve = resolve)
  currentRun = run
  report(run)

  await prepareRun(run)
  if (currentRun !== run) return run.finished

  run.preparing = false
  // Pages found by other crawls, e.g. ones the user started, are picked up too
  run.unsubscribe = store.onChange(() => schedulePump(run))
  pump(run)
  return run.finished
}

/**
 * Stops Crawl All, cancelling the crawls it started
 */
export function stopCrawlAll() {
  const run = currentRun
  if (!run) return
  run.stopped = true
  run.abort.abort()
  finishRun(run)
}

/**
 * Reads robots.txt and the sitemap before crawling
 * @param {Object} run - Crawl All run
 */
async function prepareRun(run) {
  const { respectRobots, useSitemap } = settings.crawl
  let robots = { groups: [], sitemaps: [] }

  if (respectRobots || useSitemap) {
    try {
      robots = parseRobotsTxt(await fetchResourceText(`${site.hostURL}/robots.txt`, run.abort.signal))
    } catch (error) {
      if (isAbortError(error)) return
      // No robots.txt, everything is allowed
    }
  }

  if (respectRobots)
    run.robotsRules = getRobotsRules(robots)

  if (useSitemap)
    await addSitemapPages(run, robots.sitemaps)
}

/**
 * Adds the site's pages listed in its sitemap(s)
 * @param {Object} run - Crawl All run
 * @param {string[]} sitemapUrls - Sitemaps listed in robots.txt, /sitemap.xml is used if there are none
 */
async function addSitemapPages(run, sitemapUrls) {
  const queue = sitemapUrls.length > 0 ? [...sitemapUrls] : [`${site.hostURL}/sitemap.xml`]
  const read = new Set()

  while (queue.length > 0 && read.size < MAX_SITEMAPS) {
    const sitemapUrl = queue.shift()
    if (read.has(sitemapUrl)) continue
    read.add(sitemapUrl)

    let sitemap
    try {
      sitemap = parseSitemap(await fetchResourceText(sitemapUrl, run.abort.signal))
    } catch (error) {
      if (isAbortError(error)) return
      continue
    }

    if (sitemap.isIndex) {
      queue.push(...sitemap.urls)
      continue
    }

    const links = sitemap.urls.filter(url => {
      try {
        return new URL(url).origin === site.hostURL
      } catch {
        return false
      }
    }).map(url => {
      const link = createDiscoveredLink(url, sitemapUrl)
      link.instances[0].tags.isInSitemap = true
      return link
    })
    run.sitemapPages += store.addDiscoveredLinks(links, 1)
  }
}

/**
 * Gets why Crawl All shouldn't crawl a page
 * @param {Object} run - Crawl All run
 * @param {Object} link - Page link
 * @returns {string|null} 'depth' | 'excluded' | 'robots', or null if it should be crawled
 */
function getSkipReason(run, link) {
  const { maxDepth, excludePatterns } = settings.crawl
  try {
    if (maxDepth > 0 && (link.depth ?? 0) > maxDepth) return 'depth'
    if (isExcluded(link.href, excludePatterns)) return 'excluded'
    if (run.robotsRules && !isAllowedByRobots(run.robotsRules, link.href)) return 'robots'
  } catch {
    return 'excluded'
  }
  return null
}

function schedulePump(run) {
  if (run.pumpTimer || currentRun !== run || run.preparing) return
  run.pumpTimer = setTimeout(() => {
    run.pumpTimer = null
    pump(run)
  }, 0)
}

/**
 * Starts crawling every page that should be crawled, and finishes the run once nothing is left
 * @param {Object} run - Crawl All run
 */
function pump(run) {
  if (currentRun !== run) return

  const { maxPages } = settings.crawl
  const pages = store.getPages()
  // Pages being crawled are already marked as crawled, so this counts them too
  let crawledCount = pages.filter(link => link.isCrawled).length

  for (const link of pages) {
    if (link.isCrawled || link.isError || link.isWarning || run.skipped.has(link.href) || isCrawlInProgress(link.href)) continue

    const reason = getSkipReason(run, link)
    if (reason) {
      run.skipped.set(link.href, reason)
      continue
    }

    if (maxPages > 0 && crawledCount >= maxPages) {
      run.limitReached = true
      break
    }

    crawledCount++
    run.active.add(link.href)
    crawlPage(link.href, { signal: run.abort.signal, quiet: true })
      .then(() => run.crawled++)
      .catch(error => {
        if (!isAbortError(error)) run.failed++
      })
      .finally(() => {
        run.active.delete(link.href)
        schedulePump(run)
      })
  }

  report(run)

  // Wait for crawls the user started too, they may find more pages
  if (run.active.size === 0 && inProgress.size === 0)
    finishRun(run)
}

/**
 * Ends a run and reports the final progress
 * @param {Object} run - Crawl All run
 */
function finishRun(run) {
  if (currentRun !== run) return
  currentRun = null
  clearTimeout(run.pumpTimer)
  run.unsubscribe?.()
  store.setSkipReasons(run.skipped)

  const progress = getProgress(run)
  progressListeners.forEach(listener => listener(progress))
  run.resolve(progress)
}
