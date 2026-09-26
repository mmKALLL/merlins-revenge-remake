import { describe, expect, it } from 'vitest'
import { buildPlaceholderTileset } from './placeholder-tileset'

describe('buildPlaceholderTileset', () => {
  it('lays out 10 tiles per row, 32 px each', () => {
    const symbols = ['none', 'solid', 'none', 'solid', 'none', 'none', 'none', 'none', 'none', 'none', 'solid', 'none']
    const img = buildPlaceholderTileset(symbols, { x: 32, y: 32 })
    expect(img.width).toBe(320)
    expect(img.height).toBe(64)
    // centre pixel of tile 2 (solid) is dark grey
    const px = (tx: number, ty: number) => {
      const i = ((ty * 32 + 16) * img.width + tx * 32 + 16) * 4
      return [img.rgba[i], img.rgba[i + 1], img.rgba[i + 2], img.rgba[i + 3]]
    }
    expect(px(1, 0)).toEqual([60, 60, 60, 255])
    // an open tile is fully opaque and not dark grey
    expect(px(0, 0)[3]).toBe(255)
    expect(px(0, 0)).not.toEqual([60, 60, 60, 255])
  })
})
