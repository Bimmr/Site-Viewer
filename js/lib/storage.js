/**
 * Gets a value from extension storage
 * @param {string} key - The key to get
 * @returns {Promise<*>} The stored value, or null if there is none
 */
export async function storageGet(key) {
  const result = await chrome.storage.local.get(key)
  return result[key] ?? null
}

/**
 * Sets a value in extension storage
 * @param {string} key - The key to set
 * @param {*} value - The value to store
 * @returns {Promise<void>}
 */
export function storageSet(key, value) {
  return chrome.storage.local.set({ [key]: value })
}
