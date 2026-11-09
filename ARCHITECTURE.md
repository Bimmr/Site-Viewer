# Site-Viewer Architecture

Site-Viewer is a Chrome/Edge extension (Manifest V3) that crawls a website and organizes what it finds into **Pages**, **Assets** (scripts, stylesheets, fonts and manifests), **Links**, **Files**, **Media** and accessibility/SEO **Issues**. Everything runs locally in the browser; the optional CORS proxy is the only third-party request, and it's off by default.

## Layout

```
manifest.json
viewer.html                     Main UI, loads js/viewer.js as an ES module
css/viewer.css
modules/notifications/          Toast notifications
setup/
  popup.html, openPopup.js      Toolbar button: opens viewer.html?url=&tabId= for the current tab in a popup window
  background.js                 Service worker: closes a viewer's crawler tabs when the viewer closes
  options.html, options.js      Extension options (download naming)
js/
  viewer.js                     Entry point: startup and all UI event wiring
  settings.js                   Settings defaults (also the schema), load/merge/save
  lib/
    url.js                      URL checks (isUrlHTMLFile, isUrlLocal...), categories, formatLink, download names
    html.js                     escapeHtml, rendering helpers, debounce
    icons.js                    Font Awesome icons per URL type, sortLinks
    storage.js                  chrome.storage.local wrappers
  state/
    site.js                     The site being crawled (baseUrl, hostURL)
    store.js                    All crawl results, with lookups and change events
  crawl/
    controller.js               crawlPage, Crawl All (queue, limits, stop), recrawl
    network.js                  Request scheduler, fetch/live/smart modes, CORS proxy fallback
    tabs.js                     Live crawling in background tabs
    extract.js                  HTML -> links, media, assets (pure)
    issues.js                   Accessibility/SEO checks (pure)
    rules.js                    robots.txt, sitemaps, exclude patterns (pure)
  views/
    index.js                    Batched rendering, selection state
    lists.js                    Pages, Assets, Links, Files, Media views
    issues.js, overview.js      Issues and Overview views, Crawl All progress
    inspector.js                Popup for one crawled page
    rows.js                     Shared row/issue templates, row tags for search
    info.js                     Fills a row's info popup on first hover
    search.js                   View search filters
    dialog.js                   Confirmation dialog
  download/
    download.js                 Downloads, including combining a page into one HTML file
scripts/
  package.js, zip.js            npm run package: builds Site-Viewer.zip for the stores
tests/
  unit/                         Vitest + jsdom tests for the pure modules and the store
  e2e/run.js                    Loads the extension in Chrome for Testing and crawls a local test site
```

## How it fits together

```
 viewer.js ──── user actions ────► crawl/controller.js ──► crawl/network.js ──► fetch / crawl/tabs.js
     ▲                                     │                     (scheduler)
     │                                     ▼
 views/index.js ◄── change events ── state/store.js ◄── crawl/extract.js + crawl/issues.js
 (batched render)
```

- **The store is the single source of truth.** Crawling never touches the DOM, and views never change crawl data. Every change goes through a store method (`addPage`, `markCrawling`, `markFailed`, `removePage`...), which notifies listeners with the collections that changed.
- **Views render from the store.** `views/index.js` batches change events into one render every 250 ms, and only re-renders views whose collections changed (tracked with `store.versions`). Rows carry `data-url`, which actions use to find their item and which keeps checkboxes checked across re-renders.
- **Info popups are built on hover.** Each row's info popup starts empty with a `data-info-kind`; `views/info.js` looks the item up by the row's `data-url` and fills it the first time it's hovered. Building every popup up front (with every place an item was found) was most of the page's size on large sites.
- **Rows carry their tags.** `data-tags` lists the item's tags and the tags of everywhere it was found, e.g. `isSrcset` becomes `srcset` and `isInSitemap` becomes `sitemap`, plus `duplicate`, `redirect`, `skipped` and the media kind. Search's `is:<tag>` filters match against it, so new tags are searchable without changing the search code.
- **Pure modules have no browser-extension dependencies.** `extract.js`, `issues.js`, `rules.js`, `lib/url.js` and the store work in jsdom, which is what the unit tests use.

## Crawl results (`state/store.js`)

