const isUrlHTML = url => (url.lastIndexOf("/") >= 7 && url.substr(url.lastIndexOf("/")).lastIndexOf(".") <= 0) || url.indexOf(".html") >= 0 || url.indexOf("htm") >= 0
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

/* Create an HTML Element from a string */
function createElementFromHTML(htmlString) {
    var template = document.createElement('template');
    template.innerHTML = htmlString.trim();
    return template.content.firstChild;
}

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
function sortLinks(a, b) {
    let aIndex = getFileIndex(a.href)
    let bIndex = getFileIndex(b.href)
    if (aIndex == bIndex)
        return a.href.localeCompare(b.href)
    else
        return aIndex - bIndex

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
/* @arr array you want to listen to
   @callback function that will be called on any change inside array
 */
   function listenChangesinArray(arr,callback){
    // Add more methods here if you want to listen to them
   ['pop','push','reverse','shift','unshift','splice','sort'].forEach((m)=>{
       arr[m] = function(){
                    var res = Array.prototype[m].apply(arr, arguments);  // call normal behaviour
                    callback.apply(arr, arguments);  // finally call the callback supplied
                    return res;
                }
   });
}