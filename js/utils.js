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
 * Function to get the icon based of either a URL or a tag
 * @param {string} tag - either a tag or a URL
 */
function getFAIcon(value, getIndex = false) {
    let icon
    try {
        //Urls
        new URL(value)

        if (isUrlAnchor(value))
            icon = ['<i class="fas fa-anchor"></i>', 1]
        else if (isUrlProtocolTel(value))
            icon = ['<i class="fas fa-phone"></i>', 11]
        else if (isUrlProtocolMailto(value))
            icon = ['<i class="fas fa-envelope"></i>', 12]
        else if (isUrlProtocol(value))
            icon = ['<i class="fas fa-globe"></i>', 10]
        else if (isUrlPDFFile(value))
            icon = ['<i class="fas fa-file-pdf"></i>', 20]
        else if (isUrlImage(value))
            icon = ['<i class="fas fa-image"></i>', 21]
        else if (isUrlVideo(value))
            icon = ['<i class="fas fa-file-video"></i>', 22]
        else if (isUrlAudio(value))
            icon = ['<i class="fas fa-file-audio"></i>', 23]
        else if (isUrlStyleSheet(value))
            icon = ['<i class="fab fa-css3-alt"></i>', 30]
        else if (isUrlScript(value))
            icon = ['<i class="fab fa-js-square"></i>', 31]
        else if (isUrlFont(value))
            icon = ['<i class="fas fa-font"></i>', 32]
        else if (isUrlHTMLFile(value))
            icon = ['<i class="fas fa-link"></i>', 90]


    } catch (e) { }
    //Tags
    switch (value) {
        case 'iframe':
            icon = ['<i class="fas fa-window-restore"></i>', 20]
            break;
        case 'img':
            icon = ['<i class="fas fa-image"></i>', 21]
            break;
        case 'video':
            icon = ['<i class="fas fa-file-video"></i>', 22]
            break;
        case 'audio':
            icon = ['<i class="fas fa-file-audio"></i>', 23]
            break;
        case 'link':
            icon = ['<i class="fab fa-css3-alt"></i>', 30]
            break;
        case 'style':
            icon = ['<i class="fab fa-css3-alt"></i>', 30]
            break;
        case 'script':
            icon = ['<i class="fab fa-js-square"></i>', 31]
            break;
    }

    if (!icon)
        icon = ['<i class="fas fa-file-alt"></i>', 100]


    if (getIndex)
        return icon[1]
    else
        return icon[0]
}
/**
* Function to sort links depending on file type, and than alphabetically
* @param {string} a - first link to compare
* @param {string} b - second link to compare
* @returns {number} -1 if a is before b, 1 if a is after b, alphabetically if they are equal
*/
function sortLinks(a, b) {
    let aIndex,
        bIndex

    //A Index
    if (a.tags.tag == 'a' && b.tags.tag == 'a') {
        aIndex = getFAIcon(a.href, true)
        bIndex = getFAIcon(b.href, true)
    } else {
        aIndex = getFAIcon(a.tags.tag, true)
        bIndex = getFAIcon(b.tags.tag, true)
    }

    if (aIndex == bIndex)
        return a.href.localeCompare(b.href)
    else
        return aIndex - bIndex
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

const getLocation = function (href) {
    var l = document.createElement("a");
    l.href = href;
    return l;
};