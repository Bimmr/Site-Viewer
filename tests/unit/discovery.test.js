import { describe, it, expect, beforeEach } from 'vitest'
import { extractPage, parseSrcset, getCssUrls } from '../../js/crawl/extract.js'
import { setSite } from '../../js/state/site.js'

beforeEach(() => setSite('https://example.com/'))

describe('parseSrcset', () => {
  it('reads URLs with and without descriptors', () => {
    expect(parseSrcset('a.jpg 1x, b.jpg 2x')).toEqual(['a.jpg', 'b.jpg'])
    expect(parseSrcset('small.jpg 480w,large.jpg 1080w')).toEqual(['small.jpg', 'large.jpg'])
    expect(parseSrcset('only.jpg')).toEqual(['only.jpg'])
    // A comma without a space after it is part of the URL, as in the HTML spec
    expect(parseSrcset('a.jpg,b.jpg 2x')).toEqual(['a.jpg,b.jpg'])
    expect(parseSrcset('a.jpg, b.jpg 2x')).toEqual(['a.jpg', 'b.jpg'])
    expect(parseSrcset('/img?w=200,h=100 200w, /img?w=400,h=200 400w')).toEqual(['/img?w=200,h=100', '/img?w=400,h=200'])
    expect(parseSrcset('')).toEqual([])
  })
})

describe('getCssUrls', () => {
  it('finds url() values with their property, and @imports', () => {
    const css = `@import url("base.css"); @import 'theme.css';
      .a { background: #fff url(bg.png) no-repeat }
      .b { mask-image: url('mask.svg') }
      @font-face { font-family: X; src: url(font.woff2) format("woff2") }
      .c { fill: url(#gradient) } .d { background: url(data:image/png;base64,AAA) }`
    expect(getCssUrls(css)).toEqual([
      { url: 'base.css', property: null, isImport: true },
      { url: 'theme.css', property: null, isImport: true },
      { url: 'bg.png', property: 'background', isImport: false },
      { url: 'mask.svg', property: 'mask-image', isImport: false },
      { url: 'font.woff2', property: 'src', isImport: false }
    ])
  })
})

