import { escapeHtml, escapeAttr } from '../lib/html.js'
import { getFAIcon } from '../lib/icons.js'
import { isUrlAnchor, isUrlProtocol, getUrlProtocol, isUrlImage, isUrlVideo, isUrlAudio, isUrlScript, isUrlStyleSheet } from '../lib/url.js'
import { store } from '../state/store.js'
import { buildTagsHTML, formatInstances, buildInfoHTML, buildTestIconHTML, renderRows } from './rows.js'

// Explanations for pages Crawl All didn't crawl
const skipReasonText = {
  robots: 'Skipped by Crawl All: blocked by robots.txt',
  depth: 'Skipped by Crawl All: deeper than the max depth',
  excluded: 'Skipped by Crawl All: matches an exclude pattern'
}

/**
 * Gets a URL's path, without the query or hash
 * @param {string} href - URL
 * @returns {string} Path
 */
const getPathname = href => {
  try {
    return new URL(href).pathname
  } catch (e) {
    return href.split('?')[0].split('#')[0].replace(/^https?:\/\/[^\/]+/, '')
  }
}

/**
 * Sorts pages by URL path, so pages appear under their parent paths
 * @param {Object} a - First page link
 * @param {Object} b - Second page link
 * @returns {number}
 */
function comparePagePaths(a, b) {
  const segmentsA = getPathname(a.href).split('/').filter(s => s.length > 0)
  const segmentsB = getPathname(b.href).split('/').filter(s => s.length > 0)

  // Compare each segment (case-insensitive to group properly)
  const minLength = Math.min(segmentsA.length, segmentsB.length)
  for (let i = 0; i < minLength; i++) {
    const comparison = segmentsA[i].toLowerCase().localeCompare(segmentsB[i].toLowerCase())
    if (comparison !== 0) return comparison
  }

  // If all segments match, shorter path comes first
  if (segmentsA.length !== segmentsB.length) return segmentsA.length - segmentsB.length

  // Finally, sort by full URL (including query params) for consistent ordering
  return a.href.localeCompare(b.href)
}

/**
 * Works out how far to indent each page, based on which of its parent paths are also pages
 * @param {Array} pages - Page links
 * @returns {Function} Returns the indent level for a page link
 */
function createIndentCalculator(pages) {
  // Pages without query params, by path
  const pathsWithoutParams = new Set()
  pages.forEach(link => {
    try {
      const url = new URL(link.href)
      if (!url.search) pathsWithoutParams.add(url.pathname)
    } catch (e) {
      pathsWithoutParams.add(getPathname(link.href))
    }
  })

  const findIndentLevel = (pathname, hasParams) => {
    // A page with query params is a child of the same path without them
    if (hasParams && pathsWithoutParams.has(pathname))
      return findIndentLevel(pathname, false) + 1

    // Walk up the path checking for each potential parent
    const segments = pathname.split('/').filter(s => s.length > 0)
    for (let i = segments.length - 1; i > 0; i--) {
      const parentPath = '/' + segments.slice(0, i).join('/')
      if (pathsWithoutParams.has(parentPath))
        return findIndentLevel(parentPath, false) + 1
    }
    return 0
  }

  return link => {
    try {
      const url = new URL(link.href)
      return findIndentLevel(url.pathname, !!url.search)
    } catch (e) {
      return findIndentLevel(getPathname(link.href), false)
    }
  }
}

/**
 * Builds the crawl status icon for a page
 * @param {Object} link - Page link
 * @returns {string} HTML string
 */
function buildPageStatusHTML(link) {
  const href = escapeAttr(link.href)
  if (link.isCrawling)
    return '<a class="crawling" title="Crawling in progress..."><i class="fas fa-spinner fa-spin"></i></a>'
  if (link.isError)
    return `<a class="error crawl" target="_blank" href="${href}" title="${escapeAttr(link.errorMessage || "Page doesn't exist or took too long to respond")}\nClick to retry"><i class="fas fa-times-circle"></i></a>`
  if (link.isWarning)
    return `<a class="warning crawl" target="_blank" href="${href}" title="Returned a status code of ${escapeAttr(link.statusCode)}\nClick to retry"><i class="fas fa-exclamation-circle"></i></a>`
  if (link.isDuplicate)
    return `<a class="info duplicate" title="Duplicate of ${escapeAttr(link.duplicateOf)}"><i class="fas fa-info-circle"></i></a>`
  if (link.isCrawled)
    return `<a class="inspect" title="Inspect Page" href="${href}"><i class="fas fa-search"></i></a>`
  const title = link.skipReason ? `${skipReasonText[link.skipReason]}\nClick to crawl anyway` : 'Crawl page'
  return `<a class="crawl" target="_blank" href="${href}" title="${escapeAttr(title)}"><i class="fas fa-sitemap"></i></a>`
}

