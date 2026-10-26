import { escapeHtml } from '../lib/html.js'
import { store } from '../state/store.js'
import { site } from '../state/site.js'
import { isCrawlAllRunning } from '../crawl/controller.js'

// Frame of the running count animation, so a new update can cancel it
let countAnimationFrame = null

/**
 * Updates the Overview view and the sidebar count badges
 */
export function renderOverview() {
  const pages = store.getPages()
  const crawledPages = pages.filter(link => link.isCrawled)
  const problemPageCount = crawledPages.filter(link => link.isError || link.isWarning).length

  // Same order as the stat cards and sidebar badges
  const targetCounts = [
    pages.length,
    store.assets.size,
    store.getLinks().length,
    store.getFiles().length,
    store.media.size,
    store.issues.length
  ]

  const countElements = Array.from(document.querySelectorAll("#overview .stat-card .count"))
  const sidebarBadges = document.querySelectorAll(".sidebar-item .count-badge")

  // Pages badge shows crawled/total, with a tooltip if any crawled pages had problems
  if (sidebarBadges[0])
    sidebarBadges[0].title = problemPageCount > 0 ? `${problemPageCount} page(s) had errors or warnings` : ''

  const setCount = (i, value) => {
    countElements[i].textContent = value
    const badge = sidebarBadges[i]
    if (badge)
      badge.textContent = i === 0 ? `${crawledPages.length}/${value}` : value
  }

  //Have a nice animation counting to the new counts
  cancelAnimationFrame(countAnimationFrame)
  const startCounts = countElements.map(element => parseInt(element.textContent) || 0)
  const startTime = performance.now()
  const duration = 400

  const animate = now => {
    const progress = Math.min((now - startTime) / duration, 1)
    countElements.forEach((element, i) => {
      setCount(i, Math.round(startCounts[i] + (targetCounts[i] - startCounts[i]) * progress))
    })
    countAnimationFrame = progress < 1 ? requestAnimationFrame(animate) : null
  }
  countAnimationFrame = requestAnimationFrame(animate)

  // Show the Crawl All button while there are pages it would crawl
  const crawlAllBtn = document.querySelector("#overview .crawlAllBtn")
  if (!isCrawlAllRunning()) {
    const hasUncrawledPages = pages.some(link => !link.isCrawled && !link.skipReason)
    crawlAllBtn.classList.toggle("hidden", !hasUncrawledPages)
  }

  renderCrawledList()
}

/**
 * Updates the banner listing the crawled pages
 * Shows up to 3 lines: all pages if there are 3 or less, otherwise 2 and a count with a hover list
 */
function renderCrawledList() {
  const siteText = document.querySelector("#crawledSiteText")
  const countText = document.querySelector("#crawledSiteCount")
  const listElement = document.querySelector("#crawledLinks")

  if (store.pages.size <= 1) {
    siteText.textContent = site.baseUrl
    countText.innerHTML = ''
    listElement.innerHTML = ''
    return
  }

  const crawledUrls = [
    ...store.getAllLinks().filter(item => item.isCrawled).map(item => item.href),
    ...store.getAssets().filter(item => item.isCrawled).map(item => item.link)
  ]

  if (crawledUrls.length <= 3) {
    siteText.innerHTML = crawledUrls.map(escapeHtml).join('<br>')
    countText.innerHTML = ''
  } else {
    siteText.innerHTML = crawledUrls.slice(0, 2).map(escapeHtml).join('<br>')
    countText.innerHTML = `... <span class="count">(+${crawledUrls.length - 2} more)</span>`
  }

  listElement.innerHTML = '<ul>' + crawledUrls.map(url => '<li>' + escapeHtml(url) + '</li>').join('') + '</ul>'
}

/**
 * Updates the Crawl All button and progress bar
 * @param {Object} progress - Progress from the crawl controller
 */
export function renderCrawlProgress(progress) {
  const button = document.querySelector("#overview .crawlAllBtn")
  const wrapper = document.querySelector("#overview .crawl-progress")
  const bar = wrapper.querySelector(".crawl-progress-bar span")
  const text = wrapper.querySelector(".crawl-progress-text")

  if (progress.running) {
    button.textContent = 'Stop Crawling'
    button.classList.add('stop-crawling')
    button.classList.remove('hidden')
    wrapper.classList.remove('hidden')

    const finished = progress.crawled + progress.failed
    bar.style.width = progress.total > 0 ? `${Math.round(finished / progress.total * 100)}%` : '0%'
    text.textContent = progress.preparing
      ? 'Reading robots.txt and sitemap...'
      : `${finished} of ${progress.total} pages crawled` + (progress.failed > 0 ? ` (${progress.failed} failed)` : '')
    return
  }

  button.textContent = 'Crawl All Pages'
  button.classList.remove('stop-crawling')
  wrapper.classList.add('hidden')
}

/**
 * Describes a finished Crawl All for a notification
 * @param {Object} progress - Final progress from the crawl controller
 * @returns {string} Summary
 */
export function describeCrawlResult(progress) {
  const parts = [`${progress.crawled} page${progress.crawled === 1 ? '' : 's'} crawled`]
  if (progress.failed > 0) parts.push(`${progress.failed} failed`)
  if (progress.sitemapPages > 0) parts.push(`${progress.sitemapPages} found in sitemap`)

  const { robots, depth, excluded } = progress.skipped
  if (robots > 0) parts.push(`${robots} blocked by robots.txt`)
  if (depth > 0) parts.push(`${depth} past max depth`)
  if (excluded > 0) parts.push(`${excluded} excluded`)

  const prefix = progress.stopped ? 'Crawling stopped' : progress.limitReached ? 'Reached the page limit' : 'Crawl finished'
  return `${prefix}: ${parts.join(', ')}`
}
