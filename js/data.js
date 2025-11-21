
// Base and Host URL, both of these will be replaced when a new page is crawled
let baseUrl = 'https://bimmr.com'
let hostURL = 'https://bimmr.com'

// CORS Bypass to allow cross-origin requests (will be updated from settings)
let CORS_BYPASS_URL = 'https://api.allorigins.win/get?url='
let CORS_BYPASS_URL_RAW = 'https://api.allorigins.win/raw?url='

//Regex for Chrome Extension
const chromeExtensionRegex = /(chrome-extension:\/\/\w*\/(viewer\.html)?)|(chrome-extension:\/)/

//Regex for viewer.html
const viewerRegex = /(viewer.html)/

//Regex for background or background-image style - Function to create fresh instance
const getImageUrlRegex = () => /background(-image)?\s*:(.*?)(url)\(\s*(\'|")?((?!['']?data:).*?)(?<image>.*?)\3?(\'|")?\s*\)/g

//let urlRegex = new RegExp(/background(-image)?\s*:(.*?)(url)\(\s*(\'|")?(?<image>.*?)\3?(\'|")?\s*\)/g) - Ignoring if it contains 'data:'
const httpRegex = /^((http|https):)?\/\//

//Regex for a tag link - Function to create fresh instance
const getATagRegex = () => /(<a)(?:(?!<\/a>).)*/g

//Regex for quotes
const quoteRegex = /["']/

//Regex for external stylesheets
let externalStylesheetRegex = new RegExp(/(<link)(?:(?!<\/link>).)*/g)

//Regex for external scripts
let externalScriptRegex = new RegExp(/(<script)(?:(?!<\/script>).)*/g)

//Regex for non word file name
let nonWordRegex = new RegExp(/[^a-z0-9A-Z.]/gi)
