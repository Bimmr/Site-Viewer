import { escapeHtml, escapeAttr } from '../lib/html.js'
import { getFAIcon, sortLinks } from '../lib/icons.js'
import { isUrlLocal, isUrlAnchor, isUrlProtocol, isUrlHTMLFile } from '../lib/url.js'
import { store } from '../state/store.js'
import { site } from '../state/site.js'
import { buildInfoHTML, buildTestIconHTML, buildIssuesHTML } from './rows.js'
import { buildMediaPreviewHTML } from './lists.js'

/**
 * Categorize a link from the inspected page into a popup section
 * @param {Object} link - Link or asset object
 * @returns {string} Category name ('links', 'files', 'assets')
 */
function categorizeLink(link) {
  if (link.link) return 'assets'

  // Broken links should go in 'links' section
  if (link.isBroken) return 'links'

  if (!isUrlHTMLFile(link.href) && !isUrlProtocol(link.href)) return 'files'
  return 'links'
}

/**
 * Builds view row HTML for a link, file or asset in the popup
 * @param {Object} link - Link or asset object
 * @param {string} category - Category ('links', 'files', 'assets')
 * @returns {string} HTML string for view row
 */
function buildPopupLinkRow(link, category) {
  const href = link.href || link.link
  const isAsset = !!link.link
  const isLocalPage = isUrlLocal(href) && !isUrlAnchor(href)

  const testIconHTML = category === 'links' && !isUrlProtocol(href) && !isUrlAnchor(href)
    ? buildTestIconHTML(link, href)
    : ''

  // Downloadable rows get a checkbox for the popup's Download Selected button
  const isDownloadable = category !== 'links'

  let iconHTML
  if (link.isBroken) iconHTML = getFAIcon('broken-link').icon
  else if (isLocalPage && !isAsset) iconHTML = getFAIcon('page').icon
  else iconHTML = getFAIcon(href).icon

  return `
    <div class="view-row" data-url="${escapeAttr(href)}">
      ${isDownloadable ? '<div class="select"><input type="checkbox"></div>' : ''}
      <div class="type">${iconHTML}</div>
      <div class="link">
        <p>${escapeHtml(href)}</p>
      </div>
      <div class="tools">
        <a class="goto" target="_blank" href="${escapeAttr(href)}" title="Open"><i class="fas fa-external-link-alt"></i></a>
        ${testIconHTML}
        ${isDownloadable ? `<a class="download" href="${escapeAttr(href)}" title="Download"><i class="fas fa-file-download"></i></a>` : ''}
        ${buildInfoHTML('popup-link')}
      </div>
    </div>
  `
}

/**
 * Build view row HTML for media in the popup
 * @param {Object} file - Media file object
 * @returns {string} HTML string for view row
 */
function buildPopupMediaRow(file) {

  return `
    <div class="view-row" data-url="${escapeAttr(file.src)}">
      <div class="image">${buildMediaPreviewHTML(file, false)}</div>
      <div class="link">
        <p>${escapeHtml(file.src)}</p>
      </div>
      <div class="tools">
        <a class="goto" target="_blank" href="${escapeAttr(file.src)}" title="Open"><i class="fas fa-external-link-alt"></i></a>
        <a class="download" href="${escapeAttr(file.src)}" title="Download"><i class="fas fa-file-download"></i></a>
        ${buildInfoHTML('popup-media')}
      </div>
    </div>
  `
}

/**
 * Opens the inspector popup for a crawled page
 * @param {string} url - The crawled page's URL
 */
export function openInspector(url) {
  const popup = document.querySelector("#inspecter")
  const page = store.getPage(url)
  if (!page) return

  popup.dataset.url = url

  // The start page's data can't be deleted
  const deleteButton = popup.querySelector(".popup-delete")
  if (deleteButton)
    deleteButton.style.display = url === site.baseUrl ? 'none' : ''

  const crawlMethodIcon = page.crawlMethod === 'live'
    ? '<i class="fas fa-window-restore" title="Crawled using Live Mode (JavaScript executed)"></i>'
    : '<i class="fas fa-download" title="Crawled using Fetch Mode (raw HTML)"></i>'
  const crawlMethodLabel = page.crawlMethod === 'live' ? 'Live Crawl' : 'Fetch Crawl'

  popup.querySelector(".card-title").innerHTML = `
    <h2>${escapeHtml(page.title)}</h2>
    <h3>${escapeHtml(url)}<br><br></h3>
    <p>${escapeHtml(page.description)}</p>
    <p style="margin-top: 10px; font-size: 0.9em; opacity: 0.8;">
      ${crawlMethodIcon} ${crawlMethodLabel}
    </p>
  `

  // Categorize and build HTML for links and assets
  const html = { links: '', files: '', assets: '', media: '', issues: '' }
  const items = [...page.links, ...page.assets].sort(sortLinks)
  items.forEach(link => {
    const category = categorizeLink(link)
    html[category] += buildPopupLinkRow(link, category)
  })

  page.media.forEach(file => html.media += buildPopupMediaRow(file))

  html.issues = page.issues.length > 0
    ? buildIssuesHTML(page.issues, { pageUrl: url })
    : '<div class="empty-row">No issues detected.</div>'

  // Render all sections with empty state fallback
  Object.keys(html).forEach(section => {
    popup.querySelector(`#popup-view-${section} .view-items`).innerHTML = html[section] || '<div class="empty-row">There are no items here.</div>'
  })
  popup.querySelectorAll(".multi-wrapper.active").forEach(wrapper => wrapper.classList.remove("active"))

  popup.classList.add("active")
}
