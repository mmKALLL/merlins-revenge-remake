import { describe, expect, it } from 'vitest'
import { bulletHits, bulletStalled } from './mr-bullet'

describe('bulletHits', () => {
  // arrow 8x8 collision rect around (100, 100); target collision rect offsets -16..16
  const bullet = { left: 96, top: 96, right: 104, bottom: 104 }
  const cr = { left: -16, top: -16, right: 16, bottom: 16 }
  it('hits when the rects overlap', () => {
    expect(bulletHits(bullet, { x: 100, y: 100 }, cr)).toBe(true)
    expect(bulletHits(bullet, { x: 119, y: 100 }, cr)).toBe(true) // grown right edge 120 exclusive
    expect(bulletHits(bullet, { x: 80, y: 100 }, cr)).toBe(true) // grown left edge 80 inclusive
  })
  it('misses when 1 px apart', () => {
    expect(bulletHits(bullet, { x: 120, y: 100 }, cr)).toBe(false)
    expect(bulletHits(bullet, { x: 79, y: 100 }, cr)).toBe(false)
    expect(bulletHits(bullet, { x: 100, y: 120 }, cr)).toBe(false)
  })
})

describe('bulletStalled', () => {
  it('lands when both axes are under 2 px/tick', () => {
    expect(bulletStalled({ x: 1.9, y: -1.9 })).toBe(true)
    expect(bulletStalled({ x: 2, y: 0 })).toBe(false)
    expect(bulletStalled({ x: 0, y: -2.5 })).toBe(false)
  })
})
