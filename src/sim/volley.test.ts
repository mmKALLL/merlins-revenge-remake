// Remake volley spells (docs/notes/engine-mechanics-spells.md, Volley spells): the count from the
// charge and its cap by the charge max, the fan, the stagger, first-hostile hits (dwellings too), the
// landing of exploding projectiles on the aim and the damage.
import { describe, expect, it } from 'vitest'
import type { ActorDef, AttackDef, VolleyDef } from '../mr-open/mr-actor-data'
import type { MapDefinition } from '../mr-open/mr-map-format'
import { chargeLimits } from '../mr-open/mr-spell'
import { addWeapon } from '../mr-open/mr-weapons'
import { createActor } from './actors'
import { NO_INPUT, type InputSnapshot, type SimState } from './state'
import { anims, defs as engineDefs, teams } from './test-data'
import { createSim, stepSim } from './tick'
import { shotAngleDeg, smoothShots, volleyBallPx, volleyIconStack, volleyShots, volleySpreadDeg } from './volley'
import { buildWorldGrid } from './world-grid'

const VOLLEY: VolleyDef = { chargePerShot: 2, maxShots: 4, rangeFactor: 1, damageMultiplier: 1, staggerTicks: 2, spreadMinDeg: 10, spreadMaxDeg: 32, speedJitter: 0.05, spread: 'random' }

describe('volley rules', () => {
  it('fires one projectile, one more per chargePerShot of charge, at most maxShots', () => {
    expect([0, 1.9, 2, 3.9, 4, 6, 50].map((c) => volleyShots(c, VOLLEY))).toEqual([1, 1, 2, 2, 3, 4, 4])
  })

  it("holds the charge max where the most projectiles are reached, so a smaller mana capacity reaches fewer", () => {
    const attack = { ...engineDefs['boltFan']!.attack, chargeMaxModifier: 1, chargeMaxBasic: 0, volley: { ...VOLLEY, maxShots: 10 } }
    const merlin = (capacity: number): ActorDef => ({ ...engineDefs['player']!, mana_capacity: capacity, attack })
    expect(chargeLimits(merlin(100)).max).toBe(18) // (10 - 1) * 2
    expect(volleyShots(chargeLimits(merlin(9)).max, attack.volley)).toBeLessThan(volleyShots(chargeLimits(merlin(15)).max, attack.volley))
  })

  it('widens the fan from the narrowest at 1-2 projectiles to the widest at maxShots', () => {
    const v = { ...VOLLEY, maxShots: 10 }
    expect(volleySpreadDeg(1, v)).toBe(v.spreadMinDeg)
    expect(volleySpreadDeg(2, v)).toBe(v.spreadMinDeg)
    expect(volleySpreadDeg(6, v)).toBeGreaterThan(v.spreadMinDeg)
    expect(volleySpreadDeg(10, v)).toBe(v.spreadMaxDeg)
  })

  it('a random fan sends the first projectile exactly at the aim and the others anywhere inside it', () => {
    const v = { ...VOLLEY, maxShots: 10 }
    for (const count of [1, 3, 10]) {
      const half = volleySpreadDeg(count, v) / 2
      for (const u of [0, 0.3, 0.999]) expect(shotAngleDeg(0, count, v, u)).toBe(0)
      for (let i = 1; i < count; i++) for (const u of [0, 0.5, 0.999]) expect(Math.abs(shotAngleDeg(i, count, v, u))).toBeLessThanOrEqual(half)
    }
    expect(shotAngleDeg(1, 3, v, 0)).not.toBe(shotAngleDeg(1, 3, v, 0.999))
  })

  it('an even fan spaces the projectiles equally from one edge to the other, whatever the roll', () => {
    const v: VolleyDef = { ...VOLLEY, maxShots: 10, spread: 'even' }
    expect(shotAngleDeg(0, 1, v, 0.7)).toBe(0)
    const count = 5
    const angles = Array.from({ length: count }, (_, i) => shotAngleDeg(i, count, v, Math.random()))
    const half = volleySpreadDeg(count, v) / 2
    expect(angles[0]).toBeCloseTo(-half)
    expect(angles[count - 1]).toBeCloseTo(half)
    const gaps = angles.slice(1).map((a, i) => a - angles[i]!)
    for (const g of gaps) expect(g).toBeCloseTo(gaps[0]!)
  })

  it('stacks one icon per projectile up to five, and a "+" for more', () => {
    expect(volleyIconStack(3)).toEqual({ icons: 3, more: false })
    expect(volleyIconStack(5)).toEqual({ icons: 5, more: false })
    expect(volleyIconStack(6)).toEqual({ icons: 5, more: true })
  })
})

