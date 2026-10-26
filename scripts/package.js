/**
 * Builds Site-Viewer.zip for the Chrome Web Store and Edge Add-ons, with only the extension's files
 * Run with: npm run package
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createZip } from './zip.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outputFile = path.join(root, 'Site-Viewer.zip')

// Everything the extension needs; tests, tooling and docs are left out
const INCLUDE = ['manifest.json', 'viewer.html', 'css', 'icons', 'js', 'modules', 'setup']

/**
 * Lists the files under a path, skipping hidden files
 * @param {string} relativePath - File or folder, relative to the project root
 * @returns {string[]} Files, relative to the project root with / separators
 */
function listFiles(relativePath) {
  const fullPath = path.join(root, relativePath)
  if (fs.statSync(fullPath).isFile()) return [relativePath.split(path.sep).join('/')]
  return fs.readdirSync(fullPath)
    .filter(name => !name.startsWith('.'))
    .flatMap(name => listFiles(path.join(relativePath, name)))
}

/**
 * Finds files the package refers to: from the manifest, HTML src/href attributes and JS imports
 * @param {Set<string>} files - Files in the package
 * @returns {Array<{from: string, missing: string}>} References to files that aren't in the package
 */
function findMissingReferences(files) {
  const missing = []
  const check = (from, reference) => {
    if (!reference || /^([a-z]+:|\/\/|#|data:)/i.test(reference)) return
    const clean = reference.split(/[?#]/)[0]
    const resolved = clean.startsWith('/')
      ? clean.substring(1)
      : path.posix.normalize(path.posix.join(path.posix.dirname(from), clean))
    if (!files.has(resolved)) missing.push({ from, missing: resolved })
  }

  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'))
  check('manifest.json', manifest.background?.service_worker)
  check('manifest.json', manifest.action?.default_popup)
  check('manifest.json', manifest.options_ui?.page)
  Object.values(manifest.icons || {}).forEach(icon => check('manifest.json', icon))
  Object.values(manifest.action?.default_icon || {}).forEach(icon => check('manifest.json', icon))

  for (const file of files) {
    const content = /\.(html|js|css)$/.test(file) ? fs.readFileSync(path.join(root, file), 'utf8') : ''
    if (file.endsWith('.html'))
      for (const match of content.matchAll(/\s(?:src|href)="([^"]+)"/g)) check(file, match[1])
    if (file.endsWith('.js'))
      for (const match of content.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*)['"](\.{1,2}\/[^'"]+)['"]/g)) check(file, match[1])
  }
  return missing
}

const files = new Set(INCLUDE.flatMap(listFiles))

const missing = findMissingReferences(files)
if (missing.length > 0) {
  console.error('These files are referenced but not in the package:')
  missing.forEach(({ from, missing }) => console.error(`  ${missing}  (from ${from})`))
  process.exit(1)
}

const zip = createZip(Array.from(files).sort().map(name => {
  const fullPath = path.join(root, name)
  return { name, data: fs.readFileSync(fullPath), modified: fs.statSync(fullPath).mtime }
}))
fs.writeFileSync(outputFile, zip)

const { version } = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'))
console.log(`Built ${path.basename(outputFile)}: version ${version}, ${files.size} files, ${(zip.length / 1024).toFixed(1)} KB`)