| Collection | Key | Contents |
|---|---|---|
| `links` | normalized URL (no trailing slash) | Every `<a>`/`<iframe>` target, plus the start page and sitemap pages |
| `media` | `src` | Images, video, audio, background images |
| `assets` | URL | Linked stylesheets and scripts |
| `issues` | (array) | Accessibility/SEO issues with the page they were found on |
| `pages` | crawled URL | Crawled page data: title, description, what was found, raw HTML |

Each item has `instances`: where it was found (`foundOn`) and details like link text or alt text.

Links are split into views by `getUrlCategories`, cached per link:
- **Pages**: local HTML pages
- **Links**: external pages, anchors, `mailto:`/`tel:` etc., and broken links
- **Files**: non-HTML files

Link status flags: `isCrawled` (crawled or being crawled), `isCrawling`, `isError` (couldn't be crawled), `isWarning` + `statusCode` (HTTP error status), `isDuplicate` + `duplicateOf` (same content hash as an earlier page), `skipReason` (Crawl All skipped it: `robots`, `depth` or `excluded`), `redirectsTo` (where it redirects), `depth` (clicks from the start page).

Crawled pages keep their raw HTML only. Parsed documents use far more memory, so the combine download re-parses with `parsePageDocument` when needed.

## Crawling

### Crawl modes (`network.js` → `fetchPage`)

- **Fetch**: plain `fetch`. Extension pages with host permissions aren't limited by CORS, so this works for any site.
- **Live**: opens the page in a background tab, waits for it to load plus `liveWaitTime` for JavaScript, then reads `document.documentElement.outerHTML`. Checks the HTTP status first so error pages aren't opened.
- **Smart** (default): fetches the page, then re-crawls it live if `shouldUseLiveCrawling` scores it as client-side rendered (framework markers, little text, many scripts). The page the viewer was opened for is read straight from its tab.

Stylesheets and scripts are always fetched, whatever the mode.

If a request can't be made at all and **Retry failed requests through the CORS proxy** is on, it's retried through the proxy. HTTP error statuses are never retried, since the proxy would get the same answer. Errors with an `httpStatus` (`HttpStatusError`) become warnings; other failures become errors.

### Scheduling

`RequestScheduler` runs requests in two lanes, tabs (`maxConcurrentTabs`) and fetches (20), with `rateLimitMs` between the start of any two requests so the site isn't hit too quickly. Queued requests are removed when their `AbortSignal` fires.

### `crawlPage(url, options)` (`controller.js`)

1. Shares an in-progress crawl of the same URL instead of starting another.
2. Marks the page as crawling, fetches it with `fetchPage`, and extracts it with `extractPage`.
3. Adds the result with `store.addPage`, or marks it failed or cancelled.

`addToAll: false` crawls a page without adding it to the results (used when downloading an uncrawled page). `quiet: true` skips the per-page notifications; Crawl All shows progress instead.

### Redirects

`fetchPage` returns the URL the content came from after redirects: the response URL for fetches, the tab's URL for live crawls. If it differs from the requested URL (ignoring trailing slashes and hashes), the crawled page is marked with `redirectsTo` and its content is added under the page it redirects to, which is added as a page if it's new. That page is only crawled if it's on the same site and hasn't been crawled already. Link tests record redirects the same way. `fetch` follows redirects without exposing their status codes, so 301 and 302 aren't told apart.

### Crawl All

`startCrawlAll()`:
1. Reads `robots.txt` (for its rules and `Sitemap:` lines) and the sitemap(s), adding sitemap pages at depth 1. Sitemap indexes are followed, up to 20 sitemap files.
2. Repeatedly starts every uncrawled page that passes the limits: `maxPages` (counting pages already crawled), `maxDepth`, `excludePatterns`, and robots.txt. Pages that don't pass get a `skipReason`, shown on their crawl icon; they can still be crawled by hand.
3. If `crawlStylesheets` is on, also reads the site's own (local) stylesheets for their background images and fonts. These don't count towards `maxPages`.
4. Re-checks whenever the store changes, so pages found along the way are picked up, including by crawls the user started.
5. Finishes when nothing is left to crawl, and reports a summary.

`stopCrawlAll()` aborts everything the run started. Queued requests are dropped, in-flight requests and tab waits are cancelled, and those pages go back to uncrawled.

`recrawl()` stops Crawl All, cancels every crawl, clears the store and crawls the start page again.

### Live crawl tabs

Tabs are opened in the background of the crawled site's window (the viewer runs in a popup window, which can't hold tabs) and closed after reading. The open tabs are saved in `chrome.storage.session` under `crawlerTabs-<viewer tab id>`. `setup/background.js` closes them when the viewer tab closes, even if the viewer couldn't clean up itself.

