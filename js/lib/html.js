/**
 * Escapes a value for safe insertion into HTML text or attributes
 * @param {*} value - The value to escape
 * @returns {string} Escaped string ('' for null/undefined)
 */
export const escapeHtml = (value) => {
  if (value === null || value === undefined) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export const escapeAttr = escapeHtml

/**
 * Creates an HTML element from a string
 * @param {string} htmlString - HTML string to convert
 * @returns {HTMLElement} The created HTML element
 */
export function createElementFromHTML(htmlString) {
  const template = document.createElement('template')
  template.innerHTML = htmlString.trim()
  return template.content.firstChild
}

/**
 * Renders HTML into a container, or an empty message if there is no HTML
 * @param {HTMLElement} container - Target container element
 * @param {string} htmlString - HTML string to render
 * @param {string} emptyText - Message to show when there's nothing to render
 */
export function renderToContainer(container, htmlString, emptyText = 'There are no items here.') {
  if (!htmlString || htmlString.length === 0) {
    container.innerHTML = `<div class="empty-row">${escapeHtml(emptyText)}</div>`
    return
  }

  const template = document.createElement('template')
  template.innerHTML = htmlString.trim()
  container.replaceChildren(template.content)
}

/**
 * Debounces function calls to avoid excessive invocations
 * @param {Function} fn - The function to debounce
 * @param {number} ms - Delay in milliseconds
 * @returns {Function} Debounced function
 */
export function debounce(fn, ms) {
  let timer = 0
  return function (...args) {
    clearTimeout(timer)
    timer = setTimeout(fn.bind(this, ...args), ms || 0)
  }
}
