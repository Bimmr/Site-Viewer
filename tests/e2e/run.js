/**
 * End-to-end test: loads the extension in Chrome for Testing and crawls a local test site
 * Run with: npm run test:e2e   (set HEADFUL=1 to watch it)
 */
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer'

const extensionPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

// === Test site ===

const page = (title, body) => `<!doctype html><html lang="en"><head><title>${title}</title>
  <meta name="description" content="${title} page"></head><body><h1>${title}</h1>${body}</body></html>`

let origin = ''
const routes = {
  '/': () => page('Home', `
    <a href="/about">About</a>
    <a href="/blog/">Blog</a>
    <a href="/missing">Missing</a>
    <a href="/private/secret">Secret</a>
    <a href="/app">App</a>
    <a href="/files/report.pdf">Report</a>
    <a href="https://example.org/">External</a>
    <a href="mailto:hi@example.org">Email</a>
    <img src="/img/logo.png" alt="Logo">`),
  '/about': () => page('About', '<a href="/">Home</a><a href="/team">Team</a><img src="/img/logo.png" alt="Logo">'),
  '/team': () => page('Team', '<a href="/about">About</a>'),
  '/blog/': () => page('Blog', '<a href="/blog/post-1">Post 1</a>'),
  '/blog/post-1': () => page('Post 1', '<a href="/blog/">Blog</a>'),
  '/private/secret': () => page('Secret', ''),
  '/orphan': () => page('Orphan', '<p>Only linked from the sitemap</p>'),
  // Client-side rendered, so smart mode should crawl it in a tab
  '/app': () => `<!doctype html><html><head><title>App</title></head><body><div id="root"></div>
    <script>document.getElementById('root').innerHTML = '<h1>App</h1><a href="/app/rendered">Rendered by JavaScript</a>'</script>
    </body></html>`,
  '/app/rendered': () => page('Rendered', ''),
  // 1x1 transparent PNG
  '/img/logo.png': () => Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64'),
  '/robots.txt': () => `User-agent: *\nDisallow: /private/\nSitemap: ${origin}/sitemap.xml\n`,
  '/sitemap.xml': () => `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    <url><loc>${origin}/</loc></url><url><loc>${origin}/orphan</loc></url></urlset>`
}

const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, origin).pathname
  const route = routes[pathname]
  if (!route) {
    res.writeHead(404, { 'Content-Type': 'text/html' })
    return res.end(page('Not found', ''))
  }
  const types = { txt: 'text/plain', xml: 'application/xml', png: 'image/png' }
  const type = types[pathname.split('.').pop()] || 'text/html'
  res.writeHead(200, { 'Content-Type': type })
  res.end(req.method === 'HEAD' ? undefined : route())
})

// === Helpers ===

let failures = 0
function check(name, condition, details = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${!condition && details ? `\n      ${details}` : ''}`)
  if (!condition) failures++
}

/**
 * Reads the Pages view rows
 * @returns {Promise<Array<{url: string, status: string, title: string}>>}
 */
const getPageRows = viewer => viewer.$$eval('#pages .view-row[data-url]', rows => rows.map(row => {
  const status = row.querySelector('.inspect') ? 'crawled'
    : row.querySelector('.crawling') ? 'crawling'
    : row.querySelector('.warning') ? 'warning'
    : row.querySelector('.error') ? 'error'
    : row.querySelector('.duplicate') ? 'duplicate'
    : 'uncrawled'
  const statusIcon = row.querySelector('.tools > a:nth-of-type(3)')
  return { url: row.dataset.url, status, title: statusIcon?.title || '' }
}))

/**
 * Waits for a file to appear in the download folder
 * @param {string} name - File name
 * @returns {Promise<string[]>} Files in the download folder
 */
const waitForDownload = name => new Promise(resolve => {
  const started = Date.now()
  const poll = setInterval(() => {
    const files = fs.readdirSync(downloadDir).filter(file => !file.endsWith('.crdownload'))
    if (files.includes(name) || Date.now() - started > 10000) {
      clearInterval(poll)
      resolve(files)
    }
  }, 200)
})

/**
 * Switches the viewer to a view and waits for its slide-in animation
 * @param {Page} viewer - Viewer page
 * @param {string} viewId - View to show
 */
async function showView(viewer, viewId) {
  await viewer.click(`.sidebar-item[data-view="${viewId}"]`)
  await new Promise(resolve => setTimeout(resolve, 600))
}

async function openViewer(browser, extensionId, settings) {
  const viewer = await browser.newPage()
  const errors = []
  viewer.on('pageerror', error => errors.push(error.message))
  viewer.on('console', message => {
    // Chrome logs every failed request, like the test site's intentional 404, which aren't errors in the viewer
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource')) errors.push(message.text())
  })
  viewer.on('dialog', dialog => dialog.accept())

  // Settings are read when the viewer starts, so store them first
  await viewer.goto(`chrome-extension://${extensionId}/setup/options.html`)
  await viewer.evaluate(settings => chrome.storage.local.set({ settings }), settings)

  await viewer.goto(`chrome-extension://${extensionId}/viewer.html?url=${encodeURIComponent(origin + '/')}`)
  return { viewer, errors }
}

