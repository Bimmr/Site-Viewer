/**
* Close a viewer's crawler tabs when the viewer closes
* The viewer records the tabs it opens for live crawling under "crawlerTabs-<viewer tab id>" (see js/crawl/tabs.js),
* this runs even if the viewer closed before it could clean up
*/
chrome.tabs.onRemoved.addListener(async tabId => {
    const key = `crawlerTabs-${tabId}`
    const { [key]: crawlerTabIds } = await chrome.storage.session.get(key)
    if (!crawlerTabIds) return

    await chrome.storage.session.remove(key)
    for (const crawlerTabId of crawlerTabIds) {
        try {
            await chrome.tabs.remove(crawlerTabId)
        } catch (error) {
            // Already closed
        }
    }
})
