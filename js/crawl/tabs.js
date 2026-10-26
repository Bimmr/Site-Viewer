/**
 * Tab Crawler Module
 * Manages opening tabs in the background, waiting for page load, and extracting content
 * Open crawler tabs are recorded in session storage so the background worker can close them if the viewer closes
 */

// Tabs opened for crawling
const crawlerTabs = new Set()

// The tab the viewer was opened from, used for the initial crawl since that page is already loaded
let initialTabId = null

// Storage key for this viewer's crawler tabs, see setup/background.js
let crawlerTabsKey = null

/**
 * Sets the tab the viewer was opened from
 * @param {number|null} tabId - Tab ID
 */
export function setInitialTab(tabId) {
  initialTabId = tabId
}

/**
 * Saves the open crawler tabs so the background worker can close them when this viewer closes
 */
async function saveCrawlerTabs() {
  try {
    if (!crawlerTabsKey) {
      const viewerTab = await chrome.tabs.getCurrent()
      if (!viewerTab) return
      crawlerTabsKey = `crawlerTabs-${viewerTab.id}`
    }
    await chrome.storage.session.set({ [crawlerTabsKey]: Array.from(crawlerTabs) })
  } catch (error) {
    console.warn('Could not save crawler tabs:', error.message)
  }
}

/**
 * Creates an error for a cancelled operation
 * @returns {DOMException} AbortError
 */
const abortError = () => new DOMException('Crawl cancelled', 'AbortError')

/**
 * Gets the window to open crawler tabs in
 * The viewer usually runs in a popup window, which can't hold tabs, so use the crawled site's window
 * @returns {Promise<number|undefined>} Window ID, or undefined to let the browser pick
 */
async function getCrawlerWindowId() {
  try {
    if (initialTabId) return (await chrome.tabs.get(initialTabId)).windowId
  } catch (error) {
    // The site's tab was closed
  }
  try {
    return (await chrome.windows.getLastFocused({ windowTypes: ['normal'] })).id
  } catch (error) {
    return undefined
  }
}

/**
 * Open a URL for crawling in a tab
 * @param {string} url - URL to open
 * @param {boolean} isInitial - Whether this is the initial page (use the tab the viewer was opened from)
 * @returns {Promise<{tabId: number, isNew: boolean}>} Tab ID and whether a new tab was opened
 */
async function openTabForCrawling(url, isInitial) {
  if (isInitial) {
    if (initialTabId)
      return { tabId: initialTabId, isNew: false }

    // Fallback: check if there's a tab with this exact URL
    const tabs = await chrome.tabs.query({ url })
    if (tabs.length > 0)
      return { tabId: tabs[0].id, isNew: false }
  }

  // Opens in the background so the user stays on their current tab
  const tab = await chrome.tabs.create({ url, active: false, windowId: await getCrawlerWindowId() })

  crawlerTabs.add(tab.id)
  saveCrawlerTabs()
  return { tabId: tab.id, isNew: true }
}

/**
 * Wait for a tab to finish loading, then wait additional time for JS execution
 * @param {number} tabId - Tab ID to wait for
 * @param {number} waitTime - Additional time to wait after load (ms)
 * @param {AbortSignal} signal - Cancels waiting
 * @returns {Promise<void>}
 */
function waitForPageLoad(tabId, waitTime, signal) {
  return new Promise((resolve, reject) => {
    let waitTimer = null

    const cleanup = () => {
      chrome.tabs.onUpdated.removeListener(listener)
      clearTimeout(loadTimeout)
      clearTimeout(waitTimer)
      signal?.removeEventListener('abort', onAbort)
    }
    const onAbort = () => {
      cleanup()
      reject(abortError())
    }
    const loaded = () => {
      chrome.tabs.onUpdated.removeListener(listener)
      clearTimeout(loadTimeout)
      // Wait additional time for JavaScript to execute and modify the page
      waitTimer = setTimeout(() => {
        cleanup()
        resolve()
      }, waitTime)
    }
    const listener = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') loaded()
    }

    const loadTimeout = setTimeout(() => {
      cleanup()
      reject(new Error(`Tab ${tabId} load timeout after 30 seconds`))
    }, 30000)

    if (signal?.aborted) return onAbort()
    signal?.addEventListener('abort', onAbort)
    chrome.tabs.onUpdated.addListener(listener)

    // Check if tab is already complete
    chrome.tabs.get(tabId).then(tab => {
      if (tab.status === 'complete') loaded()
    }).catch(error => {
      cleanup()
      reject(new Error(`Tab ${tabId} not found: ${error.message}`))
    })
  })
}

/**
 * Extract HTML content from a tab
 * @param {number} tabId - Tab ID to extract from
 * @returns {Promise<{html: string, finalUrl: string}>} HTML content, and the URL the tab is on after any redirects
 */
async function extractPageContent(tabId) {
  const tab = await chrome.tabs.get(tabId)

  // Check if we can access the tab's content
  if (/^(chrome|edge|about):/.test(tab.url))
    throw new Error('Cannot access system pages')

  // This works on background tabs without needing to activate them
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => document.documentElement.outerHTML
  })

  if (!results?.[0]?.result)
    throw new Error('No content extracted from page')

  return { html: results[0].result, finalUrl: tab.url }
}

/**
 * Close a tab that was opened for crawling
 * @param {number} tabId - Tab ID to close
 */
async function closeTab(tabId) {
  crawlerTabs.delete(tabId)
  saveCrawlerTabs()
  try {
    await chrome.tabs.remove(tabId)
  } catch (error) {
    // Tab might already be closed, that's okay
  }
}

/**
 * Loads a URL in a tab, lets its JavaScript run, and returns the resulting HTML
 * @param {string} url - URL to load
 * @param {Object} options
 * @param {boolean} options.isInitialPage - Use the tab the viewer was opened from, it's already loaded
 * @param {number} options.waitTime - Time to let JavaScript run after the page loads (ms)
 * @param {AbortSignal} options.signal - Cancels the crawl
 * @returns {Promise<{html: string, finalUrl: string}>} HTML after JavaScript execution, and the URL the tab ended up on
 */
export async function getLiveHtml(url, { isInitialPage = false, waitTime = 5000, signal } = {}) {
  if (!chrome.tabs || !chrome.scripting)
    throw new Error('Tab crawling not supported - missing permissions or APIs')

  const { tabId, isNew } = await openTabForCrawling(url, isInitialPage)
  try {
    if (isNew)
      await waitForPageLoad(tabId, waitTime, signal)
    if (signal?.aborted) throw abortError()
    return await extractPageContent(tabId)
  } finally {
    if (isNew) await closeTab(tabId)
  }
}
