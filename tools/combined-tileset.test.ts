import { describe, expect, it } from 'vitest'
import type { RgbaImage } from './bmp'
import { combineTilesets } from './combined-tileset'

const TILE = { x: 2, y: 2 }

/** A sheet of `perRow` x `rows` tiles, each filled with its own 1-based index as the red channel. */
function sheet(perRow: number, rows: number): RgbaImage {
  const width = perRow * TILE.x
  const height = rows * TILE.y
  const rgba = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) rgba[(y * width + x) * 4] = Math.floor(y / TILE.y) * perRow + Math.floor(x / TILE.x) + 1
  }
  return { width, height, rgba }
}

const redOfTile = (img: RgbaImage, perRow: number, index: number): number =>
  img.rgba[((Math.floor((index - 1) / perRow) * TILE.y) * img.width + ((index - 1) % perRow) * TILE.x) * 4]!

describe('combineTilesets', () => {
  it('puts each part from its offset, keys and tiles alike', () => {
    const combined = combineTilesets([
      { name: 'a', symbols: ['solid', 'none', 'solid'], sheet: sheet(3, 1), offset: 0 },
      { name: 'b', symbols: ['none', 'solid', 'none', 'solid'], sheet: sheet(2, 2), offset: 5 },
    ], TILE, 4)
    expect(combined.symbols).toEqual(['solid', 'none', 'solid', 'none', 'none', 'none', 'solid', 'none', 'solid'])
    expect([1, 2, 3].map((i) => redOfTile(combined.sheet, 4, i))).toEqual([1, 2, 3])
    expect([6, 7, 8, 9].map((i) => redOfTile(combined.sheet, 4, i))).toEqual([1, 2, 3, 4])
  })

  it('refuses a part that runs into the next', () => {
    expect(() => combineTilesets([
      { name: 'a', symbols: ['solid', 'solid'], sheet: sheet(2, 1), offset: 0 },
      { name: 'b', symbols: ['solid'], sheet: sheet(1, 1), offset: 1 },
    ], TILE, 2)).toThrow(/more than fit/)
  })
})
