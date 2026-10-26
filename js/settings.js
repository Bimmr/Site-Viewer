import { storageGet, storageSet } from './lib/storage.js'

/**
 * Default settings, also the schema: stored values are only kept if their key and type match a default
 * Settings inputs in viewer.html use the id "group-key", e.g. "crawl-rateLimitMs"
 */
export const DEFAULT_SETTINGS = Object.freeze({
  crawl: Object.freeze({
    onPageScripts: true,
    onPageStyles: true,
    rateLimitMs: 100,
    useCorsProxy: false,
    corsProxyUrl: 'https://api.allorigins.win/get?url=',
    corsProxyRawUrl: 'https://api.allorigins.win/raw?url=',
    crawlMode: 'smart',
    liveWaitTime: 5000,
    maxConcurrentTabs: 10,
    maxPages: 500,
    // 0 means no limit
    maxDepth: 0,
    // Comma separated, * matches anything, e.g. "/tag/*, *?page=*"
    excludePatterns: '',
    respectRobots: true,
    useSitemap: true
  }),
  combine: Object.freeze({
    enabled: false,
    onlyLocal: true,
    assets: false,
    images: true,
    imagesInAssets: false
  }),
  download: Object.freeze({
    directory: ''
  })
})

// The current settings, shared by every module
export const settings = mergeSettings(null)

/**
 * Merges stored settings over the defaults, dropping unknown keys and values of the wrong type
 * @param {Object|null} stored - Settings from storage
 * @returns {Object} Complete settings object
 */
export function mergeSettings(stored) {
  const merged = {}
  for (const [group, defaults] of Object.entries(DEFAULT_SETTINGS)) {
    merged[group] = {}
    for (const [key, defaultValue] of Object.entries(defaults)) {
      const value = stored?.[group]?.[key]
      merged[group][key] = typeof value === typeof defaultValue ? value : defaultValue
    }
  }

  // Migrate the old liveCrawling setting
  if (stored?.crawl && stored.crawl.crawlMode === undefined && stored.crawl.liveCrawling === true)
    merged.crawl.crawlMode = 'live'

  return merged
}

/**
 * Loads settings from storage into the shared settings object
 * @returns {Promise<Object>} The loaded settings
 */
export async function loadSettings() {
  const merged = mergeSettings(await storageGet('settings'))
  for (const group of Object.keys(merged))
    settings[group] = merged[group]
  return settings
}

/**
 * Changes a setting and saves all settings
 * @param {string} group - Settings group, e.g. 'crawl'
 * @param {string} key - Setting name
 * @param {*} value - New value
 */
export function setSetting(group, key, value) {
  if (!(group in DEFAULT_SETTINGS) || !(key in DEFAULT_SETTINGS[group])) return

  if (group === 'download' && key === 'directory' && value && !value.endsWith('/'))
    value += '/'

  settings[group][key] = value
  storageSet('settings', settings)
}

/**
 * Whether downloads should be named after their URL (set on the options page)
 * @returns {Promise<boolean>}
 */
export async function getManageDownloads() {
  return (await storageGet('manageDownloads')) !== false
}
