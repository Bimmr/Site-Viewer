import {
  chromeExtensionRegex, getImageUrlRegex, getATagRegex, formatLink, isUrlLocal, isUrlImage, isUrlScript,
  isUrlStyleSheet, isUrlHTMLFile, isUrlTemplate, normalizeUrl
} from '../lib/url.js'
import { createElementFromHTML } from '../lib/html.js'
import { sortLinks } from '../lib/icons.js'
import { detectIssues } from './issues.js'

/**
 * Removes JavaScript comments from a string
 * String literals are matched first and kept, so URLs like "https://..." aren't treated as comments
 * @param {string} str - String to process
 * @returns {string} String without JS comments
 */
export function removeJSComments(str) {
  return str.replace(
    /("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,
    (match, stringLiteral) => stringLiteral ? match : ''
  )
}

/**
 * Removes CSS comments from a string
 * @param {string} str - String to process
 * @returns {string} String without CSS comments
 */
export function removeCSSComments(str) {
  return str.replace(/\/\*[\s\S]*?\*\//g, '')
}

/**
 * Parses crawled page data into a document whose relative URLs resolve against the crawled page
 * @param {string} data - Page HTML
 * @param {string} url - URL the page was crawled from
 * @returns {{doc: Document, baseHref: string}} Parsed document and the URL relative links resolve against
 */
export function parsePageDocument(data, url) {
  const doc = (new DOMParser()).parseFromString(data, "text/html")

  // Without a base the parsed doc resolves relative URLs against viewer.html instead of the crawled page
  let baseElement = doc.querySelector("base[href]")
  let baseHref = url
  try {
    if (baseElement) baseHref = new URL(baseElement.getAttribute("href"), url).href
  } catch (e) { }
  if (!baseElement) {
    baseElement = doc.createElement("base")
    doc.head.prepend(baseElement)
  }
  baseElement.setAttribute("href", baseHref)

  return { doc, baseHref }
}

/**
 * Creates a link object from an element
 * @param {string} url - The URL location where this element was found
 * @param {Element} element - The element to create the link from
 * @returns {Object|null} Link object with href, tags, instances, and potentially isBroken flag
 */
export function createLinkObject(url, element) {
  if (!element) return null

  //Create the link object
  let link = {
    href: element.href || element.src || '',
    tags: { tag: element.tagName.toLowerCase() }
  }
  link.instances = [{
    title: element.title,
    text: element.text,
    tags: {},
    foundOn: url
  }]

  //Check if the element is opening a new tab
  if (element.target == "_blank")
    link.instances[0].tags.isNewTab = true

  if (link.href.indexOf("#") >= 0)
    link.tags.isAnchor = true

  link._href = link.href.replace(chromeExtensionRegex, '/')
  try {
    link.href = formatLink(url, link.href)
  } catch (e) {
    link.isBroken = true
  }

  if (isUrlLocal(link.href))
    link.tags.isLocal = true

  return link
}

/**
 * Creates an asset object from a link
 * @param {string} url - The URL location where this asset was found
 * @param {string} link - The link to the asset
 * @returns {Object} Asset object with link, tags, and instances
 */
export function createAssetObject(url, link) {
  //Create the asset object
  let asset = {
    link,
    tags: {}
  }
  asset.instances = [{
    tags: {},
    foundOn: url
  }]

  //If it's script or css
  if (isUrlScript(link))
    asset.tags.isScript = true
  if (isUrlStyleSheet(link))
    asset.tags.isStyleSheet = true

  asset._link = asset.link.replace(chromeExtensionRegex, '/')
  asset.link = formatLink(url, asset.link)

  if (isUrlLocal(asset.link))
    asset.tags.isLocal = true

  return asset
}

/**
 * Creates an image object from an element or link
 * @param {string} url - The URL location where this element was found
 * @param {Element} element - The element to create the image from (optional)
 * @param {string} src - The link to the image (used if element is null)
 * @returns {Object} Image object with src, tags, and instances
 */
export function createImageObject(url, element, src) {

  //Create the image object
  let image = {
    // element.src is "" (not null) when there's no src attribute, so check the attribute to allow lazy-load fallbacks
    src: (element?.getAttribute("src") && element.src) || element?.getAttribute("data-src") || src || '',
    tags: {}
  }
  image.instances = [{
    tags: {},
    foundOn: url,
  }]
  if (element?.alt)
    image.instances[0].alt = element.alt

  image._src = image.src.replace(chromeExtensionRegex, '/')
  image.src = formatLink(url, image.src)

  if (isUrlLocal(image.src))
    image.tags.isLocal = true

  return image
}

/**
 * Extracts the links, media, assets and issues from crawled page data
 * @param {string} data - Page content (HTML, or CSS/JS when crawling an asset)
 * @param {string} url - URL the content was crawled from
 * @param {Object} options - Crawl settings
 * @param {boolean} options.onPageScripts - Look for links and images in <script> tags of HTML pages
 * @param {boolean} options.onPageStyles - Look for images in <style> tags of HTML pages
 * @returns {Object} Page object
 */
export function extractPage(data, url, { onPageScripts = true, onPageStyles = true } = {}) {
  let type = "html"

  //If crawling a CSS page, add style tags to the page
  if (isUrlStyleSheet(url)) {
    data = "<style>" + data + "</style>"
    type = "css"
  }

  //If crawling a JS page, add script tags to the page
  if (isUrlScript(url)) {
    data = "<script>" + data + "</script>"
    type = "js"
  }

  // Get doc from fetched page data
  const { doc, baseHref } = parsePageDocument(data, url)
  const isHTMLPage = isUrlHTMLFile(url)

  //Init lists
  let links = []
  let media = []
  let assets = []

  // Lookups so de-duplicating doesn't scan the lists for every element
  const linksByHref = new Map()
  const mediaBySrc = new Map()
  const assetsByLink = new Map()

  /**
   * Adds a link to the page's links, or adds it as an instance if it was already found
   * Normalized URLs prevent duplicates with/without trailing slashes
   * @param {Object} link - Link object from createLinkObject
   * @param {Object} extraTags - Tags to add to this instance
   */
  const addLink = (link, extraTags = {}) => {
    const found = linksByHref.get(normalizeUrl(link.href)) || linksByHref.get(normalizeUrl(link._href))
    if (found) {
      found.instances.push({
        foundOn: url,
        title: link.instances[0].title,
        tags: { isNewTab: link.instances[0].tags.isNewTab, ...extraTags }
      })
    } else {
      Object.assign(link.instances[0].tags, extraTags)
      linksByHref.set(normalizeUrl(link.href), link)
      links.push(link)
    }
  }

  /**
   * Adds media to the page's media, or adds it as an instance if it was already found
   * @param {Object} file - Media object from createImageObject
   * @param {Object} extraTags - Tags to add to this instance
   */
  const addMedia = (file, extraTags = {}) => {
    Object.assign(file.instances[0].tags, extraTags)
    const found = mediaBySrc.get(file.src)
    if (found) {
      found.instances.push(file.instances[0])
    } else {
      mediaBySrc.set(file.src, file)
      media.push(file)
    }
  }

  /**
   * Adds a background image found in CSS text
   * @param {string} cssText - CSS that may contain background images
   * @param {Element} element - Element the CSS came from
   * @param {Object} extraTags - Tags describing where the image was found
   */
  const addBackgroundImages = (cssText, element, extraTags) => {
    const matches = cssText.match(getImageUrlRegex())
    if (!matches) return
    matches.forEach(style => {
      const match = getImageUrlRegex().exec(style)
      if (!match) return
      let src = match.groups.image.replace(chromeExtensionRegex, '/').replace('viewer.html', '')
      let image = createImageObject(url, null, src)
      if (isUrlImage(image.src)) {
        image.instances[0].alt = element.title
        addMedia(image, { isBackground: true, ...extraTags })
      }
    })
  }

  //Basic a tag - get link and add to crawl all list, but if already found add as an instance
  Array.from(doc.querySelectorAll("a")).filter(
    element => {
      const href = element.getAttribute("href")
      return href !== null &&
        !href.startsWith("javascript:") &&
        !href.startsWith("?") &&
        !href.startsWith("about:blank") &&
        !isUrlTemplate(href)
    }
  ).forEach(element => addLink(createLinkObject(url, element)))

  //Basic iframe tag - get link and add to crawl all list, but if already found add as an instance
  doc.querySelectorAll("iframe").forEach(element => {
    const src = element.getAttribute("src")
    // Filter out about:blank and invalid sources
    if (!src || src.startsWith("about:blank") || src.startsWith("?")) return

    addLink(createLinkObject(url, element))
  })

  //Basic img tag - get image and add to crawl all list, but if already found add as an instance
  doc.querySelectorAll("img").forEach(element => {
    let image = createImageObject(url, element)
    if (isUrlImage(image.src))
      addMedia(image)
  })

  //Basic video tag - get video and add to crawl all list, but if already found add as an instance
  doc.querySelectorAll("video").forEach(element => {
    if (element.poster && element.poster.length > 0)
      addMedia(createImageObject(url, null, element.poster))

    if (element.querySelector("source"))
      addMedia(createImageObject(url, null, element.querySelector("source").src))
  })

  //Basic audio tag - get audio and add to crawl all list, but if already found add as an instance
  doc.querySelectorAll("audio").forEach(element => {
    if (element.querySelector("source"))
      addMedia(createImageObject(url, null, element.querySelector("source").src))
  })

  //Background Image styles - get image and add to crawl all list, but if already found add as an instance
  doc.querySelectorAll('*[style*="background"]').forEach(element => {
    const match = getImageUrlRegex().exec(element.style.cssText)
    if (match) {
      let src = match.groups.image.replace(chromeExtensionRegex, '/').replace('viewer.html', '')
      let image = createImageObject(url, null, src)
      if (isUrlImage(image.src)) {
        image.instances[0].alt = element.title
        addMedia(image, { isBackground: true, isInline: true })
      }
    }
  })

  //Find Background Images hidden in style tags - get image and add to crawl all list, but if already found add as an instance
  if (!isHTMLPage || onPageStyles)
    doc.querySelectorAll('style').forEach(element => {
      // Remove CSS comments before parsing
      addBackgroundImages(removeCSSComments(element.innerHTML), element, { isInStyleTag: true })
    })

  //Find Background Images/Links in script tags - get links/images and add to crawl all list, but if already found add as an instance
  if (!isHTMLPage || onPageScripts)
    doc.querySelectorAll('script').forEach(element => {
      // Remove JS comments before parsing
      const cleanContent = removeJSComments(element.innerHTML)

      //Look for BackgroundImages
      addBackgroundImages(cleanContent, element, { isInScriptTag: true })

      //Look for Links
      const aTagMatches = cleanContent.match(getATagRegex())
      if (aTagMatches)
        aTagMatches.forEach(aTag => {
          let linkElement = createElementFromHTML(aTag + "</a>")
          if (!linkElement || !linkElement.getAttribute) return

          // Skip links whose href is still JS code, e.g. href="' + postLink + '"
          const rawHref = linkElement.getAttribute("href")
          if (rawHref && isUrlTemplate(rawHref)) return

          // Built outside the parsed doc, so resolve against the page's base manually
          if (rawHref && !rawHref.startsWith("javascript:") && !rawHref.startsWith("?")) {
            try {
              linkElement.setAttribute("href", new URL(rawHref, baseHref).href)
            } catch (e) { }
          }

          let link = createLinkObject(url, linkElement)
          if (!link) return
          if ((link._href && (link._href.startsWith("?")))) return

          addLink(link, { isInScriptTag: true })
        })
    })

  /**
   * Adds an asset, or adds it as an instance if it was already found on this page
   * @param {string} assetUrl - URL of the stylesheet or script
   */
  const addAsset = assetUrl => {
    const asset = createAssetObject(url, assetUrl)
    const found = assetsByLink.get(asset.link)
    if (found) {
      found.instances.push(...asset.instances)
    } else {
      assetsByLink.set(asset.link, asset)
      assets.push(asset)
    }
  }

  //Find and track all stylesheets and scripts as assets
  if (type == "html") {
    doc.querySelectorAll('link').forEach(element => {
      if (element.rel == "stylesheet" && element.href)
        addAsset(element.href)
    })
    doc.querySelectorAll('script').forEach(element => {
      if (element.src)
        addAsset(element.src)
    })
  }

  return {
    title: doc.querySelector("title")?.textContent,
    description: doc.querySelector("meta[name='description']")?.content,
    links: links.sort(sortLinks),
    media,
    assets,
    // Only the raw data is kept, parsed documents use far more memory (see parsePageDocument)
    data,
    // Detect accessibility and SEO issues
    issues: type == "html" ? detectIssues(doc, url) : []
  }
}
