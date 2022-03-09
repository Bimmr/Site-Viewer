/**
 * I'm assuming this means it can run on http and https pages? - copied from another extention of mine to make this one work...
 */
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


/**
* Listen to files being downloaded and suggest the name if the file is being downloaded from Site Viewer
*/
chrome.downloads.onDeterminingFilename.addListener(function (item, suggest) {
    //If item download is from this extension
    if (item.byExtensionId == chrome.runtime.id) {
        storageGet(item.url).then(url => {

            if (url)
                storageSet(item.url, null)
            else
                url = item.url

            //Regex for non word file name
            let nonWordRegex = new RegExp(/[^a-z0-9A-Z.]/gi)

            let urlObject = new URL(url)
            console.log(urlObject)
            let name = urlObject.pathname
            if (name.startsWith("/"))
                name = name.substr(1)
            name = name.replace("/", "__").replace(nonWordRegex, '_')

            //If the name is empty, assume you're downloading the home page
            if (name == "__" || name == "")
                name = "index.html"

            //If there is no extension, add .html
            if (name.indexOf(".") == -1)
                name += ".html"

            //Suggest the name of the file
            console.log(name)

            storageGet('downloadDirectory').then(directory => {
                if (directory)
                    name = directory + name
        
                    console.log("Suggesting: " + name)
                suggest({ filename: name })
            })
        })
        return true;
    } else
        suggest()
});

/**
 * Function to set the value of a key in the storage
 * @param {any} key - the key to set the value to
 * @param {*} value  - the value to set
 */
function storageSet(key, value) {
    chrome.storage.local.set({ [key]: value });
}
/**
 * Function to get the value of a key from the storage
 * @param {any} key - the key to get the value from
 * @returns {Promise} - a promise that resolves to the value
 */
function storageGet(key) {
    if (!(key instanceof Array))
        key = [key];

    return new Promise((resolve, reject) => {
        chrome.storage.local.get(key, result => {
            let value = result ? Object.keys(result).length > 1 ? result : result[key] : null
            resolve(value)
        })
    })
}