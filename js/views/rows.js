import { escapeHtml, escapeAttr, renderToContainer } from '../lib/html.js'
import { store } from '../state/store.js'

const TEXT_FRAGMENT_MAX_LENGTH = 50

/**
 * Creates a URL with text fragment for scroll-to-text functionality
 * @param {string} baseUrl - The base URL
 * @param {string} text - The text to create a fragment for
 * @returns {string} URL with text fragment appended
 */
export function createTextFragmentUrl(baseUrl, text) {
  if (!text) return baseUrl

  // Encode the text for URL and limit to first 50 characters for reliability
  const textForFragment = encodeURIComponent(text.trim().substring(0, TEXT_FRAGMENT_MAX_LENGTH))
  return baseUrl + '#:~:text=' + textForFragment
}

/**
 * Builds the tags section of an info popup
 * @param {Object} item - Link, file, asset or media object
 * @param {string} originalUrl - URL as written in the page, before being made absolute
 * @param {Object} options
 * @param {boolean} options.showOriginal - Show the original URL even if the item isn't local
 * @param {boolean} options.hideIsLocal - Leave out the isLocal tag
 * @param {string} options.extraHTML - HTML to add after the original URL
 * @returns {string} HTML string for tags section
 */
export function buildTagsHTML(item, originalUrl, { showOriginal = false, hideIsLocal = false, extraHTML = '' } = {}) {
  let tagsHTML = ''

  if (originalUrl && (showOriginal || item.tags.isLocal))
    tagsHTML += `Original URL: <strong>${escapeHtml(originalUrl)}</strong><br>`

  tagsHTML += extraHTML

  Object.keys(item.tags).forEach(key => {
    if (hideIsLocal && key === 'isLocal') return
    tagsHTML += `${key}: <strong>${escapeHtml(item.tags[key])}</strong><br>`
  })

  return tagsHTML ? tagsHTML.slice(0, -4) + '<hr>' : ''
}

/**
 * Filters and formats instances, excluding duplicates and grouping by URL
 * @param {Array} instances - Array of instance objects
 * @param {Function} getTextFn - Function to extract text for fragment URL
 * @returns {string} Formatted HTML string of instances
 */
export function formatInstances(instances, getTextFn) {
  const duplicateUrls = store.getDuplicateUrls()
  const nonDuplicateInstances = instances.filter(i => !duplicateUrls.has(i.foundOn))

  // Group instances by foundOn URL
  const groupedInstances = new Map()
  nonDuplicateInstances.forEach(instance => {
    const url = instance.foundOn
    if (!groupedInstances.has(url)) {
      groupedInstances.set(url, [])
    }
    groupedInstances.get(url).push(instance)
  })

  let instancesText = '<strong>Instances:</strong>(' + nonDuplicateInstances.length + ')<ul>'

  groupedInstances.forEach((instanceGroup, url) => {
    const count = instanceGroup.length
    const firstInstance = instanceGroup[0]
    const fragmentUrl = createTextFragmentUrl(url, getTextFn(firstInstance))

    // Add count suffix if multiple instances on same page
    const countSuffix = count > 1 ? ` (${count})` : ''
    instancesText += '<li><a href="' + escapeHtml(fragmentUrl) + '" target="_blank">' + escapeHtml(url) + countSuffix + '</a><ul>'

    // Show details from first instance
    if (firstInstance.title)
      instancesText += '<li>Title: <strong>' + escapeHtml(firstInstance.title) + '</strong></li>'
    if (firstInstance.text)
      instancesText += '<li>Text: <strong>' + escapeHtml(firstInstance.text) + '</strong></li>'
    if (firstInstance.alt)
      instancesText += '<li>Alt: <strong>' + escapeHtml(firstInstance.alt) + '</strong></li>'
    Object.keys(firstInstance.tags).forEach(i1 => instancesText += firstInstance.tags[i1] ? "<li>" + i1 + ": <strong>" + escapeHtml(firstInstance.tags[i1]) + "</strong></li>" : '')

    instancesText += '</ul></li>'
  })

  instancesText += '</ul>'
  return instancesText
}

/**
 * Builds the info icon with its hover popup
 * @param {string} contentHTML - HTML shown in the popup
 * @returns {string} HTML string
 */
export function buildInfoHTML(contentHTML) {
  return `
    <div class="info">
      <div class="hover-popup-icon">
        <span class="fa-stack fa-1x">
          <i class="fas fa-square fa-stack-2x"></i>
          <i class="fas fa-info fa-stack-1x fa-inverse"></i>
        </span>
        <div class="hover-popup">${contentHTML}</div>
      </div>
    </div>`
}

/**
 * Builds the test status icon for a link
 * @param {Object} link - Link object
 * @param {string} href - Link URL
 * @returns {string} HTML string for the icon
 */
