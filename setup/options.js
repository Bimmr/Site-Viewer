// Storage utility functions (duplicated here for options page compatibility)
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

storageGet('manageDownloads').then(manageDownloads => {
    if (manageDownloads !== null) 
        document.getElementById("options-manageDownloads").checked = manageDownloads
}).catch(error => {
    console.error("Failed to load manageDownloads setting:", error)
})

document.getElementById("options-manageDownloads").addEventListener("change", function(e){
    var checked = e.target.checked;
    storageSet("manageDownloads", checked);
})