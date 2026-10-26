import { describe, it, expect, beforeEach, vi } from 'vitest'
import { store } from '../../js/state/store.js'
import { setSite } from '../../js/state/site.js'
import { extractPage, createLinkObject } from '../../js/crawl/extract.js'
import { HttpStatusError } from '../../js/crawl/network.js'

const home = `<title>Home</title>
  <a href="/about">About</a><a href="/blog">Blog</a><a href="/report.pdf">Report</a>
  <a href="https://other.com/">Other</a><img src="/logo.png" alt="Logo">`
const about = `<title>About</title><a href="/">Home</a><a href="/team/">Team</a><img src="/logo.png" alt="Logo">`

const addStartPage = () => {
  const element = document.createElement('a')
  element.href = 'https://example.com/'
  store.addDiscoveredLink(createLinkObject('https://example.com/', element), 0)
}

const crawl = (url, html) => store.addPage(url, extractPage(html, url, {}))

beforeEach(() => {
  setSite('https://example.com/')
  store.reset()
  addStartPage()
})

describe('store', () => {
  it('merges what is found across pages', () => {
    crawl('https://example.com/', home)
    crawl('https://example.com/about', about)

    expect(store.getPages().map(link => link.href)).toEqual(expect.arrayContaining([
      'https://example.com/', 'https://example.com/about', 'https://example.com/blog', 'https://example.com/team/'
    ]))
    expect(store.getFiles().map(link => link.href)).toEqual(['https://example.com/report.pdf'])
    expect(store.getLinks().map(link => link.href)).toEqual(['https://other.com/'])
    expect(store.getMedia()).toHaveLength(1)
    expect(store.getMedia()[0].instances).toHaveLength(2)
  })

  it('tracks how many clicks each page is from the start page', () => {
    crawl('https://example.com/', home)
    crawl('https://example.com/about', about)

    expect(store.getLink('https://example.com/').depth).toBe(0)
    expect(store.getLink('https://example.com/about').depth).toBe(1)
    expect(store.getLink('https://example.com/team').depth).toBe(2)
  })

  it('marks crawl results', () => {
    crawl('https://example.com/', home)
    store.markCrawling('https://example.com/about')
    expect(store.getLink('https://example.com/about')).toMatchObject({ isCrawled: true, isCrawling: true })

    store.markFailed('https://example.com/about', new HttpStatusError(404))
    expect(store.getLink('https://example.com/about')).toMatchObject({ isWarning: true, statusCode: 404 })

    store.markFailed('https://example.com/blog', new Error('Network error'))
    expect(store.getLink('https://example.com/blog').isError).toBe(true)

    store.markCrawling('https://example.com/blog')
    store.markCancelled('https://example.com/blog')
    expect(store.getLink('https://example.com/blog').isCrawled).toBe(false)
  })

  it('clears failure flags when a retry succeeds', () => {
    crawl('https://example.com/', home)
    store.markFailed('https://example.com/about', new HttpStatusError(500))
    crawl('https://example.com/about', about)
    expect(store.getLink('https://example.com/about').isWarning).toBeUndefined()
    expect(store.getLink('https://example.com/about').isCrawled).toBe(true)
  })

  it('detects duplicate pages', () => {
    crawl('https://example.com/', home)
    crawl('https://example.com/about', about)
    crawl('https://example.com/blog', about.replace('About', 'About'))

    expect(store.getLink('https://example.com/blog')).toMatchObject({ isDuplicate: true, duplicateOf: 'https://example.com/about' })
    expect(store.getDuplicateUrls()).toEqual(new Set(['https://example.com/blog']))
  })

  it('removes a page\'s data but keeps the page', () => {
    crawl('https://example.com/', home)
    crawl('https://example.com/about', about)
    store.removePage('https://example.com/about')

    expect(store.getPage('https://example.com/about')).toBeUndefined()
    expect(store.getLink('https://example.com/about').isCrawled).toBe(false)
    // Only found on the removed page
    expect(store.getLink('https://example.com/team')).toBeUndefined()
    expect(store.getMedia()[0].instances).toHaveLength(1)
    expect(store.issues.every(issue => issue.location !== 'https://example.com/about')).toBe(true)
  })

  it('notifies listeners with the collections that changed', () => {
    const listener = vi.fn()
    const unsubscribe = store.onChange(listener)
    store.markCrawling('https://example.com/')
    unsubscribe()

    expect(listener).toHaveBeenCalledWith(['links'])
  })

  it('keeps version numbers increasing through resets', () => {
    const before = store.versions.links
    store.reset()
    expect(store.versions.links).toBeGreaterThan(before)
  })
})
