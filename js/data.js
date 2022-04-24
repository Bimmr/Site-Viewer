
// Base and Host URL, both of these will be replaced when a new page is crawled
let baseUrl = 'https://bimmr.com'
let hostURL = 'https://bimmr.com'

// CORS Bypass to allow cross-origin requests
let CORS_BYPASS_URL = 'https://api.allorigins.win/get?url='
let CORS_BYPASS_URL_RAW = 'https://api.allorigins.win/raw?url='

//Regex for Chrome Extension
let chromeExtensionRegex = new RegExp(/(chrome-extension:\/\/\w*\/(viewer\.html)?)|(chrome-extension:\/)/g)

//Regex for viewer.html
let viewerRegex = new RegExp(/(viewer.html)/g)

//Regex for background or background-image style
let imageUrlRegex = new RegExp(/background(-image)?\s*:(.*?)(url)\(\s*(\'|")?((?!['"]?data:).*?)(?<image>.*?)\3?(\'|")?\s*\)/g)

//let urlRegex = new RegExp(/background(-image)?\s*:(.*?)(url)\(\s*(\'|")?(?<image>.*?)\3?(\'|")?\s*\)/g) - Ignoring if it contains 'data:'
let httpRegex = new RegExp(/^((http|https):)?\/\//g)

//Regex for a tag link
let aTagRegex = new RegExp(/(<a)(?:(?!<\/a>).)*/g)

//Regex for quotes
let quoteRegex = new RegExp(/["']/g)

//Regex for external stylesheets
let externalStylesheetRegex = new RegExp(/(<link)(?:(?!<\/link>).)*/g)

//Regex for external scripts
let externalScriptRegex = new RegExp(/(<script)(?:(?!<\/script>).)*/g)

//Regex for non word file name
let nonWordRegex = new RegExp(/[^a-z0-9A-Z.]/gi)
