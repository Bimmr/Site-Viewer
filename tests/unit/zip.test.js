// @vitest-environment node
import { describe, it, expect } from 'vitest'
import zlib from 'node:zlib'
import { createZip, crc32 } from '../../scripts/zip.js'

/**
 * Reads a zip file's entries from its central directory
 * @param {Buffer} zip - Zip file
 * @returns {Array<{name: string, data: Buffer, crc: number}>}
 */
function readZip(zip) {
  const end = zip.length - 22
  expect(zip.readUInt32LE(end)).toBe(0x06054b50)
  const count = zip.readUInt16LE(end + 10)
  let position = zip.readUInt32LE(end + 16)

  const entries = []
  for (let i = 0; i < count; i++) {
    expect(zip.readUInt32LE(position)).toBe(0x02014b50)
    const method = zip.readUInt16LE(position + 10)
    const crc = zip.readUInt32LE(position + 16)
    const compressedSize = zip.readUInt32LE(position + 20)
    const nameLength = zip.readUInt16LE(position + 28)
    const localOffset = zip.readUInt32LE(position + 42)
    const name = zip.toString('utf8', position + 46, position + 46 + nameLength)

    expect(zip.readUInt32LE(localOffset)).toBe(0x04034b50)
    const dataStart = localOffset + 30 + zip.readUInt16LE(localOffset + 26)
    const stored = zip.subarray(dataStart, dataStart + compressedSize)
    entries.push({ name, crc, data: method === 8 ? zlib.inflateRawSync(stored) : stored })

    position += 46 + nameLength
  }
  return entries
}

describe('crc32', () => {
  it('matches the standard check value', () => {
    expect(crc32(Buffer.from('123456789'))).toBe(0xCBF43926)
  })
})

describe('createZip', () => {
  it('writes files that read back unchanged', () => {
    const files = [
      { name: 'manifest.json', data: Buffer.from('{"name": "Test"}'.repeat(20)) },
      { name: 'js/lib/ü.js', data: Buffer.from('export const a = 1\n') },
      { name: 'icons/icon.png', data: Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]) }
    ]
    const entries = readZip(createZip(files))

    expect(entries.map(entry => entry.name)).toEqual(files.map(file => file.name))
    entries.forEach((entry, i) => {
      expect(entry.data.equals(files[i].data)).toBe(true)
      expect(entry.crc).toBe(crc32(files[i].data))
    })
  })
})
