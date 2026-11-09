/**
* Open the viewer for the current tab, then close this toolbar popup
* The page to crawl is passed in the viewer's URL, so it's there as soon as the viewer loads and survives a refresh
*/
chrome.tabs.query({ active: true, currentWindow: true }).then(async ([tab]) => {
    const params = new URLSearchParams({ url: tab?.url || '' })
    if (tab?.id) params.set('tabId', tab.id)

    await chrome.windows.create({
        url: chrome.runtime.getURL(`viewer.html?${params}`),
        type: 'popup',
        width: 1280,
        height: 700
    })
    window.close()
})
