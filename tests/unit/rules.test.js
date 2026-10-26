import { describe, it, expect } from 'vitest'
import { parseRobotsTxt, getRobotsRules, isAllowedByRobots, parseSitemap, isExcluded } from '../../js/crawl/rules.js'

describe('robots.txt', () => {
  const robots = parseRobotsTxt(`
# Comment
User-agent: Googlebot
Disallow: /

User-agent: *
Disallow: /private/
Allow: /private/public-page
Disallow: /*.pdf$
Disallow: /search?

Sitemap: https://example.com/sitemap-pages.xml
`)
  const rules = getRobotsRules(robots)

  it('uses the * group when no group names the crawler', () => {
    expect(rules.map(rule => rule.path)).toEqual(['/private/', '/private/public-page', '/*.pdf$', '/search?'])
  })

  it('lets the longest matching rule win', () => {
    expect(isAllowedByRobots(rules, 'https://example.com/about')).toBe(true)
    expect(isAllowedByRobots(rules, 'https://example.com/private/data')).toBe(false)
    expect(isAllowedByRobots(rules, 'https://example.com/private/public-page')).toBe(true)
  })

  it('supports wildcards and end anchors', () => {
    expect(isAllowedByRobots(rules, 'https://example.com/files/report.pdf')).toBe(false)
    expect(isAllowedByRobots(rules, 'https://example.com/files/report.pdf.html')).toBe(true)
    expect(isAllowedByRobots(rules, 'https://example.com/search?q=1')).toBe(false)
    expect(isAllowedByRobots(rules, 'https://example.com/search')).toBe(true)
  })

  it('reads sitemaps', () => {
    expect(robots.sitemaps).toEqual(['https://example.com/sitemap-pages.xml'])
  })

  it('treats an empty Disallow as allowing everything', () => {
    const allowAll = getRobotsRules(parseRobotsTxt('User-agent: *\nDisallow:'))
    expect(isAllowedByRobots(allowAll, 'https://example.com/anything')).toBe(true)
  })

  it('uses groups naming the crawler over the * group', () => {
    const named = getRobotsRules(parseRobotsTxt('User-agent: *\nDisallow: /\n\nUser-agent: Site-Viewer\nDisallow: /admin'))
    expect(isAllowedByRobots(named, 'https://example.com/about')).toBe(true)
    expect(isAllowedByRobots(named, 'https://example.com/admin')).toBe(false)
  })
})

describe('parseSitemap', () => {
  it('reads page URLs', () => {
    const sitemap = parseSitemap(`<?xml version="1.0"?>
      <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <url><loc>https://example.com/</loc></url>
        <url><loc> https://example.com/about </loc></url>
      </urlset>`)
    expect(sitemap).toEqual({ isIndex: false, urls: ['https://example.com/', 'https://example.com/about'] })
  })

  it('recognizes sitemap indexes', () => {
    const sitemap = parseSitemap(`<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <sitemap><loc>https://example.com/sitemap-1.xml</loc></sitemap></sitemapindex>`)
    expect(sitemap).toEqual({ isIndex: true, urls: ['https://example.com/sitemap-1.xml'] })
  })

  it('returns nothing for invalid XML', () => {
    expect(parseSitemap('<html><body>Not found</body>').urls).toEqual([])
  })
})

describe('isExcluded', () => {
  it('matches patterns against the path and query', () => {
    const patterns = '/tag/*, *?page=*'
    expect(isExcluded('https://example.com/tag/news', patterns)).toBe(true)
    expect(isExcluded('https://example.com/blog?page=2', patterns)).toBe(true)
    expect(isExcluded('https://example.com/blog/tag/news', patterns)).toBe(false)
    expect(isExcluded('https://example.com/blog', patterns)).toBe(false)
    expect(isExcluded('https://example.com/blog', '')).toBe(false)
  })
})
