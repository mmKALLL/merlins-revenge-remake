import { describe, expect, it } from 'vitest'
import { InputTracker } from './keyboard'
import { NUB_DEAD_ZONE, nubDirection, TouchState, wantsTouchControls } from './touch'

describe('wantsTouchControls', () => {
  /** A window whose media queries match as `features` says. */
  const device = (features: { coarse: boolean; anyHover: boolean }) => ({
    matchMedia: (q: string) => ({ matches: q === '(pointer: coarse)' ? features.coarse : q === '(any-hover: none)' ? !features.anyHover : false }) as MediaQueryList,
  })
  const none = new URLSearchParams()

  it('shows them on a touch-only phone or tablet', () => {
    expect(wantsTouchControls(none, device({ coarse: true, anyHover: false }))).toBe(true)
  })

  it('not where any pointer can hover: a desktop, or a touchscreen laptop or tablet with a mouse', () => {
    expect(wantsTouchControls(none, device({ coarse: false, anyHover: true }))).toBe(false)
    expect(wantsTouchControls(none, device({ coarse: true, anyHover: true }))).toBe(false)
  })

  it('?touch=1 and ?touch=0 force them on or off', () => {
    expect(wantsTouchControls(new URLSearchParams('touch=1'), device({ coarse: false, anyHover: true }))).toBe(true)
    expect(wantsTouchControls(new URLSearchParams('touch=0'), device({ coarse: true, anyHover: false }))).toBe(false)
  })
})

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
  it('moves like the direction keys and blasts like Space, following the Space mode', () => {
    const t = new InputTracker()
    t.setTouch({ x: -1, y: 1 }, true)
    expect(t.snapshot()).toMatchObject({ move: { x: -1, y: 1 }, shootNearest: true, shootFarthest: false })
    t.keyDown('KeyF')
    expect(t.snapshot()).toMatchObject({ shootNearest: false, shootFarthest: true })
    // an analog nub move passes through while no direction key is held; a key wins
    t.setTouch({ x: 1, y: 0.25 }, false)
    expect(t.snapshot().move).toEqual({ x: 1, y: 0.25 })
    t.keyDown('KeyW')
    expect(t.snapshot().move).toEqual({ x: 0, y: -1 })
    t.keyUp('KeyW')
    t.setTouch({ x: 0, y: 0 }, false)
    expect(t.snapshot()).toMatchObject({ move: { x: 0, y: 0 }, shootNearest: false, shootFarthest: false })
  })

  it('the army button is R once per tap, at the nearest enemy even in mouse mode', () => {
    const t = new InputTracker('mouse')
    t.touchArmy()
    expect(t.snapshot()).toMatchObject({ armyKey: true, armyAtNearest: true })
    expect(t.snapshot()).toMatchObject({ armyKey: false, armyAtNearest: false })
    // R itself keeps the mouse in mouse mode
    t.keyDown('KeyR')
    expect(t.snapshot()).toMatchObject({ armyKey: true, armyAtNearest: false })
  })

  it('in mouse mode blasts at the mouse when one is known, else at the nearest enemy', () => {
    const t = new InputTracker('mouse')
    t.setTouch({ x: 0, y: 0 }, true)
    expect(t.snapshot()).toMatchObject({ chargeHeld: false, shootNearest: true })
    // a mouse appearing mid-charge does not switch the shot (that would release it)
    t.setMouseWorld({ x: 10, y: 20 })
    expect(t.snapshot()).toMatchObject({ chargeHeld: false, shootNearest: true })
    t.setTouch({ x: 0, y: 0 }, false)
    t.setTouch({ x: 0, y: 0 }, true)
    expect(t.snapshot()).toMatchObject({ chargeHeld: true, shootNearest: false, shootFarthest: false })
  })
})

describe('TouchState', () => {
  const FAR = 40 // well past the dead zone

  it('a press whose release never arrived cannot wedge the nub or the blast button', () => {
    const t = new TouchState()
    t.nubDown(1, { x: 100, y: 100 })
    t.blastDown(2) // neither finger's pointerup arrives
    t.nubDown(3, { x: 50, y: 50 })
    expect(t.nubMove(1, { x: 100 + FAR, y: 100 })).toBeNull() // the stale finger no longer drives it
    expect(t.nubMove(3, { x: 50, y: 50 + FAR })).toEqual({ x: 0, y: FAR })
    expect(t.move).toEqual({ x: 0, y: 1 })
    t.blastDown(4)
    expect(t.pointerUp(2)).toBe(false) // a late release of the stale finger keeps the new press
    expect(t.blast).toBe(true)
    expect(t.pointerUp(4)).toBe(true)
    expect(t.blast).toBe(false)
  })

  it('a release or cancel of an unknown finger changes nothing; of a known one, lets go', () => {
    const t = new TouchState()
    t.nubDown(1, { x: 0, y: 0 })
    t.nubMove(1, { x: FAR, y: 0 })
    expect(t.pointerUp(7)).toBe(false)
    expect(t.move).toEqual({ x: 1, y: 0 })
    expect(t.pointerUp(1)).toBe(true)
    expect(t).toMatchObject({ move: { x: 0, y: 0 }, nubHeld: false })
    expect(t.nubMove(1, { x: FAR, y: 0 })).toBeNull()
  })

  it('releaseAll (no finger left, a menu opening) lets go of everything once', () => {
    const t = new TouchState()
    t.nubDown(1, { x: 0, y: 0 })
    t.nubMove(1, { x: -FAR, y: 0 })
    t.blastDown(2)
    expect(t.releaseAll()).toBe(true)
    expect(t).toMatchObject({ move: { x: 0, y: 0 }, blast: false, nubHeld: false })
    expect(t.releaseAll()).toBe(false)
  })
})
