// Minimal decoder for uncompressed 8-bit paletted and 24-bit Windows BMPs.
// Merlin frames are 8-bit (e.g. anm_mer_walk_3_01 is 16x16, anm_mer_naturalMelee_* are 20x16).
export interface RgbaImage {
  width: number
  height: number
  rgba: Uint8Array
}

export function decodeBmp(buf: Buffer, transparent: [number, number, number] = [255, 255, 255]): RgbaImage {
  if (buf.toString('ascii', 0, 2) !== 'BM') throw new Error('not a BMP')
  const dataOffset = buf.readUInt32LE(10)
  const headerSize = buf.readUInt32LE(14)
  const width = buf.readInt32LE(18)
  const heightRaw = buf.readInt32LE(22)
  const bpp = buf.readUInt16LE(28)
  const compression = buf.readUInt32LE(30)
  if (headerSize < 40) throw new Error(`unsupported BMP header size ${headerSize} (need BITMAPINFOHEADER or later)`)
  if (compression !== 0) throw new Error(`unsupported BMP compression ${compression}`)
  const height = Math.abs(heightRaw)
  const bottomUp = heightRaw > 0
  const rowBytes = Math.floor((width * bpp + 31) / 32) * 4
  const needed = dataOffset + rowBytes * height
  if (buf.length < needed) throw new Error(`truncated BMP: ${buf.length} bytes, need ${needed}`)
  const rgba = new Uint8Array(width * height * 4)

  const palette: [number, number, number][] = []
  if (bpp === 8) {
    const colours = buf.readUInt32LE(46) || 256
    const palOff = 14 + headerSize
    for (let i = 0; i < colours; i++) {
      const o = palOff + i * 4
      palette.push([buf[o + 2]!, buf[o + 1]!, buf[o]!]) // stored BGR
    }
  } else if (bpp !== 24) {
    throw new Error(`unsupported BMP bpp ${bpp}`)
  }

  for (let y = 0; y < height; y++) {
    const srcRow = bottomUp ? height - 1 - y : y
    const rowOff = dataOffset + srcRow * rowBytes
    for (let x = 0; x < width; x++) {
      let r: number, g: number, b: number
      if (bpp === 8) {
        ;[r, g, b] = palette[buf[rowOff + x]!] ?? [0, 0, 0]
      } else {
        const o = rowOff + x * 3
        ;[b, g, r] = [buf[o]!, buf[o + 1]!, buf[o + 2]!]
      }
      const a = r === transparent[0] && g === transparent[1] && b === transparent[2] ? 0 : 255
      const d = (y * width + x) * 4
      rgba[d] = r
      rgba[d + 1] = g
      rgba[d + 2] = b
      rgba[d + 3] = a
    }
  }
  return { width, height, rgba }
}
