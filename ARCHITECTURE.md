# Site-Viewer Architecture Documentation

## Project Overview

**Site-Viewer** is a Chrome/Edge extension that crawls and maps websites to extract and organize:
- **Pages** - HTML pages on the site
- **Assets** - Scripts and stylesheets
- **Links** - External links, anchors, and iframes
- **Files** - Downloadable files (PDFs, documents, archives, etc.)
- **Media** - Images, videos, and audio files

The extension provides tools to view, filter, test, download, and combine these resources into single files.

---

## Architecture Overview

### Core Components

1. **Manifest (manifest.json)** - Extension configuration
2. **Background Service Worker (setup/background.js)** - Handles download management
3. **Popup (setup/popup.html)** - Extension icon popup for quick actions
4. **Main Viewer (viewer.html)** - Primary UI for viewing crawled data
5. **Core Modules:**
   - `js/data.js` - Global constants and regex patterns
   - `js/utils.js` - Utility functions (URL parsing, icons, storage)
   - `js/tabCrawler.js` - Tab-based live crawling functionality
   - `js/crawl.js` - Crawling engine and page parsing
   - `js/viewer.js` - UI rendering and user interactions

---

## Data Flow

```
User Clicks Extension Icon
         ↓
    Popup Opens (setup/popup.html)
         ↓
User Clicks "Open Site Viewer"
         ↓
  viewer.html Loads in New Tab
         ↓
Initialize with Current Tab URL (baseUrl, hostURL)
         ↓
┌────────────────────────────────────────┐
│     Crawling Process Begins            │
├────────────────────────────────────────┤
│  1. Determine Crawl Mode:              │
│     - Smart (auto-detect frameworks)   │
│     - Live (JavaScript execution)      │
│     - Fetch (static HTML)              │
│                                        │
│  2. Queue Management:                  │
│     - tabQueue (5 concurrent tabs)     │
│     - fetchQueue (20 concurrent fetches)│
│                                        │
│  3. Parse HTML/DOM:                    │
│     - Extract links (<a>, <iframe>)    │
│     - Extract media (img, video, audio)│
│     - Extract assets (scripts, styles) │
│     - Extract background images        │
│                                        │
│  4. Store in crawl.all:                │
│     - crawl.all.links[]                │
│     - crawl.all.media[]                │
│     - crawl.all.assets[]               │
│                                        │
│  5. Categorize Resources:              │
│     - Pages (local HTML)               │
│     - Links (external URLs, anchors)   │
│     - Files (non-HTML resources)       │
│     - Assets (scripts/stylesheets)     │
│     - Media (images/video/audio)       │
└────────────────────────────────────────┘
         ↓
  Update All Views (updatePages, updateLinks, etc.)
         ↓
   User Interacts with Data
```

---

## Key Concepts

### 1. Crawl Modes

The extension supports three crawling strategies:

#### **Fetch Mode**
- Uses standard `fetch()` API to retrieve HTML
- Fast but doesn't execute JavaScript
- Falls back to CORS proxy if direct fetch fails
- Best for static sites

#### **Live Mode**
- Opens pages in background tabs
- Waits for JavaScript execution (configurable delay)
- Extracts final rendered DOM content
- Best for JavaScript-heavy frameworks (React, Vue, Angular)

#### **Smart Mode** (Default)
- Analyzes HTML to detect frameworks
- Scoring system checks for:
  - React indicators (`id="root"`, `__REACT__`)
  - Vue indicators (`id="app"`, `v-app`)
  - Angular indicators (`ng-app`, `ng-controller`)
  - Next.js (`__NEXT_DATA__`)
  - Nuxt (`__NUXT__`)
  - Svelte (`data-svelte-h`)
  - Low content density (likely client-rendered)
- Automatically switches to Live mode if score ≥ 3
- Falls back to Fetch mode for static sites

### 2. URL Normalization

**Purpose:** Prevent duplicate detection of URLs with/without trailing slashes

```javascript
normalizeUrl('https://example.com/page/') 
  → 'https://example.com/page'

normalizeUrl('https://example.com/') 
  → 'https://example.com/' // Root preserved
```

### 3. Queue Systems

Two separate queues manage concurrency:

- **tabQueue**: Limits tab-based crawling (default: 5 concurrent)
  - Opening tabs is resource-intensive
  - Rate limited to avoid overwhelming browser
  
- **fetchQueue**: Limits HTTP requests (20 concurrent)
  - HTTP fetches are lighter weight
  - Higher concurrency for better performance

### 4. Duplicate Detection

Pages are hashed based on:
- Title and description
- Link count, media count, asset count
- Sample of first 15 links (sorted)
- Sample of first 10 media items (sorted)
- Sample of first 10 assets (sorted)

If hash matches existing page → marked as duplicate

### 5. Resource Categorization

Resources are categorized into views using these rules:

| Resource Type | View | Criteria |
|---------------|------|----------|
| Local HTML pages | Pages | `isUrlLocal() && isUrlHTMLFile()` |
| External HTML | Links | `!isUrlLocal() && isUrlHTMLFile()` |
| Scripts/Styles | Assets | Has `.js`, `.css` extension or from CDN |
| Non-HTML files | Files | `!isUrlHTMLFile() && isUrlLocal()` |
| Images/Video/Audio | Media | Has image/video/audio extension |
| Anchor links | Links | URL contains `#` and points to same origin |
| Protocol links | Links | `tel:`, `mailto:`, `fax:`, etc. |
| Iframes | Links | `<iframe>` elements (with icon indicator) |

### 6. Icon System

Each resource gets an icon based on type:

```javascript
getFAIcon(value) → { icon: '<i class="fas fa-..."></i>', sortOrder: number }
```

**Icon priorities** (sortOrder):
1. Anchors (1)
2. Protocols (10-12)
3. PDFs (20)
4. Documents (21)
5. Archives (22)
6. Data files (23)
7. Images (24)
8. Videos (25)
9. Audio (26)
10. Stylesheets (30)
11. Scripts (31)
12. Fonts (32)
13. HTML/Links (90)
14. Broken links (100)

---

## File Structure

```
Site-Viewer/
├── manifest.json              # Extension configuration
├── viewer.html                # Main UI
├── README.md                  # User documentation
├── ARCHITECTURE.md            # This file
│
├── setup/                     # Extension setup files
│   ├── background.js          # Service worker (download management)
│   ├── popup.html             # Extension icon popup
│   ├── openPopup.js           # Popup interaction logic
│   ├── options.html           # Settings page
│   └── options.js             # Settings logic
│
├── js/                        # Core JavaScript modules
│   ├── data.js                # Global constants and regex
│   ├── utils.js               # Utility functions
│   ├── tabCrawler.js          # Live tab crawling
│   ├── crawl.js               # Main crawling engine
│   └── viewer.js              # UI rendering and interactions
│
├── css/
│   └── viewer.css             # Styling
│
├── modules/
│   └── notifications/         # Toast notification system
│       ├── notifications.js
│       └── notifications.css
│
└── icons/                     # Extension icons
```

---

## Core Modules Deep Dive

### data.js - Global State

Stores shared constants and regex patterns:

```javascript
let baseUrl = 'https://bimmr.com'    // Initial crawl URL
let hostURL = 'https://bimmr.com'    // Site domain
let CORS_BYPASS_URL = '...'          // CORS proxy for cross-origin

// Regex patterns
chromeExtensionRegex  // Detect extension URLs
getImageUrlRegex()    // Extract background-image URLs
getATagRegex()        // Extract <a> tags from scripts
httpRegex             // Detect http/https protocols
```

### utils.js - Utility Functions

**URL Checking:**
- `isUrlHTMLFile()` - Detects HTML pages vs files
- `isUrlProtocol()` - Detects custom protocols (tel:, mailto:, etc.)
- `getUrlProtocol()` - Extracts protocol name
- `isUrlLocal()` - Checks if URL is on same domain
- `isUrlAnchor()` - Checks for anchor links
- `isUrlImage/Video/Audio()` - Detects media types
- `normalizeUrl()` - Removes trailing slashes

**Icon System:**
- `getFAIcon(value)` - Returns icon HTML and sort order
  - Handles URLs (detects type from extension)
  - Handles tags ('page', 'broken-link', 'iframe')
  - Returns `{ icon, sortOrder }` object

