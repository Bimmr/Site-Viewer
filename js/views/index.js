import { store } from '../state/store.js'
import { site } from '../state/site.js'
import { renderPages, renderAssets, renderLinks, renderFiles, renderMedia } from './lists.js'
import { renderIssues } from './issues.js'
import { renderOverview } from './overview.js'
import { applySearchFilter } from './search.js'

// Each view and the store collections it shows, so it only re-renders when one of them changed
const views = [
  { id: 'pages', render: renderPages, collections: ['links'] },
  { id: 'assets', render: renderAssets, collections: ['assets', 'links'] },
  { id: 'links', render: renderLinks, collections: ['links'] },
  { id: 'files', render: renderFiles, collections: ['links'] },
  { id: 'media', render: renderMedia, collections: ['media', 'links'] },
  { id: 'issues', render: renderIssues, collections: ['issues'] }
]

// Collection versions each view was last rendered with
const renderedVersions = new Map()

// Timer for the pending batched render
let renderTimer = null

/**
 * Renders every view whose data changed since it was last rendered
 * @param {Object} options
 * @param {string[]} options.force - IDs of views to render even if their data hasn't changed
 */
export function renderViews({ force = [] } = {}) {
  clearTimeout(renderTimer)
  renderTimer = null

  views.forEach(view => {
    const version = view.collections.map(collection => store.versions[collection]).join(':')
    if (renderedVersions.get(view.id) === version && !force.includes(view.id)) return
    renderedVersions.set(view.id, version)

    view.render()
    const viewElement = document.getElementById(view.id)
    // Issues are filtered while rendering
    if (view.id !== 'issues') applySearchFilter('#' + view.id)
    syncSelection(viewElement)
  })

  renderOverview()
}

/**
 * Renders changed views soon, so many changes close together only render once
 */
export function scheduleRender() {
  if (!renderTimer)
    renderTimer = setTimeout(renderViews, 250)
}

/**
 * Updates a view's select-all checkbox and action buttons to match its checked rows
 * @param {HTMLElement} container - A .view or .popup-view
 */
export function syncSelection(container) {
  const checkboxes = Array.from(container.querySelectorAll('.view-items .view-row .select input'))
  const checked = checkboxes.filter(checkbox => checkbox.checked)
  const visible = checkboxes.filter(checkbox => !checkbox.closest('.view-row').classList.contains('hidden'))

  container.querySelector('.multi-wrapper')?.classList.toggle('active', checked.length > 0)

  const titleCheckbox = container.querySelector('.view-title .select input')
  if (titleCheckbox)
    titleCheckbox.checked = visible.length > 0 && visible.every(checkbox => checkbox.checked)

  if (container.id === 'pages') togglePageButtons(container)
}

/**
 * Gets the URLs of the checked rows in a view
 * @param {HTMLElement} container - A .view or .popup-view
 * @param {Object} options
 * @param {boolean} options.visibleOnly - Leave out rows hidden by the search filter
 * @returns {string[]} URLs
 */
export function getSelectedUrls(container, { visibleOnly = false } = {}) {
  return Array.from(container.querySelectorAll('.view-items .view-row[data-url] .select input:checked'))
    .map(checkbox => checkbox.closest('.view-row'))
    .filter(row => !visibleOnly || !row.classList.contains('hidden'))
    .map(row => row.dataset.url)
}

/**
 * Shows the Pages actions that apply to the checked pages
 * - Crawl: only if at least one checked page is uncrawled
 * - Delete: only if at least one checked page other than the start page is crawled
 * @param {HTMLElement} container - The Pages view
 */
function togglePageButtons(container) {
  const rows = Array.from(container.querySelectorAll('.view-items .view-row:not(.hidden)'))
    .filter(row => row.querySelector('.select input')?.checked)
  if (rows.length === 0) return

  const hasUncrawled = rows.some(row => row.querySelector('.crawl'))
  const hasDeletable = rows.some(row => row.querySelector('.inspect') && row.dataset.url !== site.baseUrl)

  container.querySelector('.crawlSelected').style.display = hasUncrawled ? 'inline-block' : 'none'
  container.querySelector('.deleteCrawlSelected').style.display = hasDeletable ? 'inline-block' : 'none'
}