describe('extractPage media and asset discovery', () => {
  const html = `<!doctype html><html><head><title>Media</title>
    <link rel="icon" href="/favicon.ico">
    <link rel="apple-touch-icon" href="/touch.png">
    <link rel="manifest" href="/site.webmanifest">
    <link rel="preload" href="/fonts/main.woff2" as="font" crossorigin>
    <link rel="preload" as="image" href="/img/lcp.jpg" imagesrcset="/img/lcp-2x.jpg 2x">
    <link rel="modulepreload" href="/js/module.js">
    <meta property="og:image" content="https://example.com/img/share.png">
    <meta name="twitter:image" content="/img/tweet">
    <style>
      @import url("/css/extra.css");
      @font-face { font-family: Body; src: url("/fonts/body.woff2") format("woff2") }
      .mask { mask-image: url(/img/mask.svg) }
    </style>
  </head><body>
    <img src="/img/a.jpg" srcset="/img/a.jpg 1x, /img/a-2x.jpg 2x" alt="A">
    <img src="data:image/gif;base64,R0lGOD" data-src="/img/lazy.jpg" data-srcset="/img/lazy-2x.jpg 2x" alt="Lazy">
    <img src="/cdn/photo?id=7" alt="No extension">
    <picture>
      <source srcset="/img/hero.avif" type="image/avif">
      <source srcset="/img/hero.webp 1x, /img/hero-2x.webp 2x" type="image/webp">
      <img src="/img/hero.jpg" alt="Hero">
    </picture>
    <video src="/media/intro.mp4" poster="/img/poster.jpg"></video>
    <video><source src="/media/clip.webm"><source src="/media/clip.mp4"></video>
    <audio src="/media/sound.mp3"></audio>
    <svg><image href="/img/in-svg.png"></image></svg>
    <input type="image" src="/img/submit.png" alt="Submit">
    <object data="/files/brochure.pdf"></object>
    <embed src="/files/map.pdf">
    <div style="background-image: url('/img/inline.webp')"></div>
  </body></html>`

  const page = () => extractPage(html, 'https://example.com/', {})
  const mediaBySrc = () => Object.fromEntries(page().media.map(file => [file.src.replace('https://example.com', ''), file]))
  const assetsByLink = () => Object.fromEntries(page().assets.map(asset => [asset.link.replace('https://example.com', ''), asset]))

  it('finds srcset, lazy-loaded and <picture> images', () => {
    const media = mediaBySrc()
    for (const src of ['/img/a.jpg', '/img/a-2x.jpg', '/img/lazy.jpg', '/img/lazy-2x.jpg', '/img/hero.jpg', '/img/hero.avif', '/img/hero.webp', '/img/hero-2x.webp'])
      expect(media[src], src).toBeDefined()
    expect(media['/img/a.jpg'].instances).toHaveLength(2)
    expect(media['/img/a-2x.jpg'].instances[0]).toMatchObject({ alt: 'A', tags: { isSrcset: true } })
    expect(media['/img/lazy.jpg'].instances[0].tags.isLazy).toBe(true)
    expect(media['/img/hero.webp'].instances[0]).toMatchObject({ alt: 'Hero', tags: { isPictureSource: true } })
  })

  it('skips lazy-loading placeholders', () => {
    expect(page().media.some(file => file.src.startsWith('data:'))).toBe(false)
  })

  it('keeps images without an extension, marked as images', () => {
    const media = mediaBySrc()
    expect(media['/cdn/photo?id=7'].kind).toBe('image')
    expect(media['/img/tweet'].kind).toBe('image')
  })

  it('finds icons, social images and preloaded images', () => {
    const media = mediaBySrc()
    expect(media['/favicon.ico'].instances[0].tags.isIcon).toBe(true)
    expect(media['/touch.png'].instances[0].tags.isIcon).toBe(true)
    expect(media['/img/share.png'].instances[0].tags.isSocialImage).toBe(true)
    expect(media['/img/lcp.jpg'].instances[0].tags.isPreload).toBe(true)
    expect(media['/img/lcp-2x.jpg']).toBeDefined()
  })

  it('finds every video and audio source, and posters', () => {
    const media = mediaBySrc()
    expect(media['/media/intro.mp4'].kind).toBe('video')
    expect(media['/media/clip.webm'].kind).toBe('video')
    expect(media['/media/clip.mp4'].kind).toBe('video')
    expect(media['/media/sound.mp3'].kind).toBe('audio')
    expect(media['/img/poster.jpg'].instances[0].tags.isPoster).toBe(true)
  })

  it('finds SVG and input images', () => {
    const media = mediaBySrc()
    expect(media['/img/in-svg.png'].instances[0].tags.isInSvg).toBe(true)
    expect(media['/img/submit.png']).toBeDefined()
  })

  it('finds images in any CSS property', () => {
    const media = mediaBySrc()
    expect(media['/img/inline.webp'].instances[0].tags).toMatchObject({ isInline: true, isBackground: true })
    expect(media['/img/mask.svg'].instances[0].tags).toMatchObject({ isInStyleTag: true, cssProperty: 'mask-image' })
  })

  it('finds fonts, imports, preloads and manifests as assets', () => {
    const assets = assetsByLink()
    expect(assets['/fonts/main.woff2'].tags.isFont).toBe(true)
    expect(assets['/fonts/main.woff2'].instances[0].tags.isPreload).toBe(true)
    expect(assets['/fonts/body.woff2'].instances[0].tags.isInStyleTag).toBe(true)
    expect(assets['/css/extra.css'].instances[0].tags.isImport).toBe(true)
    expect(assets['/js/module.js'].tags.isScript).toBe(true)
    expect(assets['/site.webmanifest'].instances[0].tags.isManifest).toBe(true)
  })

  it('finds embedded documents as links', () => {
    const hrefs = page().links.map(link => link.href)
    expect(hrefs).toContain('https://example.com/files/brochure.pdf')
    expect(hrefs).toContain('https://example.com/files/map.pdf')
  })

  it('resolves stylesheet URLs against the stylesheet', () => {
    const css = extractPage('@font-face { src: url(../fonts/a.woff) } .x { background: url(../img/b.png) }', 'https://example.com/css/site.css', {})
    expect(css.assets.map(asset => asset.link)).toEqual(['https://example.com/fonts/a.woff'])
    expect(css.media.map(file => file.src)).toEqual(['https://example.com/img/b.png'])
  })
})
