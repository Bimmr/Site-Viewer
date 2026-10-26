import { settings, loadSettings, setSetting, getManageDownloads } from './settings.js'
import { debounce } from './lib/html.js'
import { store } from './state/store.js'
import { site } from './state/site.js'
import { setInitialTab } from './crawl/tabs.js'
import { testUrl, getRedirectTarget } from './crawl/network.js'
import {
  startCrawl, recrawl, crawlPage, startCrawlAll, stopCrawlAll, isCrawlAllRunning, onCrawlAllProgress
} from './crawl/controller.js'
import { renderViews, scheduleRender, syncSelection, getSelectedUrls } from './views/index.js'
import { renderCrawlProgress, describeCrawlResult } from './views/overview.js'
import { renderIssues } from './views/issues.js'
import { openInspector } from './views/inspector.js'
import { confirmDialog } from './views/dialog.js'
import { fillInfoPopup } from './views/info.js'
import { buildTestIconHTML } from './views/rows.js'
import { applySearchFilter } from './views/search.js'
import { downloadUrl, queueDownload } from './download/download.js'
import { showNotification } from '../modules/notifications/notifications.js'

/**
 * Gets the page to crawl and the tab it's open in, passed as ?url=&tabId= by the toolbar popup
 * @returns {{url: string|null, tabId: number|null}}
 */
function getStartPage() {
  const params = new URLSearchParams(location.search)
  return { url: params.get('url') || null, tabId: Number(params.get('tabId')) || null }
}

/**
 * Loads settings, then starts crawling the page the viewer was opened for
 */
async function start() {
  try {
    await loadSettings()
  } catch (error) {
    // Missing settings on first use is normal, the defaults are used
  }
  populateSettingsInputs()

  // Named downloads can be turned off on the options page, which makes the directory setting do nothing
  if (!(await getManageDownloads()))
    document.querySelectorAll("#settings .needsManageDownloads").forEach(element => element.classList.add("hidden"))

  const { url, tabId } = getStartPage()
  if (!url || !/^https?:/i.test(url)) {
    document.querySelector("#crawledSiteText").textContent = url || 'No page selected'
    showNotification('Site Viewer can only crawl http and https pages', 'error', Infinity)
    return
  }

  setInitialTab(tabId)
  startCrawl(url).catch(() => { })
  document.querySelector("#crawledSiteText").textContent = site.baseUrl
  renderViews()
}

/**
 * Sets the settings inputs to the current settings
 * Inputs use the id "group-key" (or "group-key-value" for radios)
 */
function populateSettingsInputs() {
  document.querySelectorAll("#settings.view input, #settings.view select").forEach(item => {
    const [group, key] = item.id.split("-")
    const value = settings[group]?.[key]
    if (value === undefined) return

    if (item.type === "checkbox")
      item.checked = value
    else if (item.type === "radio")
      item.checked = item.value === value
    else
      item.value = value
  })

  document.querySelector(".combine-settings").classList.toggle("active", settings.combine.enabled === true)
}

/**
 * Switches to a view, sliding it in from the side of the sidebar item it's coming from
 * @param {string} viewId - ID of the view to show
 */
function showView(viewId) {
  const sidebarItems = Array.from(document.querySelectorAll(".sidebar-item"))
  const item = sidebarItems.find(sidebarItem => sidebarItem.dataset.view === viewId)
  const newView = document.getElementById(viewId)
  if (!item || !newView) return

  const previousView = document.querySelector(".view.active")
  const previousItem = document.querySelector(".sidebar-item.active")

  sidebarItems.forEach(sidebarItem => sidebarItem.classList.toggle("active", sidebarItem === item))
  item.querySelector(".newContent")?.classList.remove("active")

  if (!previousView || previousView === newView || !previousItem) {
    document.querySelectorAll(".view.active").forEach(view => view.classList.remove("active"))
    newView.classList.add("active")
    return
  }

  const isMovingForward = sidebarItems.indexOf(item) > sidebarItems.indexOf(previousItem)
  const transitionClasses = ["slide-in-left", "slide-in-right", "slide-out-left", "slide-out-right"]
  document.querySelectorAll(".view").forEach(view => view.classList.remove(...transitionClasses))

  requestAnimationFrame(() => {
    previousView.classList.remove("active")
    previousView.classList.add(isMovingForward ? "slide-out-left" : "slide-out-right")
    newView.classList.add("active", isMovingForward ? "slide-in-left" : "slide-in-right")
  })

  // Cleanup after animation completes
  setTimeout(() => {
    document.querySelectorAll(".view").forEach(view => view.classList.remove(...transitionClasses))
  }, 500)
}

