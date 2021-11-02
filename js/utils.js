// Functions to check if the url is a specific type
const isUrlHTML = url => (url.lastIndexOf("/") >= 7 && url.substr(url.lastIndexOf("/")).lastIndexOf(".") <= 0) || url.indexOf(".html") >= 0 || url.indexOf("htm") >= 0 || url.indexOf("aspx") >= 0
const isUrlPDF = url => url.indexOf('.pdf') >= 0
const isUrlProtocol = url => isUrlProtocolMailto(url) || isUrlProtocolTel(url)
const isUrlProtocolMailto = url => url.indexOf('mailto:') >= 0
const isUrlProtocolTel = url => url.indexOf('tel:') >= 0
const isUrlLocal = url => url.indexOf("://") == -1 && !isUrlProtocol(url)
const isUrlAnchor = url => url.indexOf("#") >= 0
const isUrlImage = url => url.indexOf(".png") >= 0 || url.indexOf(".gif") >= 0 || url.indexOf(".svg") >= 0 || url.indexOf(".jpg") >= 0 || url.indexOf(".jpeg") >= 0
const isUrlStyleSheet = url => url.indexOf(".css") >= 0
const isUrlScript = url => url.indexOf(".js") >= 0
const isUrlFont = url => url.indexOf(".ttf") >= 0 || url.indexOf("fonts.googleapis.com") >= 0


/* 
* Function to create HTML Element from string
* @param {string} htmlString - HTML string to turn into html element
*/
function createElementFromHTML(htmlString) {
    var template = document.createElement('template');
    template.innerHTML = htmlString.trim();
    return template.content.firstChild;
}

/*
* Function to get the icon for a link
* @param {string} url - url of the link
*/
function getURLIcon(url) {
    if (isUrlPDF(url))
        return '<i class="fas fa-file-pdf"></i>'
    if (isUrlImage(url))
        return '<i class="fas fa-image"></i>'
    if (isUrlStyleSheet(url))
        return '<i class="fab fa-css3-alt"></i>'
    if (isUrlScript(url))
        return '<i class="fab fa-js-square"></i>'
    if (isUrlFont(url))
        return '<i class="fas fa-pen-fancy"></i>'
    if (isUrlProtocolTel(url))
        return '<i class="fas fa-phone fa-flip-horizontal"></i>'
    if (isUrlProtocolMailto(url))
        return '<i class="fas fa-envelope"></i>'
    if (isUrlAnchor(url))
        return '<i class="fas fa-anchor"></i>'
    if (isUrlHTML(url))
        return '<i class="fas fa-link"></i>'
    return '<i class="fas fa-file"></i>'
}
/*
* Function to sort links depending on file type, and than alphabetically
* @param {string} a - first link to compare
* @param {string} b - second link to compare
*/
function sortLinks(a, b) {
    let aIndex = getFileIndex(a.href)
    let bIndex = getFileIndex(b.href)
    if (aIndex == bIndex)
        return a.href.localeCompare(b.href)
    else
        return aIndex - bIndex

    /*
    * Function to get the index of the file type
    * @param {string} url - url of the link
    */
    function getFileIndex(url) {
        if (isUrlPDF(url))
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
        if (isUrlHTML(url))
            return 30
        return 0
    }
}
/*
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