import { escapeHtml } from '../lib/html.js'
import { store } from '../state/store.js'
import { buildTagsHTML, formatInstances } from './rows.js'

/**
 * Describes a link's crawl results for the top of its info popup
 * @param {Object} link - Link object
 * @returns {string} HTML string
 */
function describeLinkStatus(link) {
  let html = ''
  if (link.redirectsTo)
    html += 'Redirects to: <strong>' + escapeHtml(link.redirectsTo) + '</strong><br>'
  if (link.isDuplicate)
    html += '<span style="color: #2196F3;">Duplicate of: <strong>' + escapeHtml(link.duplicateOf) + '</strong></span><br>'
  return html
}

// Finds the item a row shows, from the row's data-url
const findItem = {
  page: url => store.getLink(url),
  link: url => store.getLink(url),
  file: url => store.getLink(url),
  asset: url => store.getAsset(url),
  media: url => store.media.get(url),
  'popup-link': url => store.getLink(url) || store.getAsset(url) || findOnInspectedPage(url, ['links', 'assets']),
  'popup-media': url => store.media.get(url) || findOnInspectedPage(url, ['media'])
}

/**
 * Finds an item on the page open in the inspector, for pages crawled without adding them to the results
 * @param {string} url - Item URL
 * @param {string[]} lists - Page lists to search
 * @returns {Object|undefined} The item
 */
function findOnInspectedPage(url, lists) {
  const page = store.getPage(document.querySelector('#inspecter')?.dataset.url)
  return lists.flatMap(list => page?.[list] || []).find(item => (item.href || item.link || item.src) === url)
}

// Builds the popup content for each kind of row
const buildContent = {
  page: link => buildTagsHTML(link, link._href, { showOriginal: true, hideIsLocal: true, extraHTML: describeLinkStatus(link) })
    + formatInstances(link.instances, i => i.text || i.alt || i.title),
  link: link => buildTagsHTML(link, link._href, { extraHTML: describeLinkStatus(link) })
    + formatInstances(link.instances, i => i.text || i.title),
  file: link => buildTagsHTML(link, link._href)
    + formatInstances(link.instances, i => i.text || i.title),
  asset: asset => buildTagsHTML(asset, asset._link, { hideIsLocal: true })
    + formatInstances(asset.instances, i => i.alt || i.title),
  media: file => buildTagsHTML(file, file._src, { showOriginal: true })
    + formatInstances(file.instances, i => i.alt),
  'popup-link': item => buildTagsHTML(item, item._href || item._link, { extraHTML: item.href ? describeLinkStatus(item) : '' })
    + formatInstances(item.instances, i => i.text || i.alt || i.title),
  'popup-media': file => buildTagsHTML(file, file._src)
    + formatInstances(file.instances, i => i.alt || i.title)
}

/**
 * Fills a row's info popup the first time it's hovered
 * Rows are re-rendered when their data changes, so a filled popup is never out of date for long
 * @param {HTMLElement} icon - The .hover-popup-icon being hovered
 */
export function fillInfoPopup(icon) {
  const kind = icon.dataset.infoKind
  const popup = icon.querySelector('.hover-popup')
  if (!kind || !popup || popup.dataset.filled) return

  const url = icon.closest('[data-url]')?.dataset.url
  const item = url && findItem[kind]?.(url)
  if (!item) return

  popup.innerHTML = buildContent[kind](item)
  popup.dataset.filled = 'true'
}
