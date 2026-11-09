/**
 * Creates an issue object
 * @param {string} type - Issue type: 'accessibility' | 'seo' | 'performance'
 * @param {string} severity - Severity: 'error' | 'warning' | 'info'
 * @param {string} category - Specific category (e.g., 'missing-alt', 'missing-title')
 * @param {string} message - Human-readable message
 * @param {string} element - CSS selector or element description
 * @param {string} elementFull - Full selector for title (optional)
 * @param {string} context - Extra context (optional)
 * @param {string} fragmentText - Visible text to use for text-fragment (optional)
 * @param {string} location - URL where found
 * @returns {Object} Issue object
 */
function createIssue(type, severity, category, message, element, elementFull, context, fragmentText, location) {
  return {
    type,
    severity,
    category,
    message,
    element,
    elementFull,
    context,
    fragmentText,
    location,
    timestamp: Date.now()
  }
}

/**
 * Detects accessibility and SEO issues in the document
 * @param {Document} doc - Parsed HTML document
 * @param {string} url - Page URL
 * @returns {Array} Array of detected issues
 */
export function detectIssues(doc, url) {
  const issues = []

  // === ACCESSIBILITY ISSUES ===

  // 1. Images without alt tags
  doc.querySelectorAll('img').forEach(img => {
    const alt = img.getAttribute('alt')
    const src = img.getAttribute('src') || img.getAttribute('data-src') || 'unknown'
    const fullElement = img.outerHTML
    const shortElement = `img[src="${src.substring(0, 50)}${src.length > 50 ? '...' : ''}"]`

    if (alt === null) {
      // Try to get nearby text for scroll-to-text
      const nearbyText = img.parentElement?.textContent?.trim().substring(0, 50) || ''
      issues.push(createIssue(
        'accessibility',
        'error',
        'missing-alt',
        'Image missing alt attribute',
        shortElement,
        fullElement,
        'alt: (missing)',
        nearbyText,
        url
      ))
    } else if (alt.trim() === '' && !img.hasAttribute('role')) {
      // Empty alt is valid for decorative images, but flag if no role attribute
      issues.push(createIssue(
        'accessibility',
        'warning',
        'empty-alt',
        'Image has empty alt text (ensure this is decorative)',
        shortElement,
        fullElement,
        'alt: (empty)',
        '',
        url
      ))
    }
  })

  // 2. Links without descriptive text
  doc.querySelectorAll('a').forEach(link => {
    const rawText = link.textContent.trim()
    const text = rawText.toLowerCase()
    const href = link.getAttribute('href') || ''
    const fullElement = link.outerHTML
    const shortElement = `a[href="${href.substring(0, 50)}${href.length > 50 ? '...' : ''}"]`

    const ariaLabel = link.getAttribute('aria-label') || ''
    const title = link.getAttribute('title') || ''
    const contextParts = []
    if (rawText) contextParts.push(`text: ${rawText}`)
    if (ariaLabel) contextParts.push(`aria-label: ${ariaLabel}`)
    if (title) contextParts.push(`title: ${title}`)
    const context = contextParts.length > 0 ? contextParts.join(' | ') : 'text: (empty)'

    if (!text || text.length === 0) {
      // Check if link has accessible text via aria-label, title, or img alt
      const hasAccessibleText = ariaLabel || title || link.querySelector('img[alt]')

      if (!hasAccessibleText) {
        // Try to get nearby text for scroll-to-text
        const nearbyText = link.parentElement?.textContent?.trim().substring(0, 50) || href.substring(0, 50)
        issues.push(createIssue(
          'accessibility',
          'warning',
          'empty-link-text',
          'Link has no text content or accessible label (add aria-label, title, or alt text)',
          shortElement,
          fullElement,
          context,
          nearbyText,
          url
        ))
      }
    } else if (['click here', 'here', 'read more', 'more', 'link'].includes(text)) {
      issues.push(createIssue(
        'accessibility',
        'info',
        'generic-link-text',
        `Link uses generic text: "${text}"`,
        shortElement,
        fullElement,
        context,
        rawText,
        url
      ))
    }
  })

  // 3. Form inputs without labels
  doc.querySelectorAll('input:not([type="hidden"], [type="submit"], [type="button"], [type="reset"], [type="image"]), textarea, select').forEach(input => {
    const id = input.getAttribute('id')
    const ariaLabel = input.getAttribute('aria-label')
    const ariaLabelledby = input.getAttribute('aria-labelledby')
    const type = input.tagName.toLowerCase()
    const inputType = input.getAttribute('type') || type

    // Check if there's an associated label
    let hasLabel = false
    if (id) {
      hasLabel = doc.querySelector(`label[for="${CSS.escape(id)}"]`) !== null
    }
    // Check if wrapped in label
    if (!hasLabel && input.closest('label')) {
      hasLabel = true
    }

    const name = input.getAttribute('name') || ''
    const placeholder = input.getAttribute('placeholder') || ''
    const inputContextParts = []
    if (id) inputContextParts.push(`id: ${id}`)
    if (name) inputContextParts.push(`name: ${name}`)
    if (placeholder) inputContextParts.push(`placeholder: ${placeholder}`)
    if (ariaLabel) inputContextParts.push(`aria-label: ${ariaLabel}`)
    const inputContext = inputContextParts.length > 0 ? inputContextParts.join(' | ') : ''

    if (!hasLabel && !ariaLabel && !ariaLabelledby) {
      // Use placeholder, name, id, or nearby text for scroll-to-text
      const nearbyText = placeholder || name || id || input.parentElement?.textContent?.trim().substring(0, 50) || ''
      issues.push(createIssue(
        'accessibility',
        'error',
        'missing-label',
        `Form ${type} element missing associated label or aria-label`,
        `${type}[type="${inputType}"]`,
        input.outerHTML,
        inputContext,
        nearbyText,
        url
      ))
    }
  })

  // === SEO ISSUES ===

  // 4. Missing or empty page title
  const titleEl = doc.querySelector('title')
  if (!titleEl) {
    issues.push(createIssue('seo', 'error', 'missing-title', 'Page is missing <title> tag', '<head>', '', '', '', url))
  } else if (titleEl.textContent.trim().length === 0) {
    issues.push(createIssue('seo', 'error', 'empty-title', 'Page <title> tag is empty', '<title>', '', '', '', url))
  } else if (titleEl.textContent.trim().length > 60) {
    const titleText = titleEl.textContent.trim()
    issues.push(createIssue(
      'seo',
      'warning',
      'long-title',
      `Page title is too long (recommend <60)`,
      `title | ${titleText.length} chars`,
      titleEl.outerHTML,
      titleText,
      titleText,
      url
    ))
  }

  // 5. Missing meta description
  const metaDesc = doc.querySelector('meta[name="description"]')
  if (!metaDesc) {
    issues.push(createIssue('seo', 'warning', 'missing-meta-description', 'Page is missing meta description', '<head>', '', '', '', url))
  } else {
    const content = metaDesc.getAttribute('content') || ''
    if (content.trim().length === 0) {
      issues.push(createIssue('seo', 'warning', 'empty-meta-description', 'Meta description is empty', 'meta[name="description"]', '', '', '', url))
    } else if (content.trim().length > 160) {
      const descText = content.trim()
      issues.push(createIssue(
        'seo',
        'info',
        'long-meta-description',
        `Meta description is too long (recommend <160)`,
        `meta name="description" | ${descText.length} chars`,
        metaDesc.outerHTML,
        descText,
        descText,
        url
      ))
    }
  }

  // 6. Multiple H1 tags
  const h1Tags = doc.querySelectorAll('h1')
  if (h1Tags.length === 0) {
    issues.push(createIssue('seo', 'warning', 'missing-h1', 'Page has no H1 heading', '<body>', '', '', '', url))
  } else if (h1Tags.length > 1) {
    // Create an issue for each H1 tag
    h1Tags.forEach((h1) => {
      const h1Text = h1.textContent?.trim() || ''
      issues.push(createIssue(
        'seo',
        'warning',
        'multiple-h1',
        `Multiple H1 tags found - recommend only 1 per page`,
        'h1',
        h1.outerHTML,
        h1Text,
        h1Text,
        url
      ))
    })
  }

  // 7. Heading hierarchy issues
  const headings = Array.from(doc.querySelectorAll('h1, h2, h3, h4, h5, h6'))
  let previousLevel = 0
  headings.forEach(heading => {
    const level = parseInt(heading.tagName.substring(1))
    if (previousLevel > 0 && level > previousLevel + 1) {
      const headingText = heading.textContent.trim()
      issues.push(createIssue(
        'accessibility',
        'warning',
        'heading-hierarchy',
        `Heading hierarchy skip: ${heading.tagName} follows H${previousLevel}`,
        heading.tagName.toLowerCase(),
        heading.outerHTML,
        headingText,
        headingText,
        url
      ))
    }
    previousLevel = level
  })

  return issues
}
