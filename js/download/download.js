import { chromeExtensionRegex, getImageUrlRegex, getDownloadFilename, getUrlExtension, isUrlHTMLFile } from '../lib/url.js'
import { createElementFromHTML } from '../lib/html.js'
import { settings, getManageDownloads } from '../settings.js'
import { store } from '../state/store.js'
import { crawlPage } from '../crawl/controller.js'
import { parsePageDocument, parseSrcset } from '../crawl/extract.js'
import { toDataURL } from '../crawl/network.js'
import { showNotification } from '../../modules/notifications/notifications.js'

// Time to keep a combined page's blob URL after its download starts
const BLOB_CLEANUP_DELAY = 10000

// Downloads in progress, limited so selecting many items doesn't overwhelm the browser
const MAX_CONCURRENT_DOWNLOADS = 3
const downloadQueue = []
let activeDownloads = 0

/**
 * Starts a download
 * @param {string} url - URL to download
 * @param {string} filename - Path inside the downloads folder, or undefined to let the browser name it
 * @returns {Promise<number|undefined>} Download ID, undefined if it failed
 */
function startDownload(url, filename) {
  return new Promise(resolve => {
    chrome.downloads.download({
      url,
      ...(filename && { filename }),
      saveAs: false,
      conflictAction: 'uniquify'
    }, downloadId => {
      if (chrome.runtime.lastError)
        showNotification('Download failed: ' + chrome.runtime.lastError.message, 'error', 5000)
      else
        showNotification('Download started successfully', 'success')
      resolve(downloadId)
    })
  })
}

/**
 * Gets a page's crawled data, crawling it without adding it to the results if needed
 * @param {string} url - Page URL
 * @returns {Promise<Object>} Page data
 */
function getPageData(url) {
  return store.getPage(url) || crawlPage(url, { addToAll: false })
}

/**
 * Replaces linked stylesheets or scripts with inline copies, appended to the body
 * @param {Document} pageDoc - The document to change
 * @param {string} selector - Elements to replace, e.g. "link[rel='stylesheet']"
 * @param {string} urlProperty - Element property holding the URL ('href' or 'src')
 * @param {string} inlineSelector - Existing inline elements, moved after the new ones to keep their order
 */
async function inlineAssets(pageDoc, selector, urlProperty, inlineSelector) {
  const elements = Array.from(pageDoc.querySelectorAll(selector))
  const results = await Promise.allSettled(elements.map(async element => {
    const assetUrl = element[urlProperty]
    return [assetUrl, (await getPageData(assetUrl)).data]
  }))
  elements.forEach(element => element.remove())

  const body = pageDoc.body
  results.forEach(result => {
    if (result.status !== 'fulfilled') return
    const [assetUrl, data] = result.value
    // Crawled stylesheets and scripts are stored wrapped in their tag
    const inlineElement = createElementFromHTML(data)
    inlineElement.setAttribute('data-link', assetUrl)
    body.appendChild(inlineElement)
  })
  pageDoc.querySelectorAll(`${inlineSelector}:not([data-link])`).forEach(element => body.appendChild(element))
}

/**
 * Replaces background images in <style> tags with data URLs
 * @param {Document} pageDoc - The document to change
 * @param {string} pageUrl - URL relative images resolve against, unless the style came from a stylesheet
 * @returns {Promise<number>} Number of images that couldn't be converted
 */
async function inlineStyleImages(pageDoc, pageUrl) {
  let failureCount = 0
  await Promise.all(Array.from(pageDoc.querySelectorAll('style')).map(async style => {
    const baseUrl = style.dataset.link || pageUrl
    const matches = style.innerHTML.match(getImageUrlRegex()) || []
    const replacements = await Promise.allSettled(matches.map(async match => {
      const src = getImageUrlRegex().exec(match).groups.image.replace(chromeExtensionRegex, '/').replace('viewer.html', '')
      return [src, await toDataURL(new URL(src, baseUrl).href)]
    }))
    replacements.forEach(result => {
      if (result.status === 'fulfilled') style.innerHTML = style.innerHTML.replaceAll(result.value[0], result.value[1])
      else failureCount++
    })
  }))
  return failureCount
}

