class Media extends Base {
    alt;
    instances;

    constructor(link, alt, instances) {
        super(link)
        this.alt = alt ?? ''
        this.instances = instances ?? []
    }

    addInstance(instance) {
        this.instances.push(instance)
    }

    isImage() {
        return link.indexOf(".png") >= 0 || link.indexOf(".gif") >= 0 || link.indexOf(".svg") >= 0 || link.indexOf(".jpg") >= 0 || link.indexOf(".jpeg") >= 0 || link.indexOf(".bmp") >= 0 || link.indexOf(".webp") >= 0 || link.indexOf("data:image/svg") >= 0
    }
    isVideo() {
        return link.indexOf(".mp4") >= 0 || link.indexOf(".webm") >= 0 || link.indexOf(".ogg") >= 0
    }
    isAudio() {
        return link.indexOf(".mp3") >= 0 || link.indexOf(".wav") >= 0 || link.indexOf(".ogg") >= 0
    }
    static #fileInfo = {
        'png': {
            order: 1,
            icon: 'fas fa-image'
        },
        'jpg': {
            order: 2,
            icon: 'fas fa-image'
        },
        'jpeg': {
            order: 3,
            icon: 'fas fa-image'
        },
        'gif': {
            order: 4,
            icon: 'fas fa-image'
        },
        'svg': {
            order: 5,
            icon: 'fas fa-image'
        },
        'bmp': {
            order: 6,
            icon: 'fas fa-image'
        },
        'webp': {
            order: 7,
            icon: 'fas fa-image'
        },
        'mp4': {
            order: 21,
            icon: 'fas fa-file-video'
        },
        'webm': {
            order: 22,
            icon: 'fas fa-file-video'
        },
        'ogg': {
            order: 23,
            icon: 'fas fa-file-video'
        },
        'mp3': {
            order: 31,
            icon: 'fas fa-file-audio'
        },
        'wav': {
            order: 32,
            icon: 'fas fa-file-audio'
        }
    }
    static getSortOrder(fileType) {
        return Media.#fileInfo[fileType].order
    }
    static getFileIcon(fileType) {
        return Media.#fileInfo[fileType].icon
    }
}

class MediaManager {
    static media = [];

    static addMedia(mediaOrLink, alt, instancesOrFoundOn, tags) {
        if (!alt);
        else if (!instancesOrFoundOn)
            mediaOrLink = new Media(mediaOrLink, alt)
        else if (!tags)
            mediaOrLink = new Media(mediaOrLink, alt, instancesOrFoundOn)
        else
            mediaOrLink = new Media(mediaOrLink, alt, instancesOrFoundOn, tags)

        MediaManager.media.push(mediaOrLink)
        return mediaOrLink
    }
    static getMedia(link) {
        return MediaManager.media.find(media => media.link === link)
    }
    static getOrCreateMedia(link) {
        let media = MediaManager.getMedia(link)
        if (!media) {
            media = new Media(link)
            MediaManager.addMedia(media)
        }
        return media
    }
}