// jsdom doesn't implement CSS.escape, which the issue checks use for label lookups
if (!globalThis.CSS?.escape) {
  globalThis.CSS = {
    ...globalThis.CSS,
    escape: value => String(value).replace(/[^a-zA-Z0-9_-]/g, char => '\\' + char)
  }
}