/**
 * Deletes a crawled page's data, keeping it as an uncrawled page
 * @param {string} url - The page URL
 * @returns {boolean} False if it's the start page, which can't be deleted
 */
function deleteCrawlData(url) {
  if (url === site.baseUrl) return false
  store.removePage(url)
  return true
}

/**
 * Tests a link and shows the result on its icon
 * @param {string} url - The URL to test
 * @param {HTMLElement} element - The link's test icon
 */
async function testLink(url, element) {
  element.classList.remove("test", "success", "warning", "error")
  element.classList.add("testing")
  element.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'

  let result
  let status
  let redirectsTo = null
  try {
    const response = await testUrl(url)
    status = response.status
    redirectsTo = getRedirectTarget(url, response.finalUrl)
    result = status === 200 ? 'success' : 'warning'
  } catch (error) {
    result = 'failed'
  }

  store.setLinkTest(url, result, result === 'warning' ? status : undefined, redirectsTo)
  // View rows re-render from the store, but the inspector's don't, so update the icon directly
  element.outerHTML = buildTestIconHTML({ test: result, statusCode: status, redirectsTo }, url)
}

/**
 * Crawls a page or asset the user picked
 * @param {string} url - URL to crawl
 */
function crawlUrl(url) {
  crawlPage(url).catch(() => { })
}

/**
 * Positions a hover popup above or below its icon, whichever has more room
 * @param {HTMLElement} popup - The hover popup
 * @param {HTMLElement} icon - The icon it belongs to
 */
function positionPopup(popup, icon) {
  const iconRect = icon.getBoundingClientRect()
  const popupMaxHeight = 200
  const padding = 10
  const spaceBelow = window.innerHeight - iconRect.bottom
  const spaceAbove = iconRect.top

  // Overlap the icon so the mouse can move onto the popup
  if (spaceBelow >= popupMaxHeight + padding || spaceBelow > spaceAbove) {
    Object.assign(popup.style, { top: '100%', bottom: 'auto', marginTop: '-10px', marginBottom: '0' })
  } else {
    Object.assign(popup.style, { top: 'auto', bottom: '100%', marginTop: '0', marginBottom: '-10px' })
  }
}