// ---- in the sim ----

const SYMBOLS = ['none', 'goblinWarrior']
const PLAYER = { x: 100, y: 4 * 32 + 16 }
const SPELL_Y = PLAYER.y - 8 // the charge loc
/** A stand-in volley scroll: crossbow bolts with the rules above (no tuning pinned). */
const SCROLL = 'testVolley'
const defs: Record<string, ActorDef> = {
  ...engineDefs,
  player: { ...engineDefs['player']!, damageDealtMultiplier: 2 },
  dummy: { ...engineDefs['goblinWarrior']!, key: 'dummy', inertia: 0, energy: 1e6, maxEnergy: 1e6, walkSpeed: 0, aiType: null },
}
const scrollAttack = (o: Partial<VolleyDef> = {}): AttackDef => ({
  ...engineDefs['boltFan']!.attack, chargeSpeed: 1, chargeMaxModifier: 1, chargeMaxBasic: 0, volley: { ...VOLLEY, speedJitter: 0, ...o },
})

/** Three open rooms, a goblin far off in room 3 so the map is not complete; Merlin holds the test volley. */
function world(attack: AttackDef): SimState {
  const fill = (v: number) => Array.from({ length: 9 }, () => Array<number>(18).fill(v))
  const objects = [fill(0), fill(0), fill(0)]
  objects[2]![4]![9] = 2
  const map: MapDefinition = {
    mapSize: { x: 3, y: 1 }, roomSize: { x: 18, y: 9 }, startRoom: { x: 1, y: 1 },
    layers: [{ name: 'backgroundPassive', tileSet: 'p' }, { name: 'backgroundActive', tileSet: 'a' }, { name: 'objects', tileSet: 'o' }],
    rooms: [1, 2, 3].map((num) => ({ num, layers: { backgroundActive: fill(0), backgroundPassive: fill(1), objects: objects[num - 1]! } })),
  }
  const s = createSim(buildWorldGrid(map, () => false, SYMBOLS), defs, teams, anims, 1, PLAYER, 'rooms')
  return { ...s, arsenal: addWeapon(s.arsenal, SCROLL, attack) }
}

/** A stationary goblin that cannot die (or another unit `key`), at `x` on the spell's line. */
function withDummy(s: SimState, x: number, key = 'dummy'): [SimState, number] {
  const [d, after] = createActor(s, key, { x, y: SPELL_Y })
  return [{ ...after, actors: [...after.actors, d] }, d.id]
}

const aim: InputSnapshot = { ...NO_INPUT, mouseWorld: { x: PLAYER.x + 200, y: SPELL_Y } }
const bolts = (s: SimState): number => s.actors.filter((a) => a.def === 'crossBolt').length
const energyOf = (s: SimState, id: number): number => s.actors.find((a) => a.id === id)!.energy

/** Charges for `ticks` ticks, releases, and returns the state on the release tick. */
function release(s: SimState, ticks: number): SimState {
  for (let i = 0; i < ticks; i++) s = stepSim(s, { ...aim, chargeHeld: true })
  return stepSim(s, aim)
}

describe('volleys in the sim', () => {
  it('fires its projectiles one every staggerTicks from the release, then the spell is gone', () => {
    let s = release(world(scrollAttack()), 10) // full charge: 4 projectiles
    const fired = [bolts(s)]
    for (let i = 0; i < 7; i++) {
      s = stepSim(s, aim)
      fired.push(bolts(s))
    }
    expect(fired).toEqual([1, 1, 2, 2, 3, 3, 4, 4])
    expect(s.actors.some((a) => a.def === 'spell')).toBe(false)
  })

  it('a projectile hits the first hostile it touches and stops there; the one behind is spared', () => {
    let s = world(scrollAttack())
    let near: number
    let far: number
    ;[s, near] = withDummy(s, PLAYER.x + 40)
    ;[s, far] = withDummy(s, PLAYER.x + 70)
    s = release(s, 1) // a tap: one projectile
    for (let i = 0; i < 40; i++) s = stepSim(s, aim)
    expect(energyOf(s, near)).toBeLessThan(1e6)
    expect(energyOf(s, far)).toBe(1e6)
  })

  it('a projectile hits a dwelling too (the spell\'s hit roles, not the bullet\'s own)', () => {
    let s = world(scrollAttack())
    let dwelling: number
    ;[s, dwelling] = withDummy(s, PLAYER.x + 50, 'skeletonDwelling')
    const before = energyOf(s, dwelling)
    s = release(s, 1)
    for (let i = 0; i < 40; i++) s = stepSim(s, aim)
    expect(energyOf(s, dwelling)).toBeLessThan(before)
  })

  it('the first projectile that explodes on landing lands on the aim when the aim is in range', () => {
    const bombs = { ...engineDefs['bombVolley']!.attack, chargeSpeed: 1, chargeMaxModifier: 1, chargeMaxBasic: 0 }
    for (const dist of [40, 70]) {
      const at: InputSnapshot = { ...NO_INPUT, mouseWorld: { x: PLAYER.x + dist, y: SPELL_Y } }
      let s = world(bombs)
      s = stepSim(s, { ...at, chargeHeld: true })
      s = stepSim(s, at)
      let landed: { x: number; y: number } | undefined
      for (let i = 0; i < 60 && !landed; i++) {
        s = stepSim(s, at)
        landed = s.actors.find((a) => a.def === 'bomb' && a.mode === 'explode')?.pos
      }
      expect(landed).toBeDefined()
      // the spell stands a little above the charge loc; the aim is level with the charge loc
      expect(Math.abs(landed!.x - at.mouseWorld!.x)).toBeLessThan(6)
    }
  })

  it("deals the bullet's damage times Merlin's damageDealtMultiplier and the volley's damageMultiplier", () => {
    const dealt = (attack: AttackDef): number => {
      let s = world(attack)
      let id: number
      ;[s, id] = withDummy(s, PLAYER.x + 40)
      s = release(s, 1) // a tap: one projectile
      for (let i = 0; i < 40; i++) s = stepSim(s, aim)
      return 1e6 - energyOf(s, id)
    }
    const once = dealt(scrollAttack({ spreadMinDeg: 0 }))
    expect(once).toBeGreaterThan(0)
    expect(dealt(scrollAttack({ spreadMinDeg: 0, damageMultiplier: 2 }))).toBeCloseTo(once * 2)
    const unscaled = { ...defs, player: { ...defs['player']!, damageDealtMultiplier: 1 } }
    let s = world(scrollAttack({ spreadMinDeg: 0 }))
    s = { ...s, defs: unscaled }
    let id: number
    ;[s, id] = withDummy(s, PLAYER.x + 40)
    s = release(s, 1)
    for (let i = 0; i < 40; i++) s = stepSim(s, aim)
    expect(once).toBeCloseTo((1e6 - energyOf(s, id)) * 2)
  })
})

describe('the charging ball (remake)', () => {
  it('grows smoothly with the charge while the icons step up one by one', () => {
    const sizes = [0, 0.5, 1, 1.5, 1.99, 2.5, 3].map((charge) => volleyBallPx(0, smoothShots(charge, VOLLEY)))
    for (let i = 1; i < sizes.length; i++) expect(sizes[i]!).toBeGreaterThan(sizes[i - 1]!)
    expect(volleyShots(1.99, VOLLEY)).toBe(1) // the icon count only steps at the threshold
  })
})

