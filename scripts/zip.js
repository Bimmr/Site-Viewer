import zlib from 'node:zlib'

// CRC-32 lookup table, as used by zip files
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

/**
 * Calculates the CRC-32 checksum of data
 * @param {Buffer} data - Data to check
 * @returns {number} Unsigned CRC-32
 */
export function crc32(data) {
  let crc = 0xFFFFFFFF
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xFF] ^ (crc >>> 8)
  return (crc ^ 0xFFFFFFFF) >>> 0
}

/**
 * Converts a date to the DOS time and date fields zip files use
 * @param {Date} date - Date to convert
 * @returns {{time: number, date: number}}
 */
function toDosDateTime(date) {
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  }
}

/**
 * Creates a zip file
 * Each file is deflated, or stored as-is if deflating doesn't make it smaller (e.g. images)
 * @param {Array<{name: string, data: Buffer, modified?: Date}>} files - Files, named with / separated paths
 * @returns {Buffer} The zip file
 */
export function createZip(files) {
  const localParts = []
  const centralParts = []
  let offset = 0

  for (const { name, data, modified = new Date() } of files) {
    const nameBuffer = Buffer.from(name, 'utf8')
    const deflated = zlib.deflateRawSync(data, { level: 9 })
    const isDeflated = deflated.length < data.length
    const stored = isDeflated ? deflated : data
    const checksum = crc32(data)
    const { time, date } = toDosDateTime(modified)

    // Shared by the local and central headers: version needed, flags (UTF-8 names), method, time, date, CRC, sizes
    const common = Buffer.alloc(26)
    common.writeUInt16LE(20, 0)
    common.writeUInt16LE(0x0800, 2)
    common.writeUInt16LE(isDeflated ? 8 : 0, 4)
    common.writeUInt16LE(time, 6)
    common.writeUInt16LE(date, 8)
    common.writeUInt32LE(checksum, 10)
    common.writeUInt32LE(stored.length, 14)
    common.writeUInt32LE(data.length, 18)
    common.writeUInt16LE(nameBuffer.length, 22)
    common.writeUInt16LE(0, 24)

    const localHeader = Buffer.alloc(4)
    localHeader.writeUInt32LE(0x04034b50, 0)
    localParts.push(localHeader, common, nameBuffer, stored)

    const centralHeader = Buffer.alloc(6)
    centralHeader.writeUInt32LE(0x02014b50, 0)
    centralHeader.writeUInt16LE(20, 4)
    // Comment length, disk number, internal and external attributes, local header offset
    const centralTail = Buffer.alloc(14)
    centralTail.writeUInt32LE(offset, 10)
    centralParts.push(centralHeader, common, centralTail, nameBuffer)

    offset += 4 + common.length + nameBuffer.length + stored.length
  }

  const central = Buffer.concat(centralParts)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(central.length, 12)
  end.writeUInt32LE(offset, 16)

  return Buffer.concat([...localParts, central, end])
}