document.addEventListener("DOMContentLoaded", () => {

  // Remove preload class after initial render to enable transitions
  setTimeout(() => document.body.classList.remove("preload"), 100)

  document.querySelector(".sidebar .sidebar-footer .version").textContent = chrome.runtime.getManifest().version

  // Re-render when crawl data changes
  store.onChange(scheduleRender)

  // Crawl All progress
  onCrawlAllProgress(progress => {
    renderCrawlProgress(progress)
    if (!progress.running) {
      showNotification(describeCrawlResult(progress), progress.failed > 0 ? 'warning' : 'success', 6000)
      renderViews()
    }
  })

  // === Navigation ===

  document.querySelectorAll(".sidebar-item").forEach(item => item.addEventListener("click", () => showView(item.dataset.view)))

  // Overview cards open their view
  document.querySelectorAll("#overview .card[data-view]").forEach(card => {
    card.addEventListener("click", () => showView(card.dataset.view))
  })

  // Show a star on views that got new rows while not being looked at
  const lastCounts = {}
  const viewObserver = new MutationObserver(mutations => {
    mutations.forEach(mutation => {
      const view = mutation.target.closest(".view")
      const count = mutation.target.querySelectorAll(".view-row").length
      if (count > (lastCounts[view.id] || 0) && !view.classList.contains("active"))
        document.querySelector(`.sidebar-item[data-view="${view.id}"] .newContent`)?.classList.add("active")
      lastCounts[view.id] = count
    })
  })
  document.querySelectorAll(".view .view-items").forEach(item => viewObserver.observe(item, { childList: true }))

  // === Crawling ===

  document.querySelector(".crawlAllBtn").addEventListener("click", () => {
    if (isCrawlAllRunning()) stopCrawlAll()
    else startCrawlAll()
  })

  document.querySelector("#settings #recrawlBtn").addEventListener("click", async () => {
    const confirmed = await confirmDialog({
      title: 'Recrawl the site?',
      message: 'This clears everything found so far and starts again from the start page.',
      detail: site.baseUrl,
      confirmText: 'Recrawl',
      danger: true
    })
    if (!confirmed) return
    recrawl().catch(() => { })
    renderViews()
  })

  // === Settings ===

  document.querySelectorAll("#settings.view input, #settings.view select").forEach(item =>
    item.addEventListener("change", () => {
      const [group, key] = item.id.split("-")
      let value
      if (item.type === "checkbox") value = item.checked
      else if (item.type === "number") value = parseInt(item.value, 10) || 0
      else value = item.value

      setSetting(group, key, value)
      if (item.id === "combine-enabled")
        document.querySelector(".combine-settings").classList.toggle("active", value)
    })
  )

  // === Popups ===

  const closeActivePopup = () => document.querySelector(".popup.active")?.classList.remove("active")

  document.querySelectorAll(".popup .popup-close i").forEach(element => element.addEventListener("click", closeActivePopup))
  document.querySelectorAll(".popup .popup-outerWrapper").forEach(element => element.addEventListener("click", event => {
    if (event.target === element) closeActivePopup()
  }))

  document.querySelectorAll("#inspecter .popup-nav-item").forEach(item => item.addEventListener("click", () => {
    document.querySelectorAll("#inspecter .popup-nav-item.active, #inspecter .popup-view.active").forEach(activeItem => activeItem.classList.remove("active"))
    item.classList.add("active")
    document.querySelector("#inspecter #popup-view-" + item.querySelector("p").textContent.toLowerCase())?.classList.add("active")
  }))

  // Delete crawl data for the inspected page
  document.querySelector("#inspecter .popup-delete")?.addEventListener("click", async () => {
    const popup = document.querySelector("#inspecter")
    const url = popup.dataset.url
    if (!url) return

    const confirmed = await confirmDialog({
      title: 'Delete crawl data for this page?',
      message: 'Everything found on this page is removed. The page stays in the list so it can be crawled again.',
      detail: url,
      confirmText: 'Delete',
      danger: true
    })
    if (!confirmed) return

    popup.classList.remove("active")
    if (deleteCrawlData(url)) {
      renderViews()
      showNotification(`Crawl data deleted for: ${url}`, 'success', 3000)
    }
  })

  // === Selection ===

  // Select all
  document.querySelectorAll(".view-title .select input").forEach(item => item.addEventListener("click", () => {
    const view = item.closest(".view")
    view.querySelectorAll(".view-items .view-row:not(.hidden) .select input").forEach(checkbox => checkbox.checked = item.checked)
    syncSelection(view)
  }))

  // Row checkboxes
  document.body.addEventListener('click', event => {
    if (event.target.matches('.view-items .select input'))
      syncSelection(event.target.closest(".view, .popup-view"))
  })

  // Download selected, from the view or popup view the button belongs to
  document.querySelectorAll(".downloadSelected").forEach(button => button.addEventListener("click", () => {
    const urls = getSelectedUrls(button.closest(".view, .popup-view"))
    if (urls.length === 0) {
      showNotification('No items selected', 'warning')
      return
    }
    showNotification(`Queueing ${urls.length} download${urls.length > 1 ? 's' : ''}...`, 'info')
    urls.forEach(queueDownload)
  }))

  document.querySelectorAll(".testSelected").forEach(button => button.addEventListener("click", () => {
    const view = button.closest(".view")
    getSelectedUrls(view).forEach(url => {
      const icon = view.querySelector(`.view-row[data-url="${CSS.escape(url)}"] :is(.test, .success, .warning, .error)`)
      if (icon) testLink(url, icon)
    })
  }))

  document.querySelectorAll(".crawlSelected").forEach(button => button.addEventListener("click", () => {
    const view = button.closest(".view")
    getSelectedUrls(view, { visibleOnly: true }).forEach(url => {
      const item = store.getLink(url) || store.getAsset(url)
      if (item && !item.isCrawled) crawlUrl(url)
    })
  }))

  document.querySelectorAll(".deleteCrawlSelected").forEach(button => button.addEventListener("click", async () => {
    const urls = getSelectedUrls(button.closest(".view"), { visibleOnly: true }).filter(url => store.getPage(url))
    if (urls.length === 0) {
      showNotification('No crawled pages selected', 'warning')
      return
    }
    const confirmed = await confirmDialog({
      title: `Delete crawl data for ${urls.length} page${urls.length === 1 ? '' : 's'}?`,
      message: 'Everything found on these pages is removed. The pages stay in the list so they can be crawled again.',
      confirmText: 'Delete',
      danger: true
    })
    if (!confirmed) return

    const deletedCount = urls.filter(deleteCrawlData).length
    const skippedCount = urls.length - deletedCount
    renderViews()

    if (deletedCount > 0)
      showNotification(`Deleted crawl data for ${deletedCount} page(s)`, 'success', 3000)
    if (skippedCount > 0)
      showNotification(`Skipped ${skippedCount} page(s) (cannot delete base URL)`, 'warning', 3000)
  }))

  // === Search ===

  // Filter icons toggle the search bar, closing it clears the search
  document.querySelectorAll(".filter-icon").forEach(item => item.addEventListener("click", event => {
    event.preventDefault()
    item.classList.toggle("active")
    const view = item.closest(".view")
    const searchbar = view.querySelector(".searchbar")
    searchbar.classList.toggle("active")
    if (!searchbar.classList.contains("active")) {
      searchbar.querySelector("input").value = ""
      if (view.id === "issues") renderIssues()
      else applySearchFilter('#' + view.id, '')
    }
  }))

  // The open search bar can cover the filter icon, so it can also be closed with its own button or Escape
  document.querySelectorAll(".view .searchbar").forEach(searchbar => {
    const close = () => searchbar.closest(".view").querySelector(".filter-icon").click()
    searchbar.querySelector(".searchbar-close")?.addEventListener("click", close)
    searchbar.querySelector("input").addEventListener("keydown", event => {
      if (event.key === "Escape") {
        event.preventDefault()
        close()
      }
    })
  })

  // Use "input" so the search field's built-in clear button also re-filters
  document.querySelectorAll(".view:not(#issues) .searchbar input").forEach(item => item.addEventListener("input", debounce(() => {
    applySearchFilter('#' + item.closest(".view").id, item.value)
  }, 200)))

  // Issues are filtered while rendering
  document.querySelector("#issues .searchbar input")?.addEventListener("input", debounce(renderIssues, 300))

  // === Row actions ===

  document.body.addEventListener('click', event => {
    const inspectLink = event.target.closest('.view .view-items .inspect')
    if (inspectLink) {
      event.preventDefault()
      openInspector(inspectLink.closest('.view-row').dataset.url)
      return
    }

    // Redirects open the page they redirect to, once it's crawled
    const redirectLink = event.target.closest('.view .view-items .redirect')
    if (redirectLink) {
      event.preventDefault()
      const target = store.getLink(redirectLink.closest('.view-row').dataset.url)?.redirectsTo
      if (target && store.getPage(target)) openInspector(target)
      return
    }

    if (event.target.matches('.expand-image')) {
      document.querySelector(".expanded-image").src = event.target.src
      document.querySelector(".expanded-image-title").textContent = event.target.alt ? `Alt: ${event.target.alt}` : 'No alt text'
      document.querySelector("#expander").classList.add("active")
      return
    }

    const testElement = event.target.closest('.view-items :is(.test, .warning, .error, .success):not(.crawl)')
    if (testElement && testElement.tagName === 'A') {
      event.preventDefault()
      testLink(testElement.closest('.view-row').dataset.url, testElement)
      return
    }

    const crawlLink = event.target.closest('.view .view-items .crawl')
    if (crawlLink) {
      event.preventDefault()
      // Read the URL before removing the icon, closest() finds nothing once it's detached
      const url = crawlLink.closest('.view-row').dataset.url
      crawlLink.remove()
      crawlUrl(url)
      return
    }

    const downloadLink = event.target.closest('.view-items .download')
    if (downloadLink) {
      event.preventDefault()
      downloadUrl(downloadLink.closest('.view-row').dataset.url)
    }
  })

  // Fill hover popups on first hover, and position them after CSS transitions start
  let activePopup = null
  document.body.addEventListener('mouseover', event => {
    const hoverIcon = event.target.closest('.hover-popup-icon')
    const popup = hoverIcon?.querySelector('.hover-popup')
    if (popup && popup !== activePopup) {
      activePopup = popup
      fillInfoPopup(hoverIcon)
      requestAnimationFrame(() => requestAnimationFrame(() => positionPopup(popup, hoverIcon)))
    }
  })
  document.body.addEventListener('mouseout', event => {
    if (event.target.closest('.hover-popup-icon') && !event.relatedTarget?.closest('.hover-popup-icon'))
      activePopup = null
  })

  start()
})
