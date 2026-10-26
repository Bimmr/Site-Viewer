import { settings } from '../settings.js'
import { isUrlHTMLFile } from '../lib/url.js'
import { getLiveHtml } from './tabs.js'

/**
 * Error for a response with an HTTP error status
 */
export class HttpStatusError extends Error {
  constructor(status) {
    super(`HTTP ${status}`)
    this.name = 'HttpStatusError'
    this.httpStatus = Number(status)
  }
}

/**
 * Checks if an error came from a cancelled request
 * @param {Error} error - The error to check
 * @returns {boolean}
 */
export const isAbortError = error => error?.name === 'AbortError'

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

/**
 * Runs requests with a concurrency limit per lane and a minimum delay between starting any two requests
 * Tab crawls and plain fetches use separate lanes, but share the delay so the site isn't hit too quickly
 */
export class RequestScheduler {
  /**
   * @param {Object} lanes - Lane name -> function returning its max concurrent requests
   * @param {Function} getRateLimit - Returns the delay between requests (ms)
   */
  constructor(lanes, getRateLimit) {
    this.lanes = {}
    for (const [name, getMax] of Object.entries(lanes))
      this.lanes[name] = { getMax, queue: [], active: 0 }
    this.getRateLimit = getRateLimit
    this.lastStart = 0
    this.sequence = 0
    this.pumping = false
  }

  /**
   * Queues a task
   * @param {string} laneName - Lane to run the task in
   * @param {Function} task - Async function to run
   * @param {AbortSignal} signal - Removes the task from the queue if aborted before it starts
   * @returns {Promise<*>} Result of the task
   */
  run(laneName, task, signal) {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(new DOMException('Crawl cancelled', 'AbortError'))

      const lane = this.lanes[laneName]
      const entry = { task, resolve, reject, sequence: this.sequence++ }
      lane.queue.push(entry)

      signal?.addEventListener('abort', () => {
        const index = lane.queue.indexOf(entry)
        if (index > -1) {
          lane.queue.splice(index, 1)
          reject(new DOMException('Crawl cancelled', 'AbortError'))
        }
      }, { once: true })

      this.pump()
    })
  }

  /**
   * Gets the lane whose next task was queued first, among lanes with free capacity
   * @returns {Object|null} Lane
   */
  nextLane() {
    let next = null
    for (const lane of Object.values(this.lanes)) {
      if (lane.queue.length === 0 || lane.active >= lane.getMax()) continue
      if (!next || lane.queue[0].sequence < next.queue[0].sequence) next = lane
    }
    return next
  }

  async pump() {
    if (this.pumping) return
    this.pumping = true
    try {
      while (this.nextLane()) {
        const wait = this.lastStart + this.getRateLimit() - Date.now()
        if (wait > 0) await sleep(wait)

        // Tasks may have been aborted while waiting
        const lane = this.nextLane()
        if (!lane) break
        const { task, resolve, reject } = lane.queue.shift()

        this.lastStart = Date.now()
        lane.active++
        Promise.resolve().then(task).then(resolve, reject).finally(() => {
          lane.active--
          this.pump()
        })
      }
    } finally {
      this.pumping = false
    }
  }
}

export const scheduler = new RequestScheduler({
  tab: () => settings.crawl.maxConcurrentTabs || 10,
  fetch: () => 20
}, () => settings.crawl.rateLimitMs ?? 100)

/**
 * Fetches a URL directly
 * Extension pages with host permissions aren't limited by CORS, so this works for any site
 * @param {string} url - URL to fetch
 * @param {AbortSignal} signal - Cancels the request
 * @returns {Promise<Response>} Successful response
 */
async function fetchDirect(url, signal) {
  const res = await fetch(url, { signal })
  if (!res.ok) throw new HttpStatusError(res.status)
  return res
}

/**
 * Fetches a URL's text through the CORS proxy
 * Only used when enabled in settings, as it sends the URL to a third party
 * @param {string} url - URL to fetch
 * @param {AbortSignal} signal - Cancels the request
 * @returns {Promise<string>} Response text
 */
