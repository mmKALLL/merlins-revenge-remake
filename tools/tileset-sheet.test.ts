import { describe, expect, it } from 'vitest'
import { tileCapacity, tilesPerRow, usesWhiteTransparency, whiteToAlpha } from './tileset-sheet'

describe('tilesPerRow', () => {
  it('ignores the trailing sliver, like Lingo integer division', () => {
    expect(tilesPerRow(351, 32)).toBe(10)
    expect(tilesPerRow(256, 32)).toBe(8)
    expect(tilesPerRow(224, 32)).toBe(7)
    expect(tilesPerRow(320, 32)).toBe(10)
  })
})

describe('tileCapacity', () => {
  it('counts full columns times full rows', () => {
    expect(tileCapacity(351, 447, { x: 32, y: 32 })).toBe(130)
    expect(tileCapacity(256, 608, { x: 32, y: 32 })).toBe(152)
  })
})

describe('whiteToAlpha', () => {
  it('clears alpha on pure white only and leaves the input untouched', () => {
    const rgba = new Uint8Array([255, 255, 255, 255, 254, 255, 255, 255, 0, 0, 0, 255])
    const out = whiteToAlpha({ width: 3, height: 1, rgba })
    expect([...out.rgba]).toEqual([255, 255, 255, 0, 254, 255, 255, 255, 0, 0, 0, 255])
    expect(rgba[3]).toBe(255)
    expect(out.width).toBe(3)
    expect(out.height).toBe(1)
  })
})

describe('usesWhiteTransparency', () => {
  it('is false for Passive sheets and true for the rest', () => {
    expect(usesWhiteTransparency('merlin4Passive')).toBe(false)
    expect(usesWhiteTransparency('merlinOpenActive')).toBe(true)
    expect(usesWhiteTransparency('merlin4Objects')).toBe(true)
  })
})
