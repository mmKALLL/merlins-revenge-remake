import { describe, expect, it } from 'vitest'
import { InputTracker } from './keyboard'
import { NUB_DEAD_ZONE, nubDirection } from './touch'

describe('nubDirection', () => {
  it('does nothing inside the dead zone', () => {
    expect(nubDirection({ x: NUB_DEAD_ZONE - 1, y: 0 })).toEqual({ x: 0, y: 0 })
  })

  it('maps the finger to the nearest of the eight WASD directions', () => {
    const at = (deg: number) => nubDirection({ x: 40 * Math.cos((deg * Math.PI) / 180), y: 40 * Math.sin((deg * Math.PI) / 180) })
    expect(at(0)).toEqual({ x: 1, y: 0 })
    expect(at(20)).toEqual({ x: 1, y: 0 })
    expect(at(30)).toEqual({ x: 1, y: 1 }) // screen y grows downward: down-right
    expect(at(90)).toEqual({ x: 0, y: 1 })
    expect(at(-135)).toEqual({ x: -1, y: -1 })
    expect(at(180)).toEqual({ x: -1, y: 0 })
  })
})

describe('InputTracker touch input', () => {
  it('moves like the direction keys and blasts like Space, following the F toggle', () => {
    const t = new InputTracker()
    t.setTouch({ x: -1, y: 1 }, true)
    expect(t.snapshot()).toMatchObject({ move: { x: -1, y: 1 }, shootNearest: true, shootShort: false })
    t.keyDown('KeyF')
    expect(t.snapshot()).toMatchObject({ shootNearest: false, shootShort: true })
    t.setTouch({ x: 0, y: 0 }, false)
    expect(t.snapshot()).toMatchObject({ move: { x: 0, y: 0 }, shootNearest: false, shootShort: false })
  })
})
