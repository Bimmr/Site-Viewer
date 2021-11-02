/*
* Listen to files being downloaded and suggest the name if the file is being downloaded from Site Viewer
*/
chrome.downloads.onDeterminingFilename.addListener(function (item, suggest) {
    //If item download is from this extension
    if (item.byExtensionName == "Site Viewer") {

        //Regex for non word file name
        let nonWordRegex = new RegExp(/[^a-z0-9A-Z.]/gi)

        //Get url to download
        let url = item.url
        //get file name removing the http(s)://
        let name = url.substr(url.indexOf("://") + 3)
        //If still containing a /, start the string after that
        if (name.indexOf("/") >= 0)
            name = name.substr(name.indexOf("/") + 1)
        //Replace any remaining / with double _ then replace all non alphanumeric characters with single _
        name = name.replace("/", "__").replace(nonWordRegex, '_')
        //If the name is empty, assume you're downloading the home page
        if (!name || name.length == 0)
            name = "index.html"
        //If there is no extension, add .html
        if (name.indexOf(".") < 0)
            name += ".html"

        //Suggest the name of the file
        suggest({ filename: name })
    } else
        suggest()
});
