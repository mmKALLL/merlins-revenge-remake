import { describe, expect, it } from 'vitest'
import { buildAtlas, parseFrameName } from './atlas'

describe('parseFrameName', () => {
  it('splits anm_<chr>_<anim>_<delay>_<frame>.bmp', () => {
    expect(parseFrameName('anm_mer_walk_3_01.bmp')).toEqual({ chr: 'mer', anim: 'walk', delay: 3, frame: 1 })
    expect(parseFrameName('anm_mer_naturalMelee_3_07.bmp')).toEqual({ chr: 'mer', anim: 'naturalMelee', delay: 3, frame: 7 })
    expect(parseFrameName('notes.txt')).toBeNull()
  })
})

describe('buildAtlas', () => {
  it('packs frames in a row per animation and records rects', () => {
    const px = (w: number, h: number) => ({ width: w, height: h, rgba: new Uint8Array(w * h * 4).fill(255) })
    const atlas = buildAtlas([
      { name: 'anm_mer_walk_3_02.bmp', image: px(16, 16) },
      { name: 'anm_mer_walk_3_01.bmp', image: px(16, 16) },
      { name: 'anm_mer_grave_3_01.bmp', image: px(20, 16) },
    ])
    expect(Object.keys(atlas.animations).sort()).toEqual(['grave', 'walk'])
    expect(atlas.animations['walk']!.delay).toBe(3)
    expect(atlas.animations['walk']!.frames).toEqual([
      { x: 0, y: 0, w: 16, h: 16 },
      { x: 16, y: 0, w: 16, h: 16 },
    ])
    expect(atlas.animations['grave']!.frames[0]!.y).toBe(16)
    expect(atlas.sheet.width).toBe(32)
    expect(atlas.sheet.height).toBe(32)
  })
})