async function fetchTextViaProxy(url, signal) {
  const res = await fetch(settings.crawl.corsProxyUrl + encodeURIComponent(url), { signal })
  if (!res.ok) throw new Error(`Proxy request failed with status ${res.status}`)
  const data = await res.json()
  if (data.status && data.status.http_code !== 200)
    throw new HttpStatusError(data.status.http_code)
  if (!data.contents)
    throw new Error('No content received from the URL')
  return data.contents
}

/**
 * Fetches a URL, falling back to the CORS proxy if enabled and the request couldn't be made at all
 * @param {string} url - URL to fetch
 * @param {AbortSignal} signal - Cancels the request
 * @returns {Promise<string>} Response text
 */
async function fetchText(url, signal) {
  try {
    return await (await fetchDirect(url, signal)).text()
  } catch (error) {
    // The server responded, so the proxy would only get the same status
    if (error.httpStatus || isAbortError(error) || !settings.crawl.useCorsProxy) throw error
    return fetchTextViaProxy(url, signal)
  }
}

/**
 * Checks the HTTP status of a URL without fetching the full content
 * @param {string} url - URL to check
 * @param {AbortSignal} signal - Cancels the request
 * @returns {Promise<number>} HTTP status code
 */
async function checkUrlStatus(url, signal) {
  try {
    const response = await fetch(url, { method: 'HEAD', signal })
    // Some servers don't support HEAD, retry those with GET
    if (response.status !== 405 && response.status !== 501)
      return response.status
  } catch (error) {
    if (isAbortError(error)) throw error
  }
  try {
    return (await fetch(url, { signal })).status
  } catch (error) {
    if (isAbortError(error)) throw error
    throw new Error(`Unable to reach ${url}: ${error.message}`)
  }
}

/**
 * Analyzes HTML to determine if page needs live crawling (framework detection)
 * @param {string} html - Raw HTML content
 * @returns {boolean} True if live crawling is recommended
 */
export function shouldUseLiveCrawling(html) {
  let score = 0

  // Framework indicators (+2 each)
  const frameworks = [
    html.includes('id="root"') || html.includes('data-reactroot') || html.includes('__REACT_') || html.includes('_reactRootContainer'),
    html.includes('id="app"') || html.includes('v-app') || html.includes('v-cloak') || html.includes('__VUE__'),
    html.includes('ng-app') || html.includes('ng-controller') || /\[ng-/.test(html) || html.includes('__ngContext__'),
    html.includes('__NEXT_DATA__') || html.includes('_next'),
    html.includes('__NUXT__'),
    html.includes('data-svelte-h')
  ]
  score += frameworks.filter(Boolean).length * 2

  // Low content density (+1)
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
  if (bodyMatch) {
    const bodyText = bodyMatch[1]
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, '')
      .trim()
    if (bodyText.length < 100) score += 1
  }

  // Many script tags (+1)
  if ((html.match(/<script/gi) || []).length > 5) score += 1

  return score >= 3
}

/**
 * Crawls a page in a tab so its JavaScript runs
 * @param {string} url - URL to crawl
 * @param {Object} options
 * @param {boolean} options.isInitialPage - Whether this is the page the viewer was opened from
 * @param {boolean} options.isStatusKnown - The page was already fetched successfully, so skip the status check
 * @param {AbortSignal} options.signal - Cancels the crawl
 * @param {Function} options.onStart - Called when the crawl actually starts
 * @returns {Promise<string>} HTML after JavaScript execution
 */
function fetchLive(url, { isInitialPage = false, isStatusKnown = false, signal, onStart } = {}) {
  return scheduler.run('tab', async () => {
    onStart?.()
    if (!isInitialPage && !isStatusKnown) {
      const status = await checkUrlStatus(url, signal)
      if (status >= 400) throw new HttpStatusError(status)
    }
    return getLiveHtml(url, { isInitialPage, waitTime: settings.crawl.liveWaitTime || 5000, signal })
  }, signal)
}

/**
 * Fetches a page's HTML without running its JavaScript
 * @param {string} url - URL to fetch
 * @param {AbortSignal} signal - Cancels the request
 * @param {Function} onStart - Called when the request actually starts
 * @returns {Promise<string>} HTML
 */
