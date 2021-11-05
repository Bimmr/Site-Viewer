// Functions to check if the url is a specific type
const isUrlHTMLFile = url => new URL(url).pathname.split('/').pop().indexOf('.') <= 0 || url.indexOf(".html") >= 0 || url.indexOf(".htm") >= 0 || url.indexOf(".aspx") >= 0 || url.indexOf(".php") >= 0
const isUrlPDFFile = url => url.indexOf('.pdf') >= 0
const isUrlProtocol = url => isUrlProtocolMailto(url) || isUrlProtocolTel(url)
const isUrlProtocolMailto = url => url.indexOf('mailto:') >= 0
const isUrlProtocolTel = url => url.indexOf('tel:') >= 0
const isUrlLocal = url => (url.toLowerCase().indexOf(hostURL.toLowerCase()) == 0 || !url.match(httpRegex)) && !isUrlProtocol(url)
const isUrlAnchor = url => url.indexOf("#") >= 0
const isUrlImage = url => url.indexOf(".png") >= 0 || url.indexOf(".gif") >= 0 || url.indexOf(".svg") >= 0 || url.indexOf(".jpg") >= 0 || url.indexOf(".jpeg") >= 0 || url.indexOf(".bmp") >= 0 || url.indexOf(".webp") >= 0 || url.indexOf("data:image/svg") >= 0
const isUrlVideo = url => url.indexOf(".mp4") >= 0 || url.indexOf(".webm") >= 0 || url.indexOf(".ogg") >= 0 
const isUrlAudio = url => url.indexOf(".mp3") >= 0 || url.indexOf(".wav") >= 0 || url.indexOf(".ogg") >= 0 
const isUrlStyleSheet = url => url.indexOf(".css") >= 0 || url.indexOf("fonts.googleapis.com/css") >= 0
const isUrlScript = url => url.indexOf(".js") >= 0 || url.indexOf(".jsx") >= 0 || url.indexOf(".ts") >= 0 || url.indexOf(".tsx") >= 0 || url.indexOf("googletagmanager.com/gtag/js") >= 0
const isUrlFont = url => url.indexOf(".ttf") >= 0 || url.indexOf("fonts.googleapis.com") >= 0


/**
* Function to create HTML Element from string
* @param {string} htmlString - HTML string to turn into html element
* @returns {HTMLElement} - HTML element
*/
function createElementFromHTML(htmlString) {
    var template = document.createElement('template');
    template.innerHTML = htmlString.trim();
    return template.content.firstChild;
}

/**
* Function to get the icon for a link
* @param {string} url - url of the link
* @returns {string} - font awesome icon code
*/
function getURLIcon(url) {
    if (isUrlPDFFile(url))
        return '<i class="fas fa-file-pdf"></i>'
    if (isUrlImage(url))
        return '<i class="fas fa-image"></i>'
    if (isUrlVideo(url))
        return '<i class="fas fa-file-video"></i>'
    if (isUrlAudio(url))
        return '<i class="fas fa-file-audio"></i>'
    if (isUrlFont(url))
        return '<i class="fas fa-pen-fancy"></i>'
    if (isUrlStyleSheet(url))
        return '<i class="fab fa-css3-alt"></i>'
    if (isUrlScript(url))
        return '<i class="fab fa-js-square"></i>'
    if (isUrlProtocolTel(url))
        return '<i class="fas fa-phone fa-flip-horizontal"></i>'
    if (isUrlProtocolMailto(url))
        return '<i class="fas fa-envelope"></i>'
    if (isUrlAnchor(url))
        return '<i class="fas fa-anchor"></i>'
    if (isUrlHTMLFile(url))
        return '<i class="fas fa-link"></i>'
    return '<i class="fas fa-file-alt"></i>'
}
/**
* Function to sort links depending on file type, and than alphabetically
* @param {string} a - first link to compare
* @param {string} b - second link to compare
* @returns {number} -1 if a is before b, 1 if a is after b, alphabetically if they are equal
*/
function sortLinks(a, b) {
    let aIndex = getFileIndex(a.href)
    let bIndex = getFileIndex(b.href)

    if (aIndex == bIndex)
        return a.href.localeCompare(b.href)
    else
        return aIndex - bIndex

    /**
    * Function to get the index of the file type
    * @param {string} url - url of the link
    * @returns {number} index of the file type
    */
    function getFileIndex(url) {
        if (isUrlPDFFile(url))
            return 1
        if (isUrlImage(url))
            return 2
        if (isUrlStyleSheet(url))
            return 3
        if (isUrlScript(url))
            return 4
        if (isUrlFont(url))
            return 5
        if (isUrlAnchor(url))
            return 50
        if (isUrlProtocolTel(url))
            return 98
        if (isUrlProtocolMailto(url))
            return 99
        if (isUrlHTMLFile(url))
            return 30
        return 0
    }
}
/**
* Function to create a delay before performing a task, to avoid multiple calls
* @param {function} fn - function to call
* @param {number} md - delay in ms
*/
function delay(fn, ms) {
    let timer = 0;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(fn.bind(this, ...args), ms || 0);
    };
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
 * Function to set the value of a key in the storage
 * @param {any} key - the key to set the value to
 * @param {*} value  - the value to set
 */
function storageSet(key, value) {
    chrome.storage.local.set({ [key]: value });
}

const toDataURL = url => fetch(url)
    .then(response => response.blob())
    .then(blob => new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(reader.result)
        reader.onerror = reject
        reader.readAsDataURL(blob)
    }))