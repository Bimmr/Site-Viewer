import {
  chromeExtensionRegex, getImageUrlRegex, getATagRegex, formatLink, isUrlLocal, isUrlImage, isUrlScript,
  isUrlStyleSheet, isUrlFont, isUrlHTMLFile, isUrlTemplate, normalizeUrl, getUrlExtension
} from '../lib/url.js'
import { createElementFromHTML } from '../lib/html.js'
import { sortLinks } from '../lib/icons.js'
import { detectIssues } from './issues.js'

// Attributes lazy-loading scripts use to hold the real image until it scrolls into view
const LAZY_SRC_ATTRIBUTES = ['data-src', 'data-lazy-src', 'data-original']
const LAZY_SRCSET_ATTRIBUTES = ['data-srcset', 'data-lazy-srcset']

// CSS properties whose url() is an image even when the URL has no image extension
const IMAGE_CSS_PROPERTIES = /^(background|mask|list-style|border-image|content|cursor|-webkit-mask)/

// Meta tags pointing at the image shown when the page is shared
const SOCIAL_IMAGE_SELECTOR = [
  'meta[property="og:image"]', 'meta[property="og:image:url"]', 'meta[property="og:image:secure_url"]',
  'meta[name="twitter:image"]', 'meta[name="twitter:image:src"]', 'meta[itemprop="image"]'
].join(', ')

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
 * Gets the URLs from a srcset attribute, e.g. "a.jpg 1x, b.jpg 2x" -> ["a.jpg", "b.jpg"]
 * @param {string} srcset - srcset value
 * @returns {string[]} Candidate URLs
 */
export function parseSrcset(srcset) {
  const urls = []
  let i = 0
  while (i < srcset.length) {
    // Skip separators
    while (i < srcset.length && /[\s,]/.test(srcset[i])) i++
    if (i >= srcset.length) break

    // The URL runs until whitespace
    let url = ''
    while (i < srcset.length && !/\s/.test(srcset[i])) url += srcset[i++]

    if (url.endsWith(',')) {
      // A candidate without a descriptor, e.g. "a.jpg,b.jpg 2x"
      url = url.replace(/,+$/, '')
    } else {
      // Skip the descriptor, e.g. "2x" or "640w"
      while (i < srcset.length && srcset[i] !== ',') i++
    }
    if (url) urls.push(url)
  }
  return urls
}

/**
 * Finds the URLs in CSS: url() values and @import rules
 * @param {string} css - CSS text, without comments
 * @returns {Array<{url: string, property: string|null, isImport: boolean}>} URLs with the property they're in
 */