function fetchStatic(url, signal, onStart) {
  return scheduler.run('fetch', () => {
    onStart?.()
    return fetchText(url, signal)
  }, signal)
}

/**
 * Fetches a page using the crawl mode from settings
 * - fetch: plain request
 * - live: load in a tab so JavaScript runs
 * - smart: plain request, then a tab if the page looks client-side rendered
 * @param {string} url - URL to crawl
 * @param {Object} options
 * @param {boolean} options.isInitialPage - Whether this is the page the viewer was opened from
 * @param {AbortSignal} options.signal - Cancels the crawl
 * @param {Function} options.onStart - Called once when the crawl actually starts
 * @returns {Promise<{html: string, method: string}>} HTML and whether it came from a 'live' tab or a 'fetch'
 */
export async function fetchPage(url, { isInitialPage = false, signal, onStart } = {}) {
  let started = false
  const start = () => {
    if (!started) onStart?.()
    started = true
  }
  const crawlMode = settings.crawl.crawlMode

  // Stylesheets and scripts have no JavaScript to run, and a tab would wrap them in its own HTML
  if (!isUrlHTMLFile(url))
    return { html: await fetchStatic(url, signal, start), method: 'fetch' }

  if (crawlMode === 'live')
    return { html: await fetchLive(url, { isInitialPage, signal, onStart: start }), method: 'live' }

  if (crawlMode === 'smart') {
    // The initial page is already loaded in a tab, so read it from there
    if (isInitialPage) {
      try {
        return { html: await fetchLive(url, { isInitialPage, signal, onStart: start }), method: 'live' }
      } catch (error) {
        if (isAbortError(error)) throw error
        console.warn(`Failed to read the initial page from its tab, fetching instead:`, error.message)
      }
    }

    const html = await fetchStatic(url, signal, start)
    if (!shouldUseLiveCrawling(html))
      return { html, method: 'fetch' }

    try {
      // The fetch already succeeded, so skip the status check
      return { html: await fetchLive(url, { isStatusKnown: true, signal, onStart: start }), method: 'live' }
    } catch (error) {
      if (isAbortError(error)) throw error
      console.warn(`Live crawling failed for ${url}, using fetched HTML:`, error.message)
      return { html, method: 'fetch' }
    }
  }

  return { html: await fetchStatic(url, signal, start), method: 'fetch' }
}

/**
 * Fetches a URL's text, e.g. robots.txt or a sitemap
 * @param {string} url - URL to fetch
 * @param {AbortSignal} signal - Cancels the request
 * @returns {Promise<string>} Response text
 */
export function fetchResourceText(url, signal) {
  return scheduler.run('fetch', () => fetchText(url, signal), signal)
}

/**
 * Tests a URL, returning its HTTP status
 * @param {string} url - URL to test
 * @returns {Promise<number>} HTTP status code
 */
export async function testUrl(url) {
  const signal = AbortSignal.timeout(10000)
  try {
    return (await fetch(url, { signal })).status
  } catch (error) {
    if (!settings.crawl.useCorsProxy) throw error
    const res = await fetch(settings.crawl.corsProxyUrl + encodeURIComponent(url), { signal })
    if (!res.ok) throw new Error(`Proxy request failed with status ${res.status}`)
    const data = await res.json()
    if (data.error || data.status?.error) throw new Error('Unable to reach URL')
    return data.status.http_code
  }
}

/**
 * Fetches a URL as a blob
 * @param {string} url - URL to fetch
 * @returns {Promise<Blob>}
 */
async function fetchBlob(url) {
  try {
    return await (await fetchDirect(url)).blob()
  } catch (error) {
    if (error.httpStatus || !settings.crawl.useCorsProxy) throw error
    const res = await fetch(settings.crawl.corsProxyRawUrl + encodeURIComponent(url))
    if (!res.ok) throw new Error(`Proxy request failed with status ${res.status}`)
    return res.blob()
  }
}

/**
 * Converts a URL to a base64 data URL
 * @param {string} url - The URL to convert
 * @returns {Promise<string>} The data URL
 */
export async function toDataURL(url) {
  const blob = await fetchBlob(url)
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}
