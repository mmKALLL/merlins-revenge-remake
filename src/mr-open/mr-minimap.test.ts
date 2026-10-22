// modMiniMap: the map image layout (drawMap), the blend from setBlendForMouseOrPlayer and the
// remake's scale fitting.
import { describe, expect, it } from 'vitest'
import { MINI_MAP, cellOrigin, fitScale, miniMapBlend, miniMapImageSize } from './mr-minimap'

describe('modMiniMap.drawMap layout', () => {
  it('one cell per room inside the border, the border wider at the right and bottom', () => {
    const { cellPx, border } = MINI_MAP
    expect(miniMapImageSize({ x: 3, y: 12 })).toEqual({ x: 3 * cellPx + border.left + border.right, y: 12 * cellPx + border.top + border.bottom })
    expect(cellOrigin({ x: 1, y: 1 })).toEqual({ x: border.left, y: border.top })
    expect(cellOrigin({ x: 3, y: 2 })).toEqual({ x: border.left + 2 * cellPx, y: border.top + cellPx })
  })
})

describe('modMiniMap.setBlendForMouseOrPlayer', () => {
  const corner = { x: 500, y: 300 }
  const [near, far] = MINI_MAP.blendDistances
  const [nearBlend, farBlend] = MINI_MAP.blendLevels

  it('maps the nearer of mouse and Merlin (GeomPixelDist: the larger axis) onto the blend levels, clamped', () => {
    expect(miniMapBlend(corner, { x: corner.x - near / 2, y: corner.y }, null)).toBe(nearBlend)
    expect(miniMapBlend(corner, { x: 0, y: 0 }, null)).toBe(farBlend)
    const halfway = (near + far) / 2
    expect(miniMapBlend(corner, { x: corner.x - halfway, y: corner.y - 1 }, null)).toBeCloseTo((nearBlend + farBlend) / 2)
    expect(miniMapBlend(corner, { x: 0, y: 0 }, { x: corner.x, y: corner.y - near })).toBe(nearBlend)
  })
})

describe('fitScale (remake)', () => {
  it('keeps the engine scale while the map fits the view, else shrinks to a whole scale, never below 1', () => {
    const view = { w: 576, h: 288 }
    expect(fitScale(miniMapImageSize({ x: 3, y: 12 }), view)).toBe(MINI_MAP.scale)
    expect(fitScale({ x: 10, y: 200 }, view)).toBe(1)
    expect(fitScale({ x: 10, y: 1000 }, view)).toBe(1)
  })
})