export function buildTestIconHTML(link, href) {
  if (!link.test) {
    return `<a class="test" target="_blank" href="${escapeAttr(href)}" title="Test the link"><i class="fas fa-question-circle"></i></a>`
  }

  const testIcons = {
    success: { class: 'success', icon: 'check-circle', title: 'Link is valid' },
    warning: { class: 'warning', icon: 'exclamation-circle', title: `Returned a status code of ${link.statusCode}\nClick to retry` },
    failed: { class: 'error', icon: 'times-circle', title: "Link doesn't exist or took too long to respond\nClick to retry" }
  }

  const config = testIcons[link.test]
  if (!config) return ''

  return `<a class="${config.class}" target="_blank" href="${escapeAttr(href)}" title="${escapeAttr(config.title)}"><i class="fas fa-${config.icon}"></i></a>`
}

/**
 * Renders rows into a view, keeping rows that were checked before checked afterwards
 * Rows are matched by their data-url attribute
 * @param {HTMLElement} container - The .view-items element
 * @param {string} html - Rows HTML
 * @param {string} emptyText - Message to show when there are no rows
 */
export function renderRows(container, html, emptyText) {
  const checked = new Set(Array.from(container.querySelectorAll('.view-row[data-url] .select input:checked'))
    .map(input => input.closest('.view-row').dataset.url))

  renderToContainer(container, html, emptyText)

  if (checked.size > 0)
    container.querySelectorAll('.view-row[data-url]').forEach(row => {
      const checkbox = row.querySelector('.select input')
      if (checkbox && checked.has(row.dataset.url)) checkbox.checked = true
    })
}

// Severity order and icons for issues
const severityOrder = { error: 0, warning: 1, info: 2 }
const severityIcons = { error: 'fa-circle-xmark', warning: 'fa-triangle-exclamation', info: 'fa-circle-info' }

/**
 * Builds issue rows grouped by message, most severe first
 * @param {Array} issues - Issues to show
 * @param {Object} options
 * @param {string} options.pageUrl - Set when showing one page's issues, which leaves out the page column
 * @returns {string} HTML string
 */
export function buildIssuesHTML(issues, { pageUrl = null } = {}) {
  // Group by issue message
  const groupedIssues = new Map()
  issues.forEach(issue => {
    if (!groupedIssues.has(issue.message)) groupedIssues.set(issue.message, [])
    groupedIssues.get(issue.message).push(issue)
  })

  const compareSeverity = (a, b) => severityOrder[a.severity] - severityOrder[b.severity]

  const groups = Array.from(groupedIssues.entries()).map(([message, items]) => {
    items.sort((a, b) => compareSeverity(a, b) || a.type.localeCompare(b.type))
    return { message, items, severity: items[0].severity, type: items[0].type, category: items[0].category }
  }).sort((a, b) => compareSeverity(a, b) || a.type.localeCompare(b.type) || a.message.localeCompare(b.message))

  const showPageColumn = !pageUrl

  let html = ''
  groups.forEach(group => {
    html += `
      <div class="view-row issue-group severity-${group.severity}" data-category="${escapeAttr(group.category)}">
        <div class="severity ${group.severity}">
          <i class="fas ${severityIcons[group.severity]}"></i>
        </div>
        <div class="issue-group-header">
          <p><span class="issue-badge ${escapeAttr(group.type)}">${escapeHtml(group.type)}</span> ${escapeHtml(group.message)} <span class="issue-count">(${group.items.length})</span></p>
        </div>
        <div class="message"></div>
        ${showPageColumn ? '<div class="page"></div>' : ''}
        <div class="tools"></div>
      </div>
    `

    group.items.forEach(issue => {
      const location = pageUrl || issue.location
      const displayUrl = location.length > 60 ? '...' + location.substring(location.length - 57) : location
      const fragmentText = issue.fragmentText || ''
      const findOnPageUrl = fragmentText ? createTextFragmentUrl(location, fragmentText) : location

      html += `
        <div class="view-row issue-child severity-${issue.severity}" data-category="${escapeAttr(issue.category)}">
          <div class="severity ${issue.severity}">
            <i class="fas ${severityIcons[issue.severity]}"></i>
          </div>
          <div class="element" title="${escapeAttr(issue.elementFull || issue.element)}">
            ${escapeHtml(issue.element)}
          </div>
          <div class="message">
            <p>${issue.context ? escapeHtml(issue.context) : '<em>No additional details</em>'}</p>
          </div>
          ${showPageColumn ? `
          <div class="page">
            <span class="page-link" title="${escapeAttr(location)}">${escapeHtml(displayUrl)}</span>
          </div>` : ''}
          <div class="tools">
            <a class="goto" href="${escapeAttr(location)}" target="_blank" title="Open page">
              <i class="fas fa-external-link-alt"></i>
            </a>
            ${fragmentText
              ? `<a class="find-on-page" href="${escapeAttr(findOnPageUrl)}" target="_blank" title="Find on page">
                  <i class="fas fa-search"></i>
                </a>`
              : ''}
          </div>
        </div>
      `
    })
  })

  return html
}
