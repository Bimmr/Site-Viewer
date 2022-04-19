// A Link that isn't an Asset or Media
class Link extends Base {
    title;
    instances;
    constructor(link, title, instances) {
        super(link)
        this.title = title ?? ''
        this.instances = instances ?? []
    }
    addInstance(instance) {
        this.instances.push(instance)
    }
}
class LinkManager {
    static links = [];

    static addLink(linkOrLink, title, instancesOrFoundOn, tags) {
        if (!title);
        else if (!instancesOrFoundOn)
            linkOrLink = new Link(linkOrLink, title)
        else if (!tags)
            linkOrLink = new Link(linkOrLink, title, instancesOrFoundOn)
        else
            linkOrLink = new Link(linkOrLink, title, instancesOrFoundOn, tags)

        LinkManager.links.push(linkOrLink)
        return linkOrLink
    }
    static getLink(link) {
        return LinkManager.links.find(link => link.link === link)
    }
    static getOrCreateLink(link) {
        let link = LinkManager.getLink(link)
        if (!link) {
            link = new Link(link)
            LinkManager.addLink(link)
        }
        return link
    }
}