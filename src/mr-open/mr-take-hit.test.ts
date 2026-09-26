import { describe, expect, it } from 'vitest'
import type { ActorDef } from './mr-actor-data'
import { isDead, reelFinished, regenStep, resolveHit, stallStep } from './mr-take-hit'

const victim = (inertia: number): ActorDef => ({ inertia } as ActorDef)

describe('resolveHit', () => {
  it('warrior (inertia 30) hit by (2.8, 0) x2 takes push (1.96, 0) and damage 3.92', () => {
    const r = resolveHit(victim(30), { x: 2.8, y: 0 }, 2)
    expect(r.push.x).toBeCloseTo(1.96)
    expect(r.push.y).toBe(0)
    expect(r.damage).toBeCloseTo(3.92)
  })
  it('player (inertia 0) hit by an arrow push (4, 0) x3 takes 12', () => {
    expect(resolveHit(victim(0), { x: 4, y: 0 }, 3)).toEqual({ push: { x: 4, y: 0 }, damage: 12 })
  })
  it('archer (inertia 50) hit by a punch (16, 0) x1 takes 8', () => {
    expect(resolveHit(victim(50), { x: -16, y: 0 }, 1)).toEqual({ push: { x: -8, y: 0 }, damage: 8 })
  })
  it('damage uses the Manhattan length', () => {
    expect(resolveHit(victim(0), { x: 3, y: -4 }, 1).damage).toBe(7)
  })
})

describe('stall and reel', () => {
  it('reaches 10 after ten slow ticks', () => {
    let s = 0
    for (let i = 0; i < 10; i++) {
      expect(reelFinished(s)).toBe(false)
      s = stallStep(s, { x: 0.1, y: 0.1 })
    }
    expect(s).toBe(10)
    expect(reelFinished(s)).toBe(true)
  })
  it('resets on movement above 0.2', () => {
    expect(stallStep(7, { x: 0.15, y: 0.1 })).toBe(0)
    expect(stallStep(7, { x: 0, y: 0 })).toBe(8)
  })
})

describe('regenStep', () => {
  it('adds 1 every 300 ticks', () => {
    let e = 50
    let c = 0
    for (let i = 0; i < 299; i++) {
      ;[e, c] = regenStep(e, 100, c, 300)
      expect(e).toBe(50)
    }
    ;[e, c] = regenStep(e, 100, c, 300)
    expect([e, c]).toEqual([51, 0])
  })
  it('does nothing when dead or full', () => {
    expect(regenStep(0, 100, 299, 300)).toEqual([0, 0])
    expect(regenStep(100, 100, 299, 300)).toEqual([100, 0])
  })
  it('isDead at energy <= 0', () => {
    expect(isDead(0)).toBe(true)
    expect(isDead(0.5)).toBe(false)
  })
})
