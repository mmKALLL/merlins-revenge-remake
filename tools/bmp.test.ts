import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { decodeBmp } from './bmp'

describe('decodeBmp', () => {
  it('decodes an 8-bit Merlin frame to RGBA with white transparent', () => {
    const img = decodeBmp(readFileSync('assets/sprites/merlin/anm_mer_walk_3_01.bmp'))
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

  it('decodes a 20x16 melee frame', () => {
    const img = decodeBmp(readFileSync('assets/sprites/merlin/anm_mer_naturalMelee_3_01.bmp'))
    expect(img.width).toBe(20)
    expect(img.height).toBe(16)
    expect(img.rgba.length).toBe(20 * 16 * 4)
  })
})
