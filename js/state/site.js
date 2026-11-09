/**
 * The site being crawled
 * Both values are replaced once the viewer knows which page it was opened for
 */
export const site = {
  // The first page crawled, without its query or hash
  baseUrl: '',
  // Origin of the site, used to decide which links are local
  hostURL: ''
}

/**
 * Sets the site being crawled from the starting URL
 * @param {string} url - The page the viewer was opened for
 */
export function setSite(url) {
  const parsed = new URL(url)
  site.hostURL = parsed.origin
  site.baseUrl = parsed.origin + parsed.pathname
}