**Sorting:**
- `sortLinks(a, b)` - Multi-criteria sorting:
  1. Local pages first
  2. By icon type (sortOrder)
  3. By error status
  4. By crawled status
  5. Alphabetically

**Storage:**
- `storageGet(key)` - Get from Chrome storage
- `storageSet(key, value)` - Save to Chrome storage

**DOM Utilities:**
- `createElementFromHTML()` - Parse HTML string
- `formatLink()` - Convert relative URLs to absolute

### tabCrawler.js - Live Crawling

Enables JavaScript-executed crawling by opening pages in tabs:

**Key Functions:**
- `isTabCrawlingSupported()` - Check permissions
- `openTabForCrawling(url, isInitialPage)` - Open tab (background or active)
- `waitForPageLoad(tabId, timeout)` - Wait for DOM ready
- `extractPageContent(tabId)` - Get rendered HTML via content script
- `closeTab(tabId)` - Close background tab

**Process:**
1. Open URL in background tab
2. Inject content script to extract DOM
3. Wait for configurable delay (default: 5000ms)
4. Extract final HTML after JS execution
5. Close tab

### crawl.js - Crawling Engine

**Queue Management:**
```javascript
// Two separate queues
const tabQueue = []      // For live crawling (5 concurrent)
const fetchQueue = []    // For HTTP fetches (20 concurrent)

// Queue processors
processTabQueue()        // Manages tab-based crawls
processFetchQueue()      // Manages fetch-based crawls

// Rate limiting
rateLimitedTab(fn)       // Adds to tab queue
rateLimitedFetch(fn)     // Adds to fetch queue
```

**Main Crawl Function:**
```javascript
crawlURL(url, addToAll = true, isInitialPage = false)
```

**Process:**
1. **Acquire lock** - Prevent duplicate crawls
2. **Determine crawl method:**
   - Smart mode: Analyze HTML, decide live vs fetch
   - Live mode: Always use tab crawling
   - Fetch mode: Always use HTTP fetch
3. **Parse HTML:**
   - Extract `<a>` tags (filter out javascript:, ?)
   - Extract `<iframe>` (filter about:blank)
   - Extract `<img>` tags
   - Extract `<video>` and `<audio>` (poster + sources)
   - Extract background images from inline styles
   - Extract from `<style>` tags (if enabled)
   - Extract from `<script>` tags (if enabled)
   - Extract `<link rel="stylesheet">`
   - Extract `<script src="">`
4. **Create objects:**
   - `createLinkObject()` - Link with instances, tags
   - `createImageObject()` - Media with instances
   - `createAssetObject()` - Asset with instances
5. **Store in crawl object:**
   ```javascript
   crawl[url] = { title, description, links, media, assets }
   crawl.all.links = [...existing, ...new]
   crawl.all.media = [...existing, ...new]
   crawl.all.assets = [...existing, ...new]
   ```
6. **Detect duplicates** - Hash-based comparison
7. **Release lock**
8. **Update all views**

**Comment Removal:**
- `removeHTMLComments()` - Strip HTML comments
- `removeJSComments()` - Strip JS comments
- `removeCSSComments()` - Strip CSS comments

**Framework Detection:**
```javascript
shouldUseLiveCrawling(html) → boolean
```
Scoring system:
- Framework indicators (+2 each): React, Vue, Angular, Next.js, Nuxt, Svelte
- Low content density (+1)
- Many script tags (+1)
- Score ≥ 3 → Use live crawling

**Hash Generation:**
```javascript
generatePageHash(page)
```
Creates hash from:
- Title, description
- Counts of links/media/assets
- Sample of actual content

**Duplicate Detection:**
```javascript
findDuplicatePage(page, currentUrl)
```
Compares hashes in `pageHashCache`

### viewer.js - UI & Interactions

**Initialization (DOMContentLoaded):**
1. Load settings from storage
2. Get active tab URL → set baseUrl, hostURL
3. Crawl initial page
4. Set up event listeners (sidebar, buttons, search, etc.)
5. Display version number

**View Management:**
```javascript
updateOverview()  // Statistics and counts
updatePages()     // Local HTML pages
updateAssets()    // Scripts and stylesheets
updateLinks()     // External links, anchors, iframes
updateFiles()     // Downloadable files
updateMedia()     // Images, videos, audio
```

