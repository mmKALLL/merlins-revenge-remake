import { describe, expect, it } from 'vitest'
import type { RgbaImage } from './bmp'
import { FRAME_GAP, packSprites, parseFrameName, type AtlasRect, type AtlasFrame } from './atlas'

describe('parseFrameName', () => {
  it('splits anm_<chr>_<anim>_<delay>_<frame>.bmp', () => {
    expect(parseFrameName('anm_mer_walk_3_01.bmp')).toEqual({ chr: 'mer', anim: 'walk', delay: 3, frame: 1 })
    expect(parseFrameName('anm_mer_naturalMelee_3_07.bmp')).toEqual({ chr: 'mer', anim: 'naturalMelee', delay: 3, frame: 7 })
    expect(parseFrameName('notes.txt')).toBeNull()
  })
})

/** A w x h image whose every pixel is the colour `seed` (alpha 255), so frames can be told apart on a page. */
const solid = (w: number, h: number, seed: number): RgbaImage => {
  const rgba = new Uint8Array(w * h * 4)
  for (let i = 0; i < w * h; i++) rgba.set([seed & 0xff, (seed >> 8) & 0xff, 7, 255], i * 4)
  return { width: w, height: h, rgba }
}

/** The pixels of `rect` on its page. */
const cut = (pages: RgbaImage[], r: AtlasRect): Uint8Array => {
  const page = pages[r.page]!
  const out = new Uint8Array(r.w * r.h * 4)
  for (let y = 0; y < r.h; y++) out.set(page.rgba.subarray(((r.y + y) * page.width + r.x) * 4, ((r.y + y) * page.width + r.x + r.w) * 4), y * r.w * 4)
  return out
}

/** Many frames of mixed sizes over a few sprites, enough to fill several small pages. */
function manySprites(): Record<string, AtlasFrame[]> {
  const sprites: Record<string, AtlasFrame[]> = {}
  let seed = 1
  for (const sprite of ['mer', 'golem', 'pitMonster']) {
    sprites[sprite] = []
    for (const anim of ['walk', 'attack']) {
      for (let f = 1; f <= 12; f++) {
        const image = solid(8 + ((seed * 7) % 40), 6 + ((seed * 13) % 50), seed++)
        sprites[sprite].push({ name: `anm_${sprite}_${anim}_3_${String(f).padStart(2, '0')}.png`, image })
      }
    }
  }
  return sprites
}

describe('packSprites', () => {
  it('keeps each strip in frame order with its delays and reg points', () => {
    const bundle = packSprites({
      bowOrc: [
        { name: 'anm_bowOrc_weaponRanged_04_02.png', image: solid(26, 27, 2) },
        { name: 'anm_bowOrc_weaponRanged_02_01.png', image: solid(26, 27, 1), reg: { x: 13, y: 10 } },
        { name: 'anm_bowOrc_grave_3_01.png', image: solid(20, 16, 3) },
      ],
    })
    const strip = bundle.sprites['bowOrc']!.animations['weaponRanged']!
    expect(Object.keys(bundle.sprites['bowOrc']!.animations)).toEqual(['weaponRanged', 'grave'])
    expect(strip.delay).toBe(2)
    expect(strip.frames.map((f) => f.delay)).toEqual([2, 4])
    expect(strip.frames[0]!.reg).toEqual({ x: 13, y: 10 })
    expect(strip.frames[1]!.reg).toBeUndefined()
    expect(cut(bundle.pages, strip.frames[0]!)).toEqual(solid(26, 27, 1).rgba)
  })

  it('puts every frame inside its page, apart from the others, with its own pixels', () => {
    const sprites = manySprites()
    const pageSize = 128
    const bundle = packSprites(sprites, pageSize)
    expect(bundle.pages.length).toBeGreaterThan(1)
    for (const page of bundle.pages) expect(Math.max(page.width, page.height)).toBeLessThanOrEqual(pageSize)
    const rects: AtlasRect[] = []
    for (const [sprite, frames] of Object.entries(sprites)) {
      const animations = bundle.sprites[sprite]!.animations
      for (const anim of ['walk', 'attack']) {
        animations[anim]!.frames.forEach((r, i) => {
          const page = bundle.pages[r.page]!
          expect(r.x + r.w <= page.width && r.y + r.h <= page.height, `${sprite} ${anim} ${i} inside its page`).toBe(true)
          const source = frames.find((f) => parseFrameName(f.name)!.anim === anim && parseFrameName(f.name)!.frame === i + 1)!
          expect(cut(bundle.pages, r)).toEqual(source.image.rgba)
          rects.push(r)
        })
      }
    }
    const apart = (a: AtlasRect, b: AtlasRect) =>
      a.page !== b.page || a.x + a.w + FRAME_GAP <= b.x || b.x + b.w + FRAME_GAP <= a.x || a.y + a.h + FRAME_GAP <= b.y || b.y + b.h + FRAME_GAP <= a.y
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) expect(apart(rects[i]!, rects[j]!)).toBe(true)
  })

  it('round-trips through JSON', () => {
    const { sprites } = packSprites(manySprites(), 128)
    expect(JSON.parse(JSON.stringify(sprites))).toEqual(sprites)
  })

  it('refuses a frame larger than a page', () => {
    expect(() => packSprites({ big: [{ name: 'anm_big_walk_3_01.png', image: solid(200, 10, 1) }] }, 128)).toThrow(/does not fit/)
  })
})
