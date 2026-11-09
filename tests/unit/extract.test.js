import { describe, it, expect, beforeEach } from 'vitest'
import { extractPage, removeJSComments } from '../../js/crawl/extract.js'
import { detectIssues } from '../../js/crawl/issues.js'
import { setSite } from '../../js/state/site.js'

beforeEach(() => setSite('https://example.com/'))

describe('removeJSComments', () => {
  it('removes comments but keeps URLs in strings', () => {
    const script = `var a = "<a href='https://x.com/a'>A</a>"; // don't
/* block https://y.com */ var b = '//cdn.z.com/i.png'; var c = \`url(https://q.com/b.jpg)\`
x = 1 // trailing https://gone.com`
    const result = removeJSComments(script)
    expect(result).toContain("https://x.com/a")
    expect(result).toContain("//cdn.z.com/i.png")
    expect(result).toContain("https://q.com/b.jpg")
    expect(result).not.toContain('gone.com')
    expect(result).not.toContain('y.com')
  })
})

describe('extractPage', () => {
  const html = `<!doctype html><html><head><title>Home</title>
    <meta name="description" content="Welcome">
    <link rel="stylesheet" href="/css/site.css">
    <script src="/js/app.js"></script>
    <style>.hero { background-image: url('/img/hero.jpg') }</style>
  </head><body>
    <h1>Home</h1>
    <a href="/about">About</a>
    <a href="/about/" target="_blank">About again</a>
    <a href="https://other.com/">Other</a>
    <a href="javascript:void(0)">Nothing</a>
    <a href="\${isEnglish ? '/contact' : '/contact-fr'}">Template</a>
    <img src="/img/logo.png" alt="Logo">
    <img src="/img/logo.png">
    <div style="background: url(/img/inline.png)"></div>
    <iframe src="https://video.example.org/embed/1"></iframe>
    <script>var link = '<a href="https://example.com/from-script">Script link</a>'</script>
  </body></html>`

  it('resolves links against the crawled page and de-duplicates them', () => {
    const page = extractPage(html, 'https://example.com/', {})
    const hrefs = page.links.map(link => link.href)

    expect(hrefs).toContain('https://example.com/about')
    expect(hrefs).not.toContain('https://example.com/about/')
    expect(hrefs).toContain('https://other.com/')
    expect(hrefs).toContain('https://video.example.org/embed/1')
    expect(hrefs).toContain('https://example.com/from-script')
    expect(hrefs.some(href => href.startsWith('javascript:'))).toBe(false)
    expect(hrefs.some(href => href.includes('isEnglish'))).toBe(false)

    const about = page.links.find(link => link.href === 'https://example.com/about')
    expect(about.instances).toHaveLength(2)
    expect(about.instances[1].tags.isNewTab).toBe(true)
  })

  it('finds media, including background images', () => {
    const page = extractPage(html, 'https://example.com/', {})
    const sources = page.media.map(file => file.src)

    expect(sources).toEqual(expect.arrayContaining([
      'https://example.com/img/logo.png',
      'https://example.com/img/inline.png',
      'https://example.com/img/hero.jpg'
    ]))
    expect(page.media.find(file => file.src.endsWith('logo.png')).instances).toHaveLength(2)
  })

  it('skips <script> and <style> content when turned off', () => {
    const page = extractPage(html, 'https://example.com/', { onPageScripts: false, onPageStyles: false })
    expect(page.links.map(link => link.href)).not.toContain('https://example.com/from-script')
    expect(page.media.map(file => file.src)).not.toContain('https://example.com/img/hero.jpg')
  })

  it('finds stylesheets and scripts as assets', () => {
    const page = extractPage(html, 'https://example.com/', {})
    expect(page.assets.map(asset => asset.link)).toEqual([
      'https://example.com/css/site.css',
      'https://example.com/js/app.js'
    ])
  })

  it('reads the title and description', () => {
    const page = extractPage(html, 'https://example.com/', {})
    expect(page.title).toBe('Home')
    expect(page.description).toBe('Welcome')
  })

  it('respects the page\'s <base> element', () => {
    const page = extractPage('<base href="https://example.com/docs/"><a href="intro">Intro</a>', 'https://example.com/', {})
    expect(page.links[0].href).toBe('https://example.com/docs/intro')
  })

  it('finds background images in crawled stylesheets without reporting page issues', () => {
    const page = extractPage('.a { background: url("../img/bg.png") }', 'https://example.com/css/site.css', {})
    expect(page.media.map(file => file.src)).toEqual(['https://example.com/img/bg.png'])
    expect(page.issues).toEqual([])
  })
})

describe('detectIssues', () => {
  const parse = html => new DOMParser().parseFromString(html, 'text/html')

  it('handles label ids with special characters', () => {
    const doc = parse('<title>t</title><label for="a&quot;b">Name</label><input id="a&quot;b">')
    const issues = detectIssues(doc, 'https://example.com/')
    expect(issues.some(issue => issue.category === 'missing-label')).toBe(false)
  })

  it('checks inputs without a type, but not hidden inputs or buttons', () => {
    const doc = parse('<title>t</title><input name="q"><input type="hidden" name="h"><input type="submit">')
    const labelIssues = detectIssues(doc, 'https://example.com/').filter(issue => issue.category === 'missing-label')
    expect(labelIssues).toHaveLength(1)
    expect(labelIssues[0].context).toContain('name: q')
  })

  it('reports SEO issues', () => {
    const categories = detectIssues(parse('<h1>One</h1><h1>Two</h1><h4>Skip</h4>'), 'https://example.com/').map(issue => issue.category)
    expect(categories).toEqual(expect.arrayContaining(['missing-title', 'missing-meta-description', 'multiple-h1', 'heading-hierarchy']))
  })
})