## Extraction (`extract.js`)

`extractPage(data, url, { onPageScripts, onPageStyles })`:
- Parses the HTML with a `<base>` set to the page URL (or the page's own `<base>`), so relative URLs resolve against the crawled page.
- **Links**: `<a>`, `<iframe>`, and `<object>`/`<embed>` documents.
- **Images**: `<img>` `src` and `srcset`; lazy-loading attributes (`data-src`, `data-lazy-src`, `data-original`, `data-srcset`), skipping `data:` placeholders; `<picture><source srcset>`; `<input type="image">`; `<image>` in inline SVGs; favicons and touch icons; `og:image`/`twitter:image`; images preloaded with `<link rel="preload" as="image">`.
- **Video and audio**: `src` and every `<source>`, plus posters.
- **Assets**: stylesheets, scripts, `modulepreload` and preloaded scripts/styles/fonts, and web app manifests.
- **CSS** (inline `style` attributes, `<style>` tags when enabled, and crawled stylesheets): every `url()` and `@import`. Images become media (whatever the property, e.g. `mask-image`), fonts and imported stylesheets become assets. URLs resolve against the stylesheet they're in.
- **Scripts** (when enabled): background images and `<a>` markup in `<script>` tags. Comments are stripped first; string literals are kept so URLs aren't mistaken for `//` comments.
- Runs `detectIssues` for HTML pages.

Media found in a place that says what it is (an `<img>`, a `<video>`...) gets a `kind` (`image`, `video` or `audio`), so URLs without a file extension, like `/cdn/photo?id=7`, still preview correctly. Instance tags record where each was found: `isSrcset`, `isLazy`, `isPictureSource`, `isIcon`, `isSocialImage`, `isPreload`, `isPoster`, `isInSvg`, `isBackground`, `cssProperty`, `isImport`, `isManifest`.

Crawled CSS and JS files are wrapped in `<style>`/`<script>` so the same extraction runs on them.

## Settings (`settings.js`)

`DEFAULT_SETTINGS` lists every setting and its default. Stored settings are merged over it, keeping only known keys with matching types. Settings inputs in `viewer.html` are bound by id: `group-key`, e.g. `crawl-maxPages`. To add a setting, add it to `DEFAULT_SETTINGS` and add an input with that id.

The options page has one setting, `manageDownloads` (stored separately): whether downloads are named after their URL and placed in the download directory. Names are passed to `chrome.downloads.download` directly. Combined pages are always named, since blob URLs have no useful name.

## Downloads (`download.js`)

- Regular downloads go through a queue of 3 at a time.
- Media without a file extension is named by the browser, since naming it after the URL would add `.html`.
- **Combine** (when enabled) builds one HTML file from a page. It can inline linked scripts and stylesheets, convert `<img>`/inline background images to data URLs, and convert background images in `<style>` tags. Images use their lazy-loaded or largest `srcset` image, and `srcset`/`<picture>` sources are removed so the browser shows the inlined image. Images in an inlined stylesheet resolve against the stylesheet's URL.

## Testing

```
npm install
npm test            # unit tests (Vitest + jsdom)
npm run test:e2e    # end-to-end: Chrome for Testing + local test site (HEADFUL=1 to watch)
```

The end-to-end test starts a local site with `robots.txt`, a sitemap, a 404, a client-side rendered page, a stylesheet, and images in most of the places extraction looks. It opens the viewer from the real toolbar popup (falling back to opening it the same way if the browser won't open the popup from a script), then checks the initial crawl, Crawl All (including skips, sitemap pages, stylesheets and live crawling), media and asset discovery, the inspector, search, downloads (named and combined), recrawl, Stop, and tab cleanup when the viewer closes.

The tooling needs Node 18+.

## Packaging

`npm run package` builds `Site-Viewer.zip` with only the extension's files (`manifest.json`, `viewer.html`, `css`, `icons`, `js`, `modules`, `setup`). It first checks that every file the manifest, the HTML (`src`/`href`) and the JS (relative imports) refer to is in the package, and fails if one is missing. The zip is written by `scripts/zip.js`, so packaging needs no dependencies.

## Browser support

Chrome/Edge 116+ (`AbortSignal.any`, `chrome.storage.session`, module service workers).