/**
 * Replaces images and inline background images with data URLs
 * @param {Document} pageDoc - The document to change
 * @param {string} pageUrl - URL relative images resolve against
 * @returns {Promise<number>} Number of images that couldn't be converted
 */
async function inlineImages(pageDoc, pageUrl) {
  let failureCount = 0

  // Browsers prefer srcset and <picture> sources over src, which would bypass the inlined image
  pageDoc.querySelectorAll('picture source').forEach(source => source.remove())

  const elements = pageDoc.querySelectorAll('img, *[style*="background"]')
  await Promise.all(Array.from(elements).map(async element => {
    try {
      if (element.tagName.toLowerCase() === 'img') {
        const src = element.getAttribute('src')
        // Use the real image of lazy-loaded images, or the last (usually largest) srcset candidate
        const lazySrc = element.getAttribute('data-src') || element.getAttribute('data-lazy-src') || element.getAttribute('data-original')
        const srcsetCandidate = parseSrcset(element.getAttribute('srcset') || element.getAttribute('data-srcset') || '').pop()
        const imageUrl = (src && !src.startsWith('data:') ? src : null) || lazySrc || srcsetCandidate
        if (!imageUrl) return

        element.src = await toDataURL(new URL(imageUrl, pageUrl).href)
        ;['srcset', 'sizes', 'data-srcset', 'loading'].forEach(attribute => element.removeAttribute(attribute))
        return
      }

      const match = getImageUrlRegex().exec(element.style.cssText)
      if (!match) return
      const src = match.groups.image
      const dataUrl = await toDataURL(new URL(src, pageUrl).href)
      element.setAttribute('style', element.style.cssText.replaceAll(src, dataUrl))
    } catch (error) {
      failureCount++
    }
  }))
  return failureCount
}

/**
 * Downloads a page as a single HTML file, with its assets and images inlined depending on settings
 * @param {string} url - Page URL
 */
async function downloadCombinedPage(url) {
  let page
  try {
    page = await getPageData(url)
  } catch (error) {
    showNotification(`Failed to crawl ${url}`, 'error', 5000)
    return
  }

  const pageDoc = parsePageDocument(page.data, url).doc
  let failureCount = 0

  if (settings.combine.assets) {
    await inlineAssets(pageDoc, 'script[src]', 'src', 'script')
    await inlineAssets(pageDoc, "link[rel='stylesheet']", 'href', 'style')
  }
  if (settings.combine.imagesInAssets)
    failureCount += await inlineStyleImages(pageDoc, url)
  if (settings.combine.images)
    failureCount += await inlineImages(pageDoc, url)

  if (failureCount > 0)
    showNotification(`Warning: ${failureCount} images failed to convert`, 'warning', 3000)

  const blobUrl = URL.createObjectURL(new Blob([pageDoc.documentElement.outerHTML], { type: "text/html" }))
  showNotification('Starting download...', 'info')
  // Blob URLs have no useful name, so always name combined pages
  await startDownload(blobUrl, getDownloadFilename(url, settings.download.directory))
  setTimeout(() => URL.revokeObjectURL(blobUrl), BLOB_CLEANUP_DELAY)
}

/**
 * Downloads a URL, combining pages into a single file if enabled in settings
 * @param {string} url - The URL to download
 * @returns {Promise<void>}
 */
export async function downloadUrl(url) {
  if (isUrlHTMLFile(url) && settings.combine.enabled)
    return downloadCombinedPage(url)

  showNotification('Starting download...', 'info')
  // Naming adds .html to URLs without an extension, which is wrong for media like /image?id=1, so let the browser name those
  const isMediaWithoutExtension = store.media.has(url) && !getUrlExtension(url)
  const filename = (await getManageDownloads()) && !isMediaWithoutExtension ? getDownloadFilename(url, settings.download.directory) : undefined
  await startDownload(url, filename)
}

/**
 * Queues a download, so only a few run at once
 * @param {string} url - The URL to download
 */
export function queueDownload(url) {
  downloadQueue.push(url)
  processDownloadQueue()
}

function processDownloadQueue() {
  while (activeDownloads < MAX_CONCURRENT_DOWNLOADS && downloadQueue.length > 0) {
    const url = downloadQueue.shift()
    activeDownloads++
    downloadUrl(url).finally(() => {
      activeDownloads--
      processDownloadQueue()
    })
  }
}