**Each update function:**
1. Clear multi-action wrapper
2. Build HTML string from `crawl.all.*` arrays
3. Use `renderToContainer()` with DocumentFragment
4. Reapply active filters
5. Update counts and badges

**Filtering System:**
```javascript
applySearchFilter(viewSelector, searchTerm)
```

**Filter Types:**
- **Text search** - Match against URLs/titles
- **Custom filters** - `is:crawled`, `is:duplicate`, `is:warning`, `is:error`, `is:iframe`
- **Inversion** - `!is:filter` or `!text` to exclude matches

**Multi-Actions:**
- Download selected resources
- Crawl selected pages
- Delete crawl data from pages
- Test selected links

**Popup Inspector:**
```javascript
setupPopup(url)
```
Shows detailed view of single page:
- Title, description
- Categorized links (Links, Files, Assets)
- Media with previews
- Instances (where found)

**Download System:**
```javascript
queueDownload(downloadFn)
```
- Queues downloads (max 3 concurrent)
- Prevents browser overwhelm
- Uses Chrome downloads API

**Combine Feature:**
Converts resources to inline data URLs:
- `convertAllImages()` - Images → base64
- `convertAllScripts()` - Scripts → inline
- `convertAllStyles()` - Styles → inline
- `convertAllStyleImages()` - Background images → base64

---

## User Workflows

### 1. Initial Crawl
```
Extension Icon → Popup → "Open Site Viewer"
  → viewer.html loads
  → Gets current tab URL
  → Crawls initial page
  → Displays results in Overview
```

### 2. Crawl All Pages
```
Click "Crawl All Pages"
  → Finds all local uncrawled pages
  → Adds to queue (respects rate limits)
  → Shows "Stop Crawling" button
  → Displays notifications for each page
  → Updates views as pages complete
```

### 3. Search/Filter
```
Type in searchbar
  → applySearchFilter() called
  → Rows hidden/shown based on criteria
  → Badge shows visible count
```

### 4. Inspect Page
```
Click page row
  → setupPopup(url) called
  → Popup slides in from right
  → Shows categorized resources
  → Grouped instances with counts
```

### 5. Download Resource
```
Click download icon
  → queueDownload() called
  → Chrome download initiated
  → background.js suggests filename
```

### 6. Test Links
```
Click test icon
  → testURL() called
  → Fetches URL
  → Shows spinner
  → Updates icon (success/warning/error)
  → Displays status code
```

---

## Settings

Stored in Chrome storage:

```javascript
settings = {
  crawl: {
    onPageScripts: true,        // Search <script> tags
    onPageStyles: true,         // Search <style> tags
    rateLimitMs: 100,           // Delay between requests
    crawlMode: 'smart',         // 'fetch', 'live', or 'smart'
    liveWaitTime: 5000,         // Wait for JS execution
    maxConcurrentTabs: 10       // Max simultaneous tabs
  },
  combine: {
    enabled: false,             // Combine into single file
    onlyLocal: true,            // Only local resources
    assets: false,              // Include scripts/styles
    images: true,               // Include images
    imagesInAssets: false       // Include asset images
  },
  download: {
    directory: ''               // Default download location
  }
}
```

---

## Key Algorithms

### Smart Mode Analysis
```
Score = 0

IF contains React indicators:
  Score += 2
IF contains Vue indicators:
  Score += 2
IF contains Angular indicators:
  Score += 2
IF contains Next.js indicators:
  Score += 2
IF contains Nuxt indicators:
  Score += 2
IF contains Svelte indicators:
  Score += 2
IF body text < 100 chars:
  Score += 1
IF script tags > 5:
  Score += 1

IF Score >= 3:
  Use Live Mode
ELSE:
  Use Fetch Mode
```

### URL Categorization
```
IF link.isBroken:
  → Links view
ELSE IF link.link exists:
  → Assets view (scripts/stylesheets)
ELSE IF !isUrlHTMLFile():
  IF isUrlLocal():
    → Files view
  ELSE:
    → Links view
ELSE IF isUrlProtocol():
  → Links view (tel:, mailto:, etc.)
ELSE IF isUrlAnchor():
  → Links view
ELSE IF isUrlLocal():
  → Pages view
ELSE:
  → Links view
```

