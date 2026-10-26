import { describe, it, expect } from 'vitest'
import { buildRowTags } from '../../js/views/rows.js'

describe('buildRowTags', () => {
  it('lists tags from the item and where it was found', () => {
    const file = {
      tags: { isLocal: true },
      instances: [
        { tags: { isSrcset: true } },
        { tags: { isInSitemap: true, isInline: true, cssProperty: 'mask-image' } }
      ]
    }
    expect(buildRowTags(file, ['image']).split(' ').sort()).toEqual(['image', 'inline', 'local', 'sitemap', 'srcset'])
  })

  it('includes the element tag and crawl results', () => {
    const link = { tags: { tag: 'IFRAME' }, instances: [], isDuplicate: true, redirectsTo: 'https://example.com/', skipReason: 'robots' }
    expect(buildRowTags(link).split(' ').sort()).toEqual(['duplicate', 'iframe', 'redirect', 'skipped'])
  })

  it('leaves out false tags', () => {
    expect(buildRowTags({ tags: { isNewTab: false }, instances: [{ tags: { isNewTab: undefined } }] })).toBe('')
  })
})