export function getCssUrls(css) {
  const results = []

  for (const match of css.matchAll(/@import\s+(?:url\(\s*)?(['"]?)([^'")\s;]+)\1/gi))
    results.push({ url: match[2], property: null, isImport: true })

  for (const match of css.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)) {
    // Skip the url() of an @import, it was found above
    const before = css.slice(Math.max(0, match.index - 200), match.index)
    if (/@import\s*$/i.test(before)) continue

    const property = before.match(/([a-z-]+)\s*:[^:;{}]*$/i)?.[1].toLowerCase() || null
    results.push({ url: match[2].trim(), property, isImport: false })
  }

  return results.filter(({ url }) => url && !url.startsWith('#') && !/^(data|about|javascript):/i.test(url))
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
 * @param {Element|Object} element - The element to create the link from, or an object with tagName, href and title
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

  //If it's script, css or a font
  if (isUrlScript(link))
    asset.tags.isScript = true
  if (isUrlStyleSheet(link))
    asset.tags.isStyleSheet = true
  else if (isUrlFont(link))
    asset.tags.isFont = true

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
 * @param {string} base - URL a relative src resolves against, defaults to the page URL
 * @returns {Object} Image object with src, tags, and instances
 */
export function createImageObject(url, element, src, base = url) {

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
  image.src = formatLink(base, image.src)

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
 * @param {boolean} options.onPageStyles - Look for images and fonts in <style> tags of HTML pages
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
   * Resolves a URL from the page against its base
   * @param {string} raw - URL as written in the page
   * @returns {string|null} Absolute URL, or null if it isn't valid
   */
  const resolve = raw => {
    try {
      return new URL(raw, baseHref).href
    } catch {
      return null
    }
  }

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
   * @param {string} kind - 'image' | 'video' | 'audio' when known from where it was found, so URLs without an extension still preview
   */
  const addMedia = (file, extraTags = {}, kind) => {
    if (!/^(https?:|data:image\/)/i.test(file.src)) return
    Object.assign(file.instances[0].tags, extraTags)
    const found = mediaBySrc.get(file.src)
    if (found) {
      found.instances.push(file.instances[0])
    } else {
      if (kind) file.kind = kind
      mediaBySrc.set(file.src, file)
      media.push(file)
    }
  }

  /**
   * Adds media from a URL in the page
   * @param {string} raw - URL as written in the page
   * @param {string} kind - 'image' | 'video' | 'audio'
   * @param {Object} extraTags - Tags describing where it was found
   * @param {string} alt - Alt text
   */
  const addMediaUrl = (raw, kind, extraTags = {}, alt) => {
    if (!raw || !raw.trim()) return
    let file
    try {
      file = createImageObject(url, null, raw.trim(), baseHref)
    } catch {
      return
    }
    if (alt) file.instances[0].alt = alt
    addMedia(file, extraTags, kind)
  }

  /**
   * Adds an asset, or adds it as an instance if it was already found on this page
   * @param {string} assetUrl - Absolute URL of the asset
   * @param {Object} extraTags - Tags describing where it was found
   */
  const addAsset = (assetUrl, extraTags = {}) => {
    if (!/^https?:/i.test(assetUrl || '')) return
    const asset = createAssetObject(url, assetUrl)
    Object.assign(asset.instances[0].tags, extraTags)
    const found = assetsByLink.get(asset.link)
    if (found) {
      found.instances.push(...asset.instances)
    } else {
      assetsByLink.set(asset.link, asset)
      assets.push(asset)
    }
  }

  /**
   * Adds the images, fonts and imported stylesheets referenced by CSS
   * @param {string} css - CSS text
   * @param {Element} element - Element the CSS came from
   * @param {Object} extraTags - Tags describing where the CSS was found
   */
  const addCssUrls = (css, element, extraTags) => {
    getCssUrls(removeCSSComments(css)).forEach(({ url: raw, property, isImport }) => {
      const absolute = resolve(raw.replace(chromeExtensionRegex, '/').replace('viewer.html', ''))
      if (!absolute) return

      if (isImport || isUrlStyleSheet(absolute)) {
        addAsset(absolute, { isImport: true, ...extraTags })
      } else if (isUrlFont(absolute)) {
        addAsset(absolute, extraTags)
      } else if (isUrlImage(absolute) || (property && IMAGE_CSS_PROPERTIES.test(property) && !getUrlExtension(absolute))) {
        const tags = { ...extraTags }
        if (property?.startsWith('background')) tags.isBackground = true
        else if (property) tags.cssProperty = property
        addMediaUrl(raw, 'image', tags, element.title)
      }
    })
  }

  // === Links ===

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

  // Embedded documents, e.g. a PDF shown in the page
  doc.querySelectorAll("object[data], embed[src]").forEach(element => {
    const href = resolve(element.getAttribute(element.tagName === 'OBJECT' ? 'data' : 'src'))
    if (href && /^https?:/i.test(href))
      addLink(createLinkObject(url, { tagName: element.tagName, href, title: element.title }), { isEmbedded: true })
  })

  // === Images ===

  doc.querySelectorAll("img").forEach(element => {
    const alt = element.alt
    const lazyUrls = LAZY_SRC_ATTRIBUTES.map(attribute => element.getAttribute(attribute)).filter(Boolean)
    const lazySrcsets = LAZY_SRCSET_ATTRIBUTES.map(attribute => element.getAttribute(attribute)).filter(Boolean)
    const src = element.getAttribute("src")

    // Lazy-loaded images often have a tiny data: placeholder as their src
    const hasRealImage = lazyUrls.length > 0 || lazySrcsets.length > 0 || element.getAttribute("srcset")
    if (src && !(hasRealImage && src.startsWith("data:")))
      addMediaUrl(src, 'image', {}, alt)

    lazyUrls.forEach(lazyUrl => addMediaUrl(lazyUrl, 'image', { isLazy: true }, alt))
    parseSrcset(element.getAttribute("srcset") || '').forEach(candidate => addMediaUrl(candidate, 'image', { isSrcset: true }, alt))
    lazySrcsets.flatMap(parseSrcset).forEach(candidate => addMediaUrl(candidate, 'image', { isSrcset: true, isLazy: true }, alt))
  })

  // Alternative image formats and sizes in <picture>
  doc.querySelectorAll("picture source").forEach(element => {
    const alt = element.closest("picture").querySelector("img")?.alt
    const srcsets = [element.getAttribute("srcset"), ...LAZY_SRCSET_ATTRIBUTES.map(attribute => element.getAttribute(attribute))]
    srcsets.filter(Boolean).flatMap(parseSrcset).forEach(candidate => addMediaUrl(candidate, 'image', { isPictureSource: true }, alt))
  })

  doc.querySelectorAll('input[type="image"][src]').forEach(element => addMediaUrl(element.getAttribute("src"), 'image', {}, element.alt))

  // Images inside inline SVGs
  doc.querySelectorAll("svg image").forEach(element => {
    addMediaUrl(element.getAttribute("href") || element.getAttribute("xlink:href"), 'image', { isInSvg: true })
  })

  // Shown when the page is shared
  doc.querySelectorAll(SOCIAL_IMAGE_SELECTOR).forEach(element => addMediaUrl(element.getAttribute("content"), 'image', { isSocialImage: true }))

  // === Video and audio ===

  doc.querySelectorAll("video, audio").forEach(element => {
    const kind = element.tagName.toLowerCase()
    if (element.getAttribute("poster"))
      addMediaUrl(element.getAttribute("poster"), 'image', { isPoster: true })

    addMediaUrl(element.getAttribute("src"), kind)
    element.querySelectorAll("source[src]").forEach(source => addMediaUrl(source.getAttribute("src"), kind))
  })

  // === <link> elements: stylesheets, icons, preloads and manifests ===

  if (type == "html")
    doc.querySelectorAll("link[href]").forEach(element => {
      const rel = Array.from(element.relList).map(value => value.toLowerCase())
      const href = element.href

      if (rel.includes("stylesheet")) {
        addAsset(href)
      } else if (rel.some(value => ["icon", "apple-touch-icon", "apple-touch-icon-precomposed", "mask-icon"].includes(value))) {
        addMediaUrl(element.getAttribute("href"), 'image', { isIcon: true })
      } else if (rel.includes("manifest")) {
        addAsset(href, { isManifest: true })
      } else if (rel.includes("modulepreload")) {
        addAsset(href, { isPreload: true })
      } else if (rel.includes("preload") || rel.includes("prefetch")) {
        const as = (element.getAttribute("as") || '').toLowerCase()
        if (as === "image") {
          addMediaUrl(element.getAttribute("href"), 'image', { isPreload: true })
          parseSrcset(element.getAttribute("imagesrcset") || '').forEach(candidate => addMediaUrl(candidate, 'image', { isPreload: true, isSrcset: true }))
        } else if (["style", "script", "font"].includes(as)) {
          addAsset(href, { isPreload: true })
        }
      }
    })

  //Find and track all scripts as assets
  if (type == "html")
    doc.querySelectorAll('script[src]').forEach(element => addAsset(element.src))

  // === CSS ===

  // Inline style attributes
  doc.querySelectorAll('[style]').forEach(element => {
    const style = element.getAttribute("style")
    if (style.includes("url(")) addCssUrls(style, element, { isInline: true })
  })

  // <style> tags, or the whole file when crawling a stylesheet
  if (!isHTMLPage || onPageStyles)
    doc.querySelectorAll('style').forEach(element => {
      addCssUrls(element.innerHTML, element, type == "css" ? {} : { isInStyleTag: true })
    })

  // === Scripts ===

  //Find Background Images/Links in script tags - get links/images and add to crawl all list, but if already found add as an instance
  if (!isHTMLPage || onPageScripts)
    doc.querySelectorAll('script').forEach(element => {
      // Remove JS comments before parsing
      const cleanContent = removeJSComments(element.innerHTML)

      //Look for BackgroundImages
      const matches = cleanContent.match(getImageUrlRegex()) || []
      matches.forEach(style => {
        const match = getImageUrlRegex().exec(style)
        if (!match) return
        const src = match.groups.image.replace(chromeExtensionRegex, '/').replace('viewer.html', '')
        const absolute = resolve(src)
        if (absolute && isUrlImage(absolute))
          addMediaUrl(src, 'image', { isBackground: true, isInScriptTag: true }, element.title)
      })

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
            const absolute = resolve(rawHref)
            if (absolute) linkElement.setAttribute("href", absolute)
          }

          let link = createLinkObject(url, linkElement)
          if (!link) return
          if ((link._href && (link._href.startsWith("?")))) return

          addLink(link, { isInScriptTag: true })
        })
    })

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
