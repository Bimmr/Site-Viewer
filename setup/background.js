// Storage utility functions (duplicated here because service workers can't import modules easily in MV3)
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

/**
* Listen to files being downloaded and suggest the name if the file is being downloaded from Site Viewer
* Registered synchronously so the service worker always has it, the setting is checked per download
*/
chrome.downloads.onDeterminingFilename.addListener(function (item, suggest) {
    //Only handle downloads from this extension
    if (item.byExtensionId !== chrome.runtime.id)
        return

    storageGet('manageDownloads').then(manageDownloads => {
        //Keep Chrome's default name if managing downloads is turned off
        if (!manageDownloads)
            return suggest()

        return storageGet(item.url).then(url => {

            if (url)
                storageSet(item.url, null)
            else
                url = item.url

            //Regex for non word file name
            let nonWordRegex = new RegExp(/[^a-z0-9A-Z.]/gi)

            let urlObject = new URL(url)
            let name = urlObject.pathname
            if (name.startsWith("/"))
                name = name.substr(1)
            name = name.replaceAll("/", "__").replace(nonWordRegex, '_')

            //If the name is empty, assume you're downloading the home page
            if (name === "__" || name === "")
                name = "index.html"

            //If there is no extension, add .html
            if (name.indexOf(".") === -1)
                name += ".html"

            return storageGet('settings').then(settings => {
                if (settings && settings.download && settings.download.directory)
                    name = settings.download.directory + name

                console.log("Suggesting: " + name)
                suggest({ filename: name })
            })
        })
    }).catch(error => {
        //Always call suggest, otherwise the download stays pending
        console.error("Failed to suggest a download name:", error)
        suggest()
    })
    return true
})