/**
 * Updates the Pages view with local pages
 */
export function renderPages() {
  const pages = store.getPages().slice().sort(comparePagePaths)
  const getIndentLevel = createIndentCalculator(pages)

  let html = ''
  pages.forEach(link => {
    const indentLevel = getIndentLevel(link)
    const indentStyle = indentLevel > 0 ? `style="padding-left: ${indentLevel * 20}px;"` : ''

    // Add duplicate information if applicable
    const duplicateHTML = link.isDuplicate
      ? '<span style="color: #2196F3;">Duplicate of: <strong>' + escapeHtml(link.duplicateOf) + '</strong></span><br>'
      : ''
    //No need to display isLocal if it's a page
    const tagsHTML = buildTagsHTML(link, link._href, { showOriginal: true, hideIsLocal: true, extraHTML: duplicateHTML })
    const instancesHTML = formatInstances(link.instances, i => i.text || i.alt || i.title)

    html += `
      <div class="view-row" data-url="${escapeAttr(link.href)}">
        <div class="select">
          <input type="checkbox">
        </div>
        <div class="link">
          <p ${indentStyle}>${escapeHtml(link.href)}</p>
        </div>
        <div class="tools">
          <a class="download" href="${escapeAttr(link.href)}" title="Download Page"><i class="fas fa-file-download"></i></a>
          <a class="goto" target="_blank" href="${escapeAttr(link.href)}" title="Go to page"><i class="fas fa-external-link-alt"></i></a>
          ${buildPageStatusHTML(link)}
          ${buildInfoHTML(tagsHTML + instancesHTML)}
        </div>
      </div>
    `
  })

  renderRows(document.querySelector("#pages .view-items"), html)
}

/**
 * Updates the Assets view with scripts and stylesheets
 */
export function renderAssets() {
  let html = ''
  store.getAssets().forEach(asset => {
    const tagsHTML = buildTagsHTML(asset, asset._link, { hideIsLocal: true })
    const instancesHTML = formatInstances(asset.instances, i => i.alt || i.title)
    const canCrawl = !asset.isCrawled && (isUrlScript(asset.link) || isUrlStyleSheet(asset.link))

    html += `
      <div class="view-row" data-url="${escapeAttr(asset.link)}">
        <div class="select">
          <input type="checkbox">
        </div>
        <div class="type">${getFAIcon(asset.link).icon}</div>
        <div class="link">
          <p>${escapeHtml(asset.link)}</p>
        </div>
        <div class="tools">
          <a class="download" href="${escapeAttr(asset.link)}" title="Download Page"><i class="fas fa-file-download"></i></a>
          ${canCrawl ? `<a class="crawl" target="_blank" href="${escapeAttr(asset.link)}" title="Crawl page"><i class="fas fa-sitemap"></i></a>` : ''}
          ${buildInfoHTML(tagsHTML + instancesHTML)}
        </div>
      </div>
    `
  })

  renderRows(document.querySelector("#assets .view-items"), html)
}

/**
 * Gets the icon and type name for a row in the Links view
 * @param {Object} link - Link object
 * @returns {{icon: string, linkType: string}}
 */
function getLinkType(link) {
  if (link.isBroken) return { icon: getFAIcon('broken-link').icon, linkType: 'broken-link' }
  if (link.tags.tag === 'iframe') return { icon: getFAIcon('iframe').icon, linkType: 'iframe' }

  const protocol = getUrlProtocol(link.href)
  if (protocol) return { icon: getFAIcon(link.href).icon, linkType: `protocol:${protocol}` }
  if (isUrlAnchor(link.href)) return { icon: getFAIcon(link.href).icon, linkType: 'anchor' }
  return { icon: getFAIcon(link.href).icon, linkType: 'link' }
}

