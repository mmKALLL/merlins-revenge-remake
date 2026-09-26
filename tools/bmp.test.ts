import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { decodeBmp } from './bmp'

// Builds a minimal uncompressed BMP (BITMAPINFOHEADER) in memory. `rows` are given top to bottom.
function makeBmp(opts: {
  width: number
  height: number
  bpp: 1 | 8 | 24
  bottomUp: boolean
  palette?: [number, number, number][]
  rows: number[][] // 8-bit: palette indices; 24-bit: flat r,g,b triples per row
}): Buffer {
  const { width, height, bpp, bottomUp, palette = [], rows } = opts
  const rowBytes = Math.floor((width * bpp + 31) / 32) * 4
  const palBytes = palette.length * 4
  const dataOffset = 14 + 40 + palBytes
  const buf = Buffer.alloc(dataOffset + rowBytes * height)
  buf.write('BM', 0, 'ascii')
  buf.writeUInt32LE(buf.length, 2)
  buf.writeUInt32LE(dataOffset, 10)
  buf.writeUInt32LE(40, 14)
  buf.writeInt32LE(width, 18)
  buf.writeInt32LE(bottomUp ? height : -height, 22)
  buf.writeUInt16LE(1, 26)
  buf.writeUInt16LE(bpp, 28)
  buf.writeUInt32LE(0, 30)
  buf.writeUInt32LE(palette.length, 46)
  palette.forEach(([r, g, b], i) => {
    const o = 54 + i * 4
    buf[o] = b
    buf[o + 1] = g
    buf[o + 2] = r
  })
  rows.forEach((row, y) => {
    const fileRow = bottomUp ? height - 1 - y : y
    const off = dataOffset + fileRow * rowBytes
    if (bpp === 8) {
      row.forEach((idx, x) => (buf[off + x] = idx))
    } else if (bpp === 1) {
      row.forEach((bit, x) => (buf[off + (x >> 3)]! |= bit << (7 - (x & 7))))
    } else {
      for (let x = 0; x < width; x++) {
        buf[off + x * 3] = row[x * 3 + 2]! // b
        buf[off + x * 3 + 1] = row[x * 3 + 1]! // g
        buf[off + x * 3 + 2] = row[x * 3]! // r
      }
    }
  })
  return buf
}

describe('decodeBmp', () => {
  it('decodes a 3x2 24-bit bottom-up image with padded rows to exact RGBA', () => {
    const buf = makeBmp({
      width: 3,
      height: 2,
      bpp: 24,
      bottomUp: true,
      rows: [
        [255, 0, 0, 0, 255, 0, 0, 0, 255], // red, green, blue
        [255, 255, 255, 10, 20, 30, 0, 0, 0], // white (transparent), grey-ish, black
      ],
    })
    // 3 px * 3 bytes = 9 data bytes per row, padded to 12
    expect(buf.length).toBe(54 + 12 * 2)
    const img = decodeBmp(buf)
    expect(img.width).toBe(3)
    expect(img.height).toBe(2)
    expect([...img.rgba]).toEqual([
      255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255,
      255, 255, 255, 0, 10, 20, 30, 255, 0, 0, 0, 255,
    ])
  })

  it('decodes a 5x2 8-bit paletted top-down image to exact RGBA', () => {
    const buf = makeBmp({
      width: 5,
      height: 2,
      bpp: 8,
      bottomUp: false,
      palette: [
        [0, 0, 0],
        [255, 255, 255],
        [1, 2, 3],
      ],
      rows: [
        [0, 1, 2, 2, 0],
        [2, 0, 0, 1, 2],
      ],
    })
    // 5 data bytes per row, padded to 8
    expect(buf.length).toBe(54 + 3 * 4 + 8 * 2)
    const img = decodeBmp(buf)
    expect(img.width).toBe(5)
    expect(img.height).toBe(2)
    expect([...img.rgba]).toEqual([
      0, 0, 0, 255, 255, 255, 255, 0, 1, 2, 3, 255, 1, 2, 3, 255, 0, 0, 0, 255,
      1, 2, 3, 255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255, 0, 1, 2, 3, 255,
    ])
  })

  it('decodes a 10x2 1-bit paletted bottom-up image, most significant bit first', () => {
    const buf = makeBmp({
      width: 10,
      height: 2,
      bpp: 1,
      bottomUp: true,
      palette: [
        [255, 255, 255],
        [0, 0, 0],
      ],
      rows: [
        [1, 0, 0, 0, 0, 0, 0, 0, 1, 1],
        [0, 1, 0, 0, 0, 0, 0, 0, 0, 1],
      ],
    })
    const img = decodeBmp(buf)
    expect(img.width).toBe(10)
    const alpha = [...img.rgba].filter((_, i) => i % 4 === 3).map((a) => (a === 255 ? 1 : 0))
    expect(alpha).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1])
    expect([...img.rgba.subarray(0, 4)]).toEqual([0, 0, 0, 255])
  })

  it('decodes the 1-bit spell charge frame with white transparent', () => {
    const img = decodeBmp(readFileSync('assets/sprites/spell/anm_spell_charge_03_01.bmp'))
    expect(img.width).toBe(63)
    expect(img.height).toBe(63)
    let opaque = 0
    for (let i = 3; i < img.rgba.length; i += 4) if (img.rgba[i] === 255) opaque++
    expect(opaque).toBeGreaterThan(50)
    expect(opaque).toBeLessThan(63 * 63)
  })

  it('rejects a truncated BMP', () => {
    const buf = makeBmp({
      width: 3,
      height: 2,
      bpp: 24,
      bottomUp: true,
      rows: [
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
      ],
    })
    expect(() => decodeBmp(buf.subarray(0, buf.length - 1))).toThrow(/truncated BMP/)
  })

  it('rejects a BMP with a header older than BITMAPINFOHEADER', () => {
    const buf = makeBmp({ width: 1, height: 1, bpp: 24, bottomUp: true, rows: [[0, 0, 0]] })
    buf.writeUInt32LE(12, 14)
    expect(() => decodeBmp(buf)).toThrow(/header size/)
  })

  it('decodes an 8-bit Merlin frame to RGBA with white transparent', () => {
    const img = decodeBmp(readFileSync('assets/sprites/mer/anm_mer_walk_3_01.bmp'))
    expect(img.width).toBe(16)
    expect(img.height).toBe(16)
    expect(img.rgba.length).toBe(16 * 16 * 4)
    // top-left pixel is white in the source, so alpha 0
    expect(img.rgba[3]).toBe(0)
    // at least one opaque pixel exists
    let opaque = 0
    for (let i = 3; i < img.rgba.length; i += 4) if (img.rgba[i] === 255) opaque++
    expect(opaque).toBeGreaterThan(50)
  })

  it('decodes a 20x16 24-bit melee frame', () => {
    const img = decodeBmp(readFileSync('assets/sprites/mer/anm_mer_naturalMelee_3_01.bmp'))
    expect(img.width).toBe(20)
    expect(img.height).toBe(16)
    expect(img.rgba.length).toBe(20 * 16 * 4)
    // top-left pixel is white in the source, so alpha 0
    expect(img.rgba[3]).toBe(0)
  })
})
