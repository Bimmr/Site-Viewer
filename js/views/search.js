/**
 * Checks a single search term against a row
 * Supports !term to invert, is:crawled, is:warning and is:error, and is:<tag> for any of the row's tags
 * (data-tags, e.g. is:srcset, is:font, is:redirect, is:duplicate)
 * @param {HTMLElement} row - View row
 * @param {string} searchTerm - Term to check
 * @returns {boolean} Whether the row matches
 */
function rowMatchesTerm(row, searchTerm) {
  let search = searchTerm.trim()
  let invertFilter = false

  if (search.startsWith('!')) {
    invertFilter = true
    search = search.substring(1).trim()
  }

  const customFilter = search.match(/^is:(\w+)$/i)
  let termMatches

  if (customFilter) {
    switch (customFilter[1].toLowerCase()) {
      case 'crawled':
        termMatches = row.querySelector('.crawl') === null
        break
      case 'warning':
        termMatches = row.querySelector('.warning') !== null
        break
      case 'error':
        termMatches = row.querySelector('.error') !== null
        break
      default:
        termMatches = (row.dataset.tags || '').split(' ').includes(customFilter[1].toLowerCase())
    }
  } else if (search) {
    const text = row.querySelector('p')?.textContent.toLowerCase() || ''
    termMatches = text.includes(search.toLowerCase())
  } else {
    termMatches = true
  }

  return invertFilter ? !termMatches : termMatches
}

/**
 * Applies search filter to a view
 * Terms separated by "," must all match, groups separated by "|" are alternatives
 * Example: "term1, term2 | term3" means (term1 AND term2) OR (term3)
 * @param {string} viewSelector - CSS selector for the view (e.g., '#pages')
 * @param {string} [searchTerm] - Optional search term. If not provided, uses the view's search input
 */
export function applySearchFilter(viewSelector, searchTerm) {
  const view = document.querySelector(viewSelector)
  if (!view) return

  const searchInput = view.querySelector('.searchbar input')
  const originalSearch = (searchTerm !== undefined ? searchTerm : searchInput?.value || '').trim()
  const orGroups = originalSearch.split('|')
    .map(group => group.split(',').map(term => term.trim()).filter(term => term.length > 0))
    .filter(group => group.length > 0)

  let visibleCount = 0
  view.querySelectorAll('.view-items .view-row').forEach(row => {
    const matches = orGroups.length === 0 || orGroups.some(andTerms => andTerms.every(term => rowMatchesTerm(row, term)))
    row.classList.toggle('hidden', !matches)
    if (matches) visibleCount++
  })

  // Show/hide "No items found" message
  const viewItems = view.querySelector('.view-items')
  let noItemsMsg = viewItems?.querySelector('.no-items-found')
  if (visibleCount === 0 && originalSearch) {
    if (!noItemsMsg) {
      noItemsMsg = document.createElement('div')
      noItemsMsg.className = 'no-items-found empty-row'
      noItemsMsg.textContent = 'No items found'
      viewItems.appendChild(noItemsMsg)
    }
  } else {
    noItemsMsg?.remove()
  }

  // Show the number of matching rows on the filter icon
  const filterIcon = view.querySelector('.filter-icon')
  if (!filterIcon) return
  let filterCount = filterIcon.querySelector('.filter-count')
  if (originalSearch) {
    if (!filterCount) {
      filterCount = document.createElement('span')
      filterCount.className = 'filter-count'
      filterIcon.appendChild(filterCount)
    }
    filterCount.textContent = visibleCount
  } else {
    filterCount?.remove()
  }
}

/**
 * Filters issues by a search string
 * Space separated terms must all match: severity:, type:, category:, page: filters or text, ! inverts a term
 * @param {Array} issues - Issues to filter
 * @param {string} filter - Search string
 * @returns {Array} Matching issues
 */
export function filterIssues(issues, filter = '') {
  filter = filter.toLowerCase().trim()
  if (!filter) return issues

  const tokens = filter.split(/\s+/)

  return issues.filter(issue => tokens.every(token => {
    const isNegation = token.startsWith('!')
    const searchTerm = isNegation ? token.substring(1) : token
    const separator = searchTerm.indexOf(':')
    const prefix = searchTerm.substring(0, separator)
    const value = separator > -1 ? searchTerm.substring(separator + 1) : undefined

    let matches
    if (value !== undefined && prefix === 'severity') matches = issue.severity === value
    else if (value !== undefined && prefix === 'type') matches = issue.type === value
    else if (value !== undefined && prefix === 'category') matches = issue.category === value
    else if (value !== undefined && prefix === 'page') matches = issue.location.toLowerCase().includes(value)
    else
      // Text search across message, element, location
      matches = [issue.message, issue.element, issue.location, issue.category].some(text => text.toLowerCase().includes(searchTerm))

    return isNegation ? !matches : matches
  }))
}
