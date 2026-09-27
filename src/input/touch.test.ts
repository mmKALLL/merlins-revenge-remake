import { describe, expect, it } from 'vitest'
import { InputTracker } from './keyboard'
import { NUB_DEAD_ZONE, nubDirection } from './touch'

describe('nubDirection', () => {
  it('does nothing inside the dead zone', () => {
    expect(nubDirection({ x: NUB_DEAD_ZONE - 1, y: 0 })).toEqual({ x: 0, y: 0 })
  })

  it('keeps the finger\'s angle, scaled so straight and diagonal drags match WASD', () => {
    const at = (deg: number) => nubDirection({ x: 40 * Math.cos((deg * Math.PI) / 180), y: 40 * Math.sin((deg * Math.PI) / 180) })
    const close = (v: { x: number; y: number }, x: number, y: number) => {
      expect(v.x).toBeCloseTo(x, 10)
      expect(v.y).toBeCloseTo(y, 10)
    }
    close(at(0), 1, 0)
    close(at(45), 1, 1) // screen y grows downward: down-right
    close(at(-135), -1, -1)
    close(at(90), 0, 1)
    const v = at(20) // between straight and diagonal: the same angle, larger axis 1
    close(v, 1, Math.tan((20 * Math.PI) / 180))
  })
})

describe('InputTracker touch input', () => {
  it('moves like the direction keys and blasts like Space, following the F toggle', () => {
    const t = new InputTracker()
    t.setTouch({ x: -1, y: 1 }, true)
    expect(t.snapshot()).toMatchObject({ move: { x: -1, y: 1 }, shootNearest: true, shootShort: false })
    t.keyDown('KeyF')
    expect(t.snapshot()).toMatchObject({ shootNearest: false, shootShort: true })
    // an analog nub move passes through while no direction key is held; a key wins
    t.setTouch({ x: 1, y: 0.25 }, false)
    expect(t.snapshot().move).toEqual({ x: 1, y: 0.25 })
    t.keyDown('KeyW')
    expect(t.snapshot().move).toEqual({ x: 0, y: -1 })
    t.keyUp('KeyW')
    t.setTouch({ x: 0, y: 0 }, false)
    expect(t.snapshot()).toMatchObject({ move: { x: 0, y: 0 }, shootNearest: false, shootShort: false })
  })
})