// === Run ===

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
origin = `http://127.0.0.1:${server.address().port}`
const downloadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-viewer-e2e-'))

// A temporary profile that saves downloads to a temporary folder without asking
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-viewer-e2e-profile-'))
fs.mkdirSync(path.join(userDataDir, 'Default'))
fs.writeFileSync(path.join(userDataDir, 'Default', 'Preferences'), JSON.stringify({
  download: { default_directory: downloadDir, prompt_for_download: false }
}))

const browser = await puppeteer.launch({
  headless: !process.env.HEADFUL,
  userDataDir,
  args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`]
})

try {
  const workerTarget = await browser.waitForTarget(target => target.type() === 'service_worker' && target.url().endsWith('/setup/background.js'))
  const extensionId = new URL(workerTarget.url()).host
  check('background worker starts', !!extensionId)

  const settings = {
    crawl: { crawlMode: 'smart', liveWaitTime: 1000, rateLimitMs: 20, maxPages: 500, maxDepth: 0, respectRobots: true, useSitemap: true },
    download: { directory: '' }
  }
  const { viewer, errors } = await openViewer(browser, extensionId, settings)

  // Initial crawl
  await viewer.waitForFunction(url => document.querySelector(`#pages .view-row[data-url="${url}"] .inspect`), { timeout: 30000 }, origin + '/')
  let rows = await getPageRows(viewer)
  check('start page is crawled', rows.some(row => row.url === origin + '/' && row.status === 'crawled'))
  check('links on the start page are listed', ['/about', '/blog/', '/app'].every(p => rows.some(row => row.url === origin + p)),
    JSON.stringify(rows.map(row => row.url)))
  check('external and mailto links are in Links', await viewer.$$eval('#links .view-row[data-url]', rows => rows.map(row => row.dataset.url))
    .then(urls => urls.includes('https://example.org/') && urls.includes('mailto:hi@example.org')))
  check('PDF is in Files', await viewer.$eval('#files .view-items', element => element.textContent.includes('report.pdf')))

  // Crawl All
  await viewer.click('.crawlAllBtn')
  await viewer.waitForFunction(() => document.querySelector('.crawlAllBtn').classList.contains('stop-crawling'), { timeout: 5000 })
  check('Crawl All shows a progress bar', await viewer.$eval('.crawl-progress', element => !element.classList.contains('hidden')))
  await viewer.waitForFunction(() => !document.querySelector('.crawlAllBtn').classList.contains('stop-crawling'), { timeout: 90000 })
  // Let the batched render finish
  await new Promise(resolve => setTimeout(resolve, 600))

  rows = await getPageRows(viewer)
  const statusOf = pathname => rows.find(row => row.url === origin + pathname)?.status
  const crawled = ['/', '/about', '/team', '/blog/', '/blog/post-1', '/app']
  check('Crawl All crawls every linked page', crawled.every(p => statusOf(p) === 'crawled'),
    JSON.stringify(rows.map(row => `${row.url.replace(origin, '')}=${row.status}`)))
  check('pages from the sitemap are crawled', statusOf('/orphan') === 'crawled', `orphan=${statusOf('/orphan')}`)
  check('client-side rendered links are found with live crawling', statusOf('/app/rendered') === 'crawled', `rendered=${statusOf('/app/rendered')}`)
  check('a 404 is a warning', statusOf('/missing') === 'warning', `missing=${statusOf('/missing')}`)
  const secret = rows.find(row => row.url === origin + '/private/secret')
  check('robots.txt blocked pages are skipped with a reason', secret?.status === 'uncrawled' && secret.title.includes('robots.txt'), JSON.stringify(secret))

  const summary = await viewer.$$eval('.toast-notification', toasts => toasts.map(toast => toast.textContent.trim()).join(' | '))
  check('a summary is shown when Crawl All finishes', /Crawl finished: \d+ pages crawled/.test(summary), summary)

  const badge = await viewer.$eval('.sidebar-item[data-view="pages"] .count-badge', element => element.textContent)
  check('pages badge shows crawled/total', /^\d+\/\d+$/.test(badge), badge)

  // The crawler tabs should be closed
  const openPages = (await browser.pages()).map(p => p.url())
  check('crawler tabs are closed after crawling', !openPages.some(url => url.startsWith(origin)), JSON.stringify(openPages))

  // Selections survive re-renders
  await showView(viewer, 'pages')
  await viewer.click(`#pages .view-row[data-url="${origin}/about"] .select input`)
  await viewer.evaluate(() => document.querySelector('#links .view-row')?.scrollIntoView())
  check('selecting a page shows the actions', await viewer.$eval('#pages .multi-wrapper', element => element.classList.contains('active')))

  // Inspector
  await viewer.click(`#pages .view-row[data-url="${origin}/about"] .inspect`)
  await viewer.waitForSelector('#inspecter.active')
  const inspectorText = await viewer.$eval('#inspecter .card-title', element => element.textContent)
  check('inspector opens for a crawled page', inspectorText.includes('About'), inspectorText)
  await viewer.click('#inspecter .popup-close i')

  // Search filter
  await viewer.click('#pages .filter-icon')
  await viewer.type('#pages .searchbar input', 'blog')
  await new Promise(resolve => setTimeout(resolve, 400))
  const visibleRows = await viewer.$$eval('#pages .view-row:not(.hidden)', rows => rows.map(row => row.dataset.url))
  check('search filters the pages', visibleRows.length === 2 && visibleRows.every(url => url.includes('blog')), JSON.stringify(visibleRows))
  await viewer.click('#pages .filter-icon')
  // Let the search bar slide away so it doesn't cover the rows
  await new Promise(resolve => setTimeout(resolve, 600))

  // Download
  await viewer.click(`#pages .view-row[data-url="${origin}/about"] .download`)
  const downloaded = await waitForDownload('about.html')
  check('downloads are named after their URL', downloaded.includes('about.html'), JSON.stringify(downloaded))

  // Combined download with images inlined
  await showView(viewer, 'settings')
  await viewer.click('#combine-enabled')
  await showView(viewer, 'pages')
  await viewer.click(`#pages .view-row[data-url="${origin}/"] .download`)
  const combinedFiles = await waitForDownload('index.html')
  const combined = fs.existsSync(path.join(downloadDir, 'index.html')) ? fs.readFileSync(path.join(downloadDir, 'index.html'), 'utf8') : ''
  check('combined downloads inline images', combined.includes('src="data:image/png;base64,'), JSON.stringify({
    files: combinedFiles,
    combineEnabled: await viewer.$eval('#combine-enabled', input => input.checked),
    notifications: await viewer.$$eval('.toast-notification', toasts => toasts.map(toast => toast.textContent.trim())),
    content: combined.substring(0, 300)
  }))
  await showView(viewer, 'settings')
  await viewer.click('#combine-enabled')

  // Recrawl
  await showView(viewer, 'settings')
  await viewer.click('#recrawlBtn')
  await viewer.waitForFunction(url => document.querySelector(`#pages .view-row[data-url="${url}"] .inspect`), { timeout: 30000 }, origin + '/')
  await new Promise(resolve => setTimeout(resolve, 600))
  rows = await getPageRows(viewer)
  check('recrawl starts over from the start page', rows.filter(row => row.status === 'crawled').length === 1,
    JSON.stringify(rows.map(row => `${row.url.replace(origin, '')}=${row.status}`)))

  check('no errors in the viewer', errors.length === 0, errors.join('\n      '))

  // Live crawls are slow enough to stop part way
  const live = await openViewer(browser, extensionId, { ...settings, crawl: { ...settings.crawl, crawlMode: 'live', liveWaitTime: 3000 } })
  await live.viewer.waitForFunction(url => document.querySelector(`#pages .view-row[data-url="${url}"] .inspect`), { timeout: 30000 }, origin + '/')
  const isCrawlerTab = target => target.url().startsWith(origin + '/') && target.url() !== origin + '/'

  // Stopping Crawl All cancels its crawls, returning the pages to uncrawled
  await live.viewer.click('.crawlAllBtn')
  await browser.waitForTarget(isCrawlerTab, { timeout: 15000 })
  await live.viewer.click('.crawlAllBtn')
  await new Promise(resolve => setTimeout(resolve, 1000))
  rows = await getPageRows(live.viewer)
  check('stopping Crawl All cancels its crawls', rows.every(row => ['crawled', 'uncrawled'].includes(row.status)),
    JSON.stringify(rows.map(row => `${row.url.replace(origin, '')}=${row.status}`)))
  const afterStop = (await browser.pages()).map(p => p.url()).filter(url => url.startsWith(origin))
  check('stopping Crawl All closes its crawler tabs', afterStop.length === 0, JSON.stringify(afterStop))
  check('no errors in the live viewer', live.errors.length === 0, live.errors.join('\n      '))

  // Closing the viewer mid-crawl should close its crawler tabs
  await live.viewer.click('.crawlAllBtn')
  await browser.waitForTarget(isCrawlerTab, { timeout: 15000 })
  await live.viewer.close()
  await new Promise(resolve => setTimeout(resolve, 1500))
  const remaining = (await browser.pages()).map(p => p.url()).filter(url => url.startsWith(origin))
  check('closing the viewer closes its crawler tabs', remaining.length === 0, JSON.stringify(remaining))
} finally {
  await browser.close()
  server.close()
  fs.rmSync(downloadDir, { recursive: true, force: true })
  fs.rmSync(userDataDir, { recursive: true, force: true })
}

console.log(failures === 0 ? '\nAll end-to-end checks passed' : `\n${failures} end-to-end check(s) failed`)
process.exit(failures === 0 ? 0 : 1)
