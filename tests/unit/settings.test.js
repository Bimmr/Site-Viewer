import { describe, it, expect } from 'vitest'
import { mergeSettings, DEFAULT_SETTINGS } from '../../js/settings.js'

describe('mergeSettings', () => {
  it('uses the defaults when nothing is stored', () => {
    expect(mergeSettings(null)).toEqual(JSON.parse(JSON.stringify(DEFAULT_SETTINGS)))
  })

  it('keeps stored values of the right type and drops the rest', () => {
    const merged = mergeSettings({
      crawl: { rateLimitMs: 250, maxPages: 'lots', unknown: true },
      download: { directory: 'site/' }
    })
    expect(merged.crawl.rateLimitMs).toBe(250)
    expect(merged.crawl.maxPages).toBe(DEFAULT_SETTINGS.crawl.maxPages)
    expect(merged.crawl.unknown).toBeUndefined()
    expect(merged.download.directory).toBe('site/')
  })

  it('migrates the old liveCrawling setting', () => {
    expect(mergeSettings({ crawl: { liveCrawling: true } }).crawl.crawlMode).toBe('live')
    expect(mergeSettings({ crawl: { liveCrawling: true, crawlMode: 'fetch' } }).crawl.crawlMode).toBe('fetch')
  })
})
