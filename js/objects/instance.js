class Instance{
    foundOn;
    tags;
    constructor(foundOn, tags){
        if(foundOn instanceof Base)
            this.foundOn = foundOn
        else
            this.foundOn = new Base(foundOn)
        this.tags = tags ?? {}
    }
    addTag(tag, value){
        this.tags[tag] = value
    }
}