import { describe, expect, it } from 'vitest'
import type { ActorDef, AttackDef } from './mr-actor-data'
import { arrivedAtTarget, chargeLimits, chargeLoc, chargeStep, explode, releaseVelocity } from './mr-spell'

const energyBlast: AttackDef = {
  name: 'energyBlast', type: 'magic', animType: 'magic', animFrame: [2], collisionLoc: { x: 0, y: -8 }, idealAttackLoc: { x: 0, y: -8 },
  reach: 9999, cooldown: 30, power: 0.75, damageMultiplier: 1, bullet: null, firingType: 'proportional', hits: ['teamMembers'],
  chargeStart: 0, chargeMax: 999, chargeMaxBasic: 5, chargeMaxModifier: 0.75, chargeSpeed: 1, chargeSize: 1, chargeExplodeFactor: 4, explodeCharge: 10,
  chargeColour: { r: 255, g: 200, b: 0 }, spellSpeed: 20, limitMagic: false, sound: null, releaseSound: 'spell_release', explodeSound: 'spell_explode',
  volume: 150, chargeVolumeMap: { charge: [1, 100], vol: [10, 255] },
}
const player = { key: 'player', mana_capacity: 10, mana_burst: 1, mana_flow: 1, mana_regeneration: 30, attack: energyBlast } as ActorDef

describe('charging', () => {
  it('player limits are start 1, max 12.5, speed 1', () => {
    expect(chargeLimits(player)).toEqual({ start: 1, max: 12.5, speed: 1 })
  })
  it('limitMagic scales the max by the magic limit percentage', () => {
    const limited = { ...player, attack: { ...energyBlast, limitMagic: true } }
    expect(chargeLimits(limited, 40)).toEqual({ start: 1, max: 5, speed: 1 })
    expect(chargeLimits(limited)).toEqual({ start: 1, max: 12.5, speed: 1 })
  })
  it('the charge start is clamped to the max', () => {
    expect(chargeLimits({ ...player, mana_burst: 50 }).start).toBe(12.5)
  })
  it('reaches full charge in 12 steps and pins there', () => {
    const { start, max, speed } = chargeLimits(player)
    let c = start
    for (let i = 0; i < 12; i++) c = chargeStep(c, speed, max)
    expect(c).toBe(12.5)
    expect(chargeStep(c, speed, max)).toBe(12.5)
  })
  it('chargeLoc mirrors collisionLoc by facing', () => {
    const def = { attack: { ...energyBlast, collisionLoc: { x: 3, y: -8 } } } as ActorDef
    expect(chargeLoc({ x: 10, y: 10 }, def, false)).toEqual({ x: 13, y: 2 })
    expect(chargeLoc({ x: 10, y: 10 }, def, true)).toEqual({ x: 7, y: 2 })
  })
})

describe('flight', () => {
  it('release velocity has length spellSpeed toward the target', () => {
    expect(releaseVelocity({ x: 0, y: 0 }, { x: 30, y: 40 }, 20)).toEqual({ x: 12, y: 16 })
    expect(releaseVelocity({ x: 5, y: 5 }, { x: 5, y: 5 }, 20)).toEqual({ x: 0, y: 0 })
  })
  it('arrives once past the target on both axes', () => {
    const target = { x: 100, y: 50 }
    const vel = { x: 12, y: 16 }
    expect(arrivedAtTarget({ x: 0, y: 0 }, target, vel)).toBe(false)
    expect(arrivedAtTarget({ x: 101, y: 40 }, target, vel)).toBe(false) // past on x only
    expect(arrivedAtTarget({ x: 101, y: 51 }, target, vel)).toBe(true)
    expect(arrivedAtTarget({ x: 100, y: 50 }, target, vel)).toBe(true) // exactly on it
    expect(arrivedAtTarget({ x: 100, y: 0 }, target, { x: 0, y: 16 })).toBe(false) // idle axis ignored
    expect(arrivedAtTarget({ x: 100, y: 60 }, target, { x: 0, y: 16 })).toBe(true)
  })
})

describe('explode', () => {
  it('full charge 12.5 explodes to radius 25', () => {
    expect(explode({ x: 0, y: 0 }, 12.5, energyBlast, []).radius).toBe(25)
  })
  it('a victim of radius 8 at distance 10 gets a push of length (25 + 8 - 10) * 0.75 = 17.25 away from the centre', () => {
    const r = explode({ x: 0, y: 0 }, 12.5, energyBlast, [{ id: 1, pos: { x: 6, y: 8 }, radius: 8 }])
    expect(r.pushes).toHaveLength(1)
    const p = r.pushes[0]!.push
    expect(Math.hypot(p.x, p.y)).toBeCloseTo(17.25)
    expect(p.x).toBeCloseTo(17.25 * 0.6)
    expect(p.y).toBeCloseTo(17.25 * 0.8)
  })
  it('a victim at distance 40 is untouched', () => {
    const r = explode({ x: 0, y: 0 }, 12.5, energyBlast, [{ id: 1, pos: { x: 40, y: 0 }, radius: 8 }])
    expect(r.pushes).toEqual([])
  })
  it('a victim at the exact edge (dist = radius + r) is untouched, 1 px closer is hit', () => {
    expect(explode({ x: 0, y: 0 }, 12.5, energyBlast, [{ id: 1, pos: { x: 33, y: 0 }, radius: 8 }]).pushes).toEqual([])
    const r = explode({ x: 0, y: 0 }, 12.5, energyBlast, [{ id: 1, pos: { x: 32, y: 0 }, radius: 8 }])
    expect(r.pushes[0]!.push).toEqual({ x: 0.75, y: 0 })
  })
  it('a victim exactly on the centre is nudged by point(0,1) and pushed straight down with the full (radius + r) * power', () => {
    const r = explode({ x: 0, y: 0 }, 12.5, energyBlast, [{ id: 1, pos: { x: 0, y: 0 }, radius: 16 }])
    expect(r.pushes[0]!.push).toEqual({ x: 0, y: (25 + 16) * 0.75 })
  })
  it('throws on a non-scalar power', () => {
    expect(() => explode({ x: 0, y: 0 }, 12.5, { ...energyBlast, power: { x: 1, y: 0 } }, [])).toThrow()
  })
})
