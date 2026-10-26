import { describe, it, expect, beforeEach } from 'vitest'
import {
  getUrlExtension, isUrlHTMLFile, normalizeUrl, isUrlTemplate, isUrlLocal, isUrlAnchor, getUrlCategories,
  getDownloadFilename
} from '../../js/lib/url.js'
import { setSite } from '../../js/state/site.js'

beforeEach(() => setSite('https://example.com/start'))

describe('getUrlExtension', () => {
  it('ignores the query, hash and host', () => {
    expect(getUrlExtension('https://example.com/a/file.PDF?x=1#top')).toBe('pdf')
    expect(getUrlExtension('https://cdn.example.com/')).toBe('')
    expect(getUrlExtension('https://example.com/.hidden')).toBe('')
  })
})

describe('isUrlHTMLFile', () => {
  it('treats extensionless and page extensions as pages', () => {
    expect(isUrlHTMLFile('https://example.com/about')).toBe(true)
    expect(isUrlHTMLFile('https://example.com/index.php')).toBe(true)
    expect(isUrlHTMLFile('https://example.com/post.v2-final')).toBe(true)
  })

  it('treats known file types as not pages', () => {
    expect(isUrlHTMLFile('https://example.com/style.css')).toBe(false)
    expect(isUrlHTMLFile('https://example.com/report.pdf')).toBe(false)
    expect(isUrlHTMLFile('https://example.com/photo.webp')).toBe(false)
  })

  it('rejects relative URLs', () => {
    expect(isUrlHTMLFile('/about')).toBe(false)
  })
})

describe('normalizeUrl', () => {
  it('removes trailing slashes except on the root', () => {
    expect(normalizeUrl('https://example.com/about/')).toBe('https://example.com/about')
    expect(normalizeUrl('https://example.com/')).toBe('https://example.com/')
  })
})

describe('isUrlTemplate', () => {
  it('detects unrendered template code', () => {
    expect(isUrlTemplate("${isEnglish ? '/contact' : '/contact-fr'}")).toBe(true)
    expect(isUrlTemplate("' + postLink + '")).toBe(true)
    expect(isUrlTemplate('{{ url }}')).toBe(true)
    expect(isUrlTemplate('/contact')).toBe(false)
  })
})

describe('isUrlLocal and isUrlAnchor', () => {
  it('compares against the crawled site', () => {
    expect(isUrlLocal('https://example.com/about')).toBe(true)
    expect(isUrlLocal('https://other.com/about')).toBe(false)
    expect(isUrlLocal('mailto:hi@example.com')).toBe(false)
    expect(isUrlAnchor('https://example.com/about#team')).toBe(true)
    expect(isUrlAnchor('https://other.com/about#team')).toBe(false)
  })
})

describe('getUrlCategories', () => {
  it('sorts links into views', () => {
    expect(getUrlCategories('https://example.com/about')).toEqual({ isPage: true, isLink: false, isFile: false })
    expect(getUrlCategories('https://other.com/')).toEqual({ isPage: false, isLink: true, isFile: false })
    expect(getUrlCategories('https://example.com/report.pdf')).toEqual({ isPage: false, isLink: false, isFile: true })
    expect(getUrlCategories('mailto:hi@example.com')).toEqual({ isPage: false, isLink: true, isFile: false })
    expect(getUrlCategories('https://example.com/about', true)).toEqual({ isPage: false, isLink: true, isFile: false })
  })
})

describe('getDownloadFilename', () => {
  it('names files after their path', () => {
    expect(getDownloadFilename('https://example.com/')).toBe('index.html')
    expect(getDownloadFilename('https://example.com/blog/post')).toBe('blog__post.html')
    expect(getDownloadFilename('https://example.com/files/a b.pdf', 'site/')).toBe('site/files__a_20b.pdf')
  })
})
