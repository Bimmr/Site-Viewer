class Base {
    link;
    origionalLink;

    constructor(link) {
        link = link.replace(chromeExtensionRegex, '/')
        this.origionalLink = link
        this.url = getFormatedLink(link)
    }
    isLocal(){
        return new URL(this.origionalLink).host == window.extensionId
    }
    isHTML() {
        return new URL(link).pathname.split('/').pop().indexOf('.') <= 0 || link.indexOf(".html") >= 0 || link.indexOf(".shtml") >= 0 || link.indexOf(".htm") >= 0 || link.indexOf(".aspx") >= 0 || link.indexOf(".asp") >= 0 || link.indexOf(".jsp") >= 0 || link.indexOf(".php") >= 0
    }
    getFileType() {
        let lastPath = new URL(this.link).pathname.split('/').pop();
        if (lastPath.indexOf('.') >= 0)
            return new URL(link).pathname.split('/').pop().split('.').pop()
        else return 'html'
    }
    getFormatedLink() {

        let chromeExtensionProtocol = 'chrome-extension:'
        let chromeExtensionId = window.extensionId

        let urlLocation = new URL(url)
        let urlOrigin = urlLocation.origin

        let linkLocation = new URL(getLocation(link))

        //If it's not a local link or a // link
        if (linkLocation.protocol != chromeExtensionProtocol)
            return link

        // If it's a // link
        if (linkLocation.host != chromeExtensionId)
            return urlLocation.protocol + "//" + linkLocation.host + linkLocation.pathname + linkLocation.hash + linkLocation.search

        // If it's a local link 
        if (linkLocation.pathname == "/viewer.html")
            return urlLocation.protocol + "//" + urlLocation.host + "/" + linkLocation.hash + linkLocation.search
        return urlLocation.protocol + "//" + urlLocation.host + linkLocation.pathname + linkLocation.hash + linkLocation.search

    }

    static #tagInfo = {
        'iframe': {
            order: 1,
            icon: 'fas fa-window-restore'
        },
        'a': {
            order: 1,
            icon: 'fas fa-link'
        },
        'script': {
            order: 2,
            icon: 'fab fa-js-square'
        },
        'link': {
            order: 3,
            icon: 'fab fa-css3-alt'
        },
        'style': {
            order: 4,
            icon: 'fab fa-css3-alt'
        },
        'img': {
            order: 5,
            icon: 'fas fa-image'
        },
        'video': {
            order: 6,
            icon: 'fas fa-file-video'
        },
        'audio': {
            order: 7,
            icon: 'fas fa-file-audio'
        }
    }
    static getSortOrder(tag) {
        return Base.#tagInfo[tag].order
    }
    static getTagIcon(tag) {
        return Base.#tagInfo[tag].icon
    }
}
