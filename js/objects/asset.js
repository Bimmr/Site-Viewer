class Asset extends Base {
    instances;
    title;
    constructor(link, title, instances) {
        super(link)
        this.title = title ?? ''
        this.instances = instances ?? []
    }
    addInstance(instance) {
        this.instances.push(instance)
    }
}
class AssetManager {
    static assets = [];
    static addAsset(linkOrLink, title, instancesOrFoundOn, tags) {
        if (!title);
        else if (!instancesOrFoundOn)
            linkOrLink = new Asset(linkOrLink, title)
        else if (!tags)
            linkOrLink = new Asset(linkOrLink, title, instancesOrFoundOn)
        else
            linkOrLink = new Asset(linkOrLink, title, instancesOrFoundOn, tags)

        AssetManager.assets.push(linkOrLink)
        return linkOrLink
    }
    static getAsset(link) {
        return AssetManager.assets.find(link => link.link === link)
    }
    static getOrCreateAsset(link) {
        let asset = AssetManager.getAsset(link)
        if (!asset) {
            asset = new Asset(link)
            AssetManager.addAsset(asset)
        }
        return asset
    }
}

