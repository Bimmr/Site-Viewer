/**
 * Tab Crawler Module
 * Manages opening tabs in the background, waiting for page load, and extracting content
 */

// Track open tabs created for crawling
const crawlerTabs = new Set()

/**
 * Get the current active tab
 * @returns {Promise<chrome.tabs.Tab>} - Active tab object
 */
async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  return tab
}

/**
 * Open a URL for crawling in a tab
 * @param {string} url - URL to open
 * @param {boolean} isInitial - Whether this is the initial page (use current tab if URL matches)
 * @returns {Promise<number>} - Tab ID
 */
async function openTabForCrawling(url, isInitial = false) {
  try {
    // If this is the initial crawl, try to use the stored tab ID
    if (isInitial) {
      // Check if we have a stored initial tab ID from the popup
      if (typeof window !== 'undefined' && window.initialTabId) {
        console.log(`Using stored tab ${window.initialTabId} for initial crawl: ${url}`)
        return window.initialTabId
      }
      
      // Fallback: check if there's a tab with this exact URL
      const tabs = await chrome.tabs.query({ url: url })
      if (tabs && tabs.length > 0) {
        console.log(`Using existing tab ${tabs[0].id} for initial crawl: ${url}`)
        return tabs[0].id
      }
      
      // Also check current tab in case URL doesn't match exactly
      const currentTab = await getActiveTab()
      if (currentTab && currentTab.url === url) {
        console.log(`Using current tab ${currentTab.id} for initial crawl: ${url}`)
        return currentTab.id
      }
      
      console.log(`No existing tab found for ${url}, will create new tab`)
    }

    // Get the current window to ensure tab opens in it
    const currentWindow = await chrome.windows.getCurrent()
    
    // Create new tab in the current window (background tab)
    const tab = await chrome.tabs.create({
      url: url,
      active: false,  // Opens in background - user stays on current tab
      windowId: currentWindow.id  // Ensure it opens in current window
    })

    // Track this tab so we can clean up later
    crawlerTabs.add(tab.id)
    
    console.log(`Opened background tab ${tab.id} for crawling: ${url}`)
    return tab.id

  } catch (error) {
    throw new Error(`Failed to open tab for crawling: ${error.message}`)
  }
}

/**
 * Wait for a tab to finish loading, then wait additional time for JS execution
 * @param {number} tabId - Tab ID to wait for
 * @param {number} waitTime - Additional time to wait after load (ms)
 * @returns {Promise<void>}
 */
async function waitForPageLoad(tabId, waitTime = 5000) {
  return new Promise((resolve, reject) => {
    let isComplete = false
    let listenerAdded = false
    
    const timeout = setTimeout(() => {
      if (!isComplete) {
        if (listenerAdded) {
          chrome.tabs.onUpdated.removeListener(listener)
        }
        reject(new Error(`Tab ${tabId} load timeout after 30 seconds`))
      }
    }, 30000) // 30 second total timeout

    const listener = (updatedTabId, changeInfo, tab) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener)
        clearTimeout(timeout)
        isComplete = true

        console.log(`Tab ${tabId} loaded, waiting ${waitTime}ms for JavaScript execution...`)
        
        // Wait additional time for JavaScript to execute and modify the page
        setTimeout(() => {
          console.log(`Tab ${tabId} ready for content extraction`)
          resolve()
        }, waitTime)
      }
    }

    // Add listener
    chrome.tabs.onUpdated.addListener(listener)
    listenerAdded = true

    // Check if tab is already complete
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) {
        if (listenerAdded) {
          chrome.tabs.onUpdated.removeListener(listener)
        }
        clearTimeout(timeout)
        reject(new Error(`Tab ${tabId} not found: ${chrome.runtime.lastError.message}`))
        return
      }

      if (tab.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener)
        clearTimeout(timeout)
        isComplete = true
        
        console.log(`Tab ${tabId} already loaded, waiting ${waitTime}ms for JavaScript execution...`)
        
        setTimeout(() => {
          console.log(`Tab ${tabId} ready for content extraction`)
          resolve()
        }, waitTime)
      }
    })
  })
}

/**
 * Extract HTML content from a tab
 * @param {number} tabId - Tab ID to extract from
 * @returns {Promise<string>} - HTML content
 */
async function extractPageContent(tabId) {
  try {
    // Verify tab still exists
    const tab = await chrome.tabs.get(tabId)
    
    if (!tab) {
      throw new Error('Tab no longer exists')
    }
    
    // Check if we can access the tab's content
    if (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://') || tab.url.startsWith('about:')) {
      throw new Error('Cannot access system pages')
    }

    // Execute script in the tab to get the full HTML
    // This works on background tabs without needing to activate them
    const results = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: () => document.documentElement.outerHTML
    })

    if (!results || results.length === 0 || !results[0].result) {
      throw new Error('No content extracted from page')
    }

    const html = results[0].result
    console.log(`Extracted ${html.length} characters from tab ${tabId}`)
    
    return html

  } catch (error) {
    // Provide more specific error messages
    if (error.message.includes('Cannot access')) {
      throw new Error(`Cannot access tab content: ${error.message}`)
    } else if (error.message.includes('scripting')) {
      throw new Error('Content script injection failed - may be blocked by CSP or permissions')
    }
    throw new Error(`Failed to extract content from tab ${tabId}: ${error.message}`)
  }
}

/**
 * Close a tab that was opened for crawling
 * @param {number} tabId - Tab ID to close
 * @returns {Promise<void>}
 */
async function closeTab(tabId) {
  try {
    // Remove from tracking set
    crawlerTabs.delete(tabId)

    // Close the tab
    await chrome.tabs.remove(tabId)
    console.log(`Closed crawler tab ${tabId}`)

  } catch (error) {
    // Tab might already be closed, that's okay
    console.warn(`Could not close tab ${tabId}: ${error.message}`)
  }
}

/**
 * Clean up all open crawler tabs
 * Useful for extension shutdown/reload
 * @returns {Promise<void>}
 */
async function closeAllCrawlerTabs() {
  const tabIds = Array.from(crawlerTabs)
  
  if (tabIds.length === 0) {
    return
  }

  console.log(`Closing ${tabIds.length} crawler tabs...`)
  
  try {
    await chrome.tabs.remove(tabIds)
    crawlerTabs.clear()
    console.log('All crawler tabs closed')
  } catch (error) {
    console.warn('Error closing crawler tabs:', error.message)
    crawlerTabs.clear()
  }
}

/**
 * Check if tab crawling is supported (has necessary permissions)
 * @returns {Promise<boolean>}
 */
async function isTabCrawlingSupported() {
  try {
    // Check if we have the necessary APIs
    if (!chrome.tabs || !chrome.scripting) {
      return false
    }

    // Try to query tabs as a permission check
    await chrome.tabs.query({ currentWindow: true })
    
    return true
  } catch (error) {
    console.error('Tab crawling not supported:', error.message)
    return false
  }
}