### Instance Grouping
```
FOR each instance:
  Group by foundOn URL

FOR each URL group:
  Show first instance text
  IF group.length > 1:
    Add " (+N more)" suffix
  Link to page with #:~:text=fragment
```

---

## Performance Optimizations

1. **DocumentFragment Rendering**
   - Build HTML strings
   - Create single DocumentFragment
   - Append to DOM once (no reflows)

2. **Queue-Based Concurrency**
   - Limits simultaneous operations
   - Prevents browser overwhelm
   - Rate limiting between requests

3. **Debounced Updates**
   - Batch view updates during crawls
   - 50ms delay to group rapid changes

4. **Lazy Loading**
   - Views render only when active
   - Images loaded as needed

5. **Hash-Based Duplicate Detection**
   - O(1) lookup in Map
   - Avoids comparing entire page content

6. **URL Normalization**
   - Single comparison point
   - Prevents duplicate detection misses

---

## Error Handling

### Crawl Errors
- **HTTP errors**: Marked as warning (shows status code)
- **Fetch failures**: Marked as error (shows error message)
- **Timeout**: Falls back to fetch mode
- **CORS blocked**: Falls back to CORS proxy
- **Tab blocked**: Falls back to fetch mode

### Lock System
```javascript
crawlLocks.add(url)     // Acquire
crawlLocks.delete(url)  // Release (in finally)
```
Prevents:
- Multiple simultaneous crawls of same URL
- Race conditions in data storage

### Notifications
- Max 5 concurrent notifications
- Queued beyond limit
- Auto-dismiss or replaceable

---

## Extension Lifecycle

### Installation
1. Extension installed
2. background.js registers
3. Icon appears in toolbar

### Activation
1. User clicks extension icon
2. popup.html loads
3. User clicks "Open Site Viewer"
4. openPopup.js creates/focuses viewer tab

### Runtime
1. viewer.html loads in tab
2. Scripts initialize in order:
   - notifications.js
   - utils.js
   - data.js
   - tabCrawler.js
   - crawl.js
   - viewer.js
3. DOMContentLoaded fires
4. Initial crawl begins

### Download Management
1. User clicks download
2. Chrome downloads API triggered
3. background.js listens to onDeterminingFilename
4. Suggests friendly filename based on URL

---

## Future Enhancement Areas

1. **Export formats**: JSON, CSV, XML
2. **Visualization**: Site map graph
3. **SEO analysis**: Meta tags, headers, alt text
4. **Performance metrics**: Load times, sizes
5. **Broken link checker**: Bulk validation
6. **Diff tool**: Compare crawls over time
7. **Scheduled crawls**: Background monitoring
8. **Cloud sync**: Multi-device access

---

## Debugging Tips

1. **Check console logs**:
   - Smart mode decisions
   - Framework detection
   - Crawl method selection

2. **Inspect crawl object**:
   ```javascript
   console.log(crawl)
   console.log(crawl.all.links)
   ```

3. **Monitor queue states**:
   ```javascript
   console.log(tabQueue, fetchQueue)
   console.log(activeTabs, activeFetches)
   ```

4. **View stored settings**:
   ```javascript
   chrome.storage.local.get(null, console.log)
   ```

5. **Test specific URLs**:
   ```javascript
   crawlURL('https://example.com')
   ```

---

## Security Considerations

1. **Content Security Policy**: Restricts inline scripts
2. **Host Permissions**: Required for cross-origin requests
3. **CORS Proxy**: Used when direct fetch fails
4. **Data Isolation**: Each tab instance separate
5. **Storage Limits**: Chrome storage quotas apply

---

## Browser Compatibility

- **Chrome**: Full support (Manifest V3)
- **Edge**: Full support (Chromium-based)
- **Firefox**: Would require Manifest V2 port
- **Safari**: Would require Safari-specific extension format

---

## Conclusion

Site-Viewer is a sophisticated web crawling tool that combines multiple crawling strategies, intelligent resource categorization, and a clean UI to help users understand and manage website structure. The architecture emphasizes performance through queue management, prevents duplicates through normalization and hashing, and provides flexibility through configurable crawl modes.
