chrome.runtime.onInstalled.addListener(function () {

    chrome.declarativeContent.onPageChanged.removeRules(undefined, function () {
        chrome.declarativeContent.onPageChanged.addRules([{
            conditions: [new chrome.declarativeContent.PageStateMatcher({
                pageUrl: { schemes: ['https', 'http'] },
            })
            ],
            actions: [new chrome.declarativeContent.ShowPageAction()]
        }]);
    });
});
chrome.downloads.onDeterminingFilename.addListener(function (item, suggest) {
    //If item download is from this extension
    if (item.byExtensionId == chrome.runtime.id) {

        //Regex for non word file name
        let nonWordRegex = new RegExp(/[^a-z0-9A-Z.]/gi)

        let url = item.url
        let name = url.substr(url.indexOf("://") + 3)
        if (name.indexOf("/") >= 0)
            name = name.substr(name.indexOf("/") + 1)
        name = name.replace("/", "__").replace(nonWordRegex, '_')
        if (!name || name.length == 0)
            name = "index.html"
        if (name.indexOf(".") < 0)
            name += ".html"
        suggest({ filename: name })
    }
});