/**
 * Updates the Links view with external links and anchors
 */
export function renderLinks() {
  let html = ''
  store.getLinks().forEach(link => {
    const tagsHTML = buildTagsHTML(link, link._href)
    const instancesHTML = formatInstances(link.instances, i => i.text || i.title)
    const isTestable = !isUrlProtocol(link.href) && !isUrlAnchor(link.href)
    const { icon, linkType } = getLinkType(link)

    html += `
      <div class="view-row" data-url="${escapeAttr(link.href)}">
        <div class="select">${isTestable ? '<input type="checkbox">' : ''}</div>
        <div class="type">${icon.replace('<i class=', `<i title="${escapeAttr(linkType)}" class=`)}</div>
        <div class="link">
          <p>${escapeHtml(link.href)}</p>
        </div>
        <div class="tools">
          ${!link.isBroken ? `<a class="goto" target="_blank" href="${escapeAttr(link.href)}" title="Open link"><i class="fas fa-external-link-alt"></i></a>` : ''}
          ${isTestable && !link.isBroken ? buildTestIconHTML(link, link.href) : ''}
          ${buildInfoHTML(tagsHTML + instancesHTML)}
        </div>
      </div>
    `
  })

  renderRows(document.querySelector("#links .view-items"), html)
}

/**
 * Updates the Files view with downloadable files
 */
export function renderFiles() {
  let html = ''
  store.getFiles().forEach(link => {
    const tagsHTML = buildTagsHTML(link, link._href)
    const instancesHTML = formatInstances(link.instances, i => i.text || i.title)

    html += `
      <div class="view-row" data-url="${escapeAttr(link.href)}">
        <div class="select">
          <input type="checkbox">
        </div>
        <div class="type">${getFAIcon(link.href).icon}</div>
        <div class="link">
          <p>${escapeHtml(link.href)}</p>
        </div>
        <div class="tools">
          <a class="download" href="${escapeAttr(link.href)}" title="Download File"><i class="fas fa-file-download"></i></a>
          <a class="goto" target="_blank" href="${escapeAttr(link.href)}" title="Go to link"><i class="fas fa-external-link-alt"></i></a>
          ${buildInfoHTML(tagsHTML + instancesHTML)}
        </div>
      </div>
    `
  })

  renderRows(document.querySelector("#files .view-items"), html)
}

/**
 * Builds the preview for a media item
 * @param {Object} file - Media object
 * @param {boolean} expandable - Whether clicking an image opens it larger
 * @returns {string} HTML string
 */
export function buildMediaPreviewHTML(file, expandable = true) {
  if (isUrlImage(file.src)) {
    const altText = file.instances?.[0]?.alt || ''
    return `<img ${expandable ? 'class="expand-image"' : ''} src="${escapeAttr(file.src)}" alt="${escapeAttr(altText)}" title="${escapeAttr(altText)}">`
  }
  if (isUrlVideo(file.src))
    return `<video controls style="max-width: 100%; max-height: 100px;"><source src="${escapeAttr(file.src)}"></video>`
  if (isUrlAudio(file.src))
    return `<audio controls style="width: 100%;"><source src="${escapeAttr(file.src)}"></audio>`
  return getFAIcon(file.src).icon
}

/**
 * Updates the Media view with images, videos, and audio
 */
export function renderMedia() {
  let html = ''
  store.getMedia().forEach(file => {
    const tagsHTML = buildTagsHTML(file, file._src, { showOriginal: true })
    const instancesHTML = formatInstances(file.instances, i => i.alt)

    html += `
      <div class="view-row" data-url="${escapeAttr(file.src)}">
        <div class="select">
          <input type="checkbox">
        </div>
        <div class="image">${buildMediaPreviewHTML(file)}</div>
        <div class="link">
          <p>${escapeHtml(file.src)}</p>
        </div>
        <div class="tools">
          <a class="goto" target="_blank" href="${escapeAttr(file.src)}" title="Open Media"><i class="fas fa-external-link-alt"></i></a>
          <a class="download" href="${escapeAttr(file.src)}" title="Download Media"><i class="fas fa-file-download"></i></a>
          ${buildInfoHTML(tagsHTML + instancesHTML)}
        </div>
      </div>
    `
  })

  renderRows(document.querySelector("#media .view-items"), html)
}
