/**
 * Rules deciding which pages Crawl All visits: robots.txt, sitemaps and exclude patterns
 */

/**
 * Parses a robots.txt file
 * @param {string} text - robots.txt content
 * @returns {{groups: Array<{agents: string[], rules: Array<{allow: boolean, path: string}>}>, sitemaps: string[]}}
 */
export function parseRobotsTxt(text) {
  const groups = []
  const sitemaps = []
  let current = null
  let lastWasAgent = false

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim()
    const separator = line.indexOf(':')
    if (separator === -1) continue

    const field = line.substring(0, separator).trim().toLowerCase()
    const value = line.substring(separator + 1).trim()

    if (field === 'user-agent') {
      // Consecutive user-agent lines share one group of rules
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] }
        groups.push(current)
      }
      current.agents.push(value.toLowerCase())
      lastWasAgent = true
      continue
    }
    lastWasAgent = false

    if (field === 'sitemap' && value)
      sitemaps.push(value)
    else if (current && (field === 'allow' || field === 'disallow'))
      current.rules.push({ allow: field === 'allow', path: value })
  }

  return { groups, sitemaps }
}

/**
 * Gets the rules that apply to a crawler
 * Uses the groups naming the crawler, or the * groups if none do
 * @param {Object} robots - Parsed robots.txt
 * @param {string} agent - Crawler name
 * @returns {Array<{allow: boolean, path: string}>} Rules
 */
export function getRobotsRules(robots, agent = 'site-viewer') {
  const named = robots.groups.filter(group => group.agents.some(name => name !== '*' && agent.toLowerCase().includes(name)))
  const groups = named.length > 0 ? named : robots.groups.filter(group => group.agents.includes('*'))
  return groups.flatMap(group => group.rules)
}

/**
 * Checks if a rule's path pattern matches a path, supporting * wildcards and a $ end anchor
 * @param {string} pattern - Rule path
 * @param {string} path - URL path and query
 * @returns {boolean}
 */
function matchesRule(pattern, path) {
  const anchored = pattern.endsWith('$')
  const body = anchored ? pattern.slice(0, -1) : pattern
  const regex = body.split('*').map(part => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')
  return new RegExp('^' + regex + (anchored ? '$' : '')).test(path)
}

/**
 * Checks if robots.txt rules allow crawling a URL
 * The longest matching rule wins, and allow wins ties
 * @param {Array} rules - Rules from getRobotsRules
 * @param {string} url - URL to check
 * @returns {boolean}
 */
export function isAllowedByRobots(rules, url) {
  const { pathname, search } = new URL(url)
  const path = decodeURIComponent(pathname) + search

  let best = null
  for (const rule of rules) {
    // An empty Disallow allows everything
    if (!rule.path) continue
    if (!matchesRule(rule.path, path) && !matchesRule(rule.path, pathname + search)) continue
    if (!best || rule.path.length > best.path.length || (rule.path.length === best.path.length && rule.allow))
      best = rule
  }
  return !best || best.allow
}

/**
 * Parses a sitemap
 * @param {string} xml - Sitemap XML
 * @returns {{isIndex: boolean, urls: string[]}} Whether it's a sitemap index, and the URLs it lists
 */
export function parseSitemap(xml) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.querySelector('parsererror')) return { isIndex: false, urls: [] }

  const isIndex = doc.documentElement.localName === 'sitemapindex'
  const urls = Array.from(doc.getElementsByTagNameNS('*', 'loc'))
    .map(loc => loc.textContent.trim())
    .filter(Boolean)
  return { isIndex, urls }
}

/**
 * Checks if a URL matches any of the exclude patterns from settings
 * @param {string} url - URL to check
 * @param {string} patterns - Comma separated patterns, * matches anything, matched against the path and query
 * @returns {boolean}
 */
export function isExcluded(url, patterns) {
  if (!patterns || !patterns.trim()) return false
  const { pathname, search } = new URL(url)
  const path = pathname + search
  return patterns.split(',').map(pattern => pattern.trim()).filter(Boolean).some(pattern => {
    const regex = pattern.split('*').map(part => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')
    // Patterns starting with / match from the start of the path, others anywhere in it
    return new RegExp((pattern.startsWith('/') ? '^' : '') + regex).test(path)
  })
}
