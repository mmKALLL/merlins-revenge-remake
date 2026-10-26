// Remake volley spells (docs/notes/engine-mechanics-spells.md, Volley spells): the count from the
// charge and its cap by the charge max, the fan, the stagger, first-hostile hits (dwellings too), the
// landing of exploding projectiles on the aim, the damage, the chill, the pierce and the fireball's growing blast.
import { describe, expect, it } from 'vitest'
import type { ActorDef, AttackDef, VolleyDef } from '../mr-open/mr-actor-data'
import type { MapDefinition } from '../mr-open/mr-map-format'
import { chargeLimits, explodeWithCharge } from '../mr-open/mr-spell'
import { addWeapon } from '../mr-open/mr-weapons'
import { createActor } from './actors'
import { NO_INPUT, type InputSnapshot, type SimState } from './state'
import { anims, defs as engineDefs, teams } from './test-data'
import { createSim, stepSim } from './tick'
import { ICON_ROW_SHIFT, blastCharge, iconRows, iconStackPx, iconStackSize, shotAngleDeg, volleyBallPx, volleyFullCharge, volleyIconPx, volleyProjectileAttack, volleyShots, volleySpreadDeg } from './volley'
import { buildWorldGrid } from './world-grid'

const VOLLEY: VolleyDef = { chargePerShot: 2, maxShots: 4, rangeFactor: 1, damageMultiplier: 1, staggerTicks: 2, spreadMinDeg: 10, spreadMaxDeg: 32, speedJitter: 0.05, minLandingSpeedShare: 0.5, launchFrom: 'spell', spread: 'random', chill: 0, pierce: 0, fullCharge: 0, blastFromCharge: null, burstOnContact: false, growingIconPx: 0 }

describe('volley rules', () => {
  it('fires one projectile per chargePerShot of charge, none below the first, at most maxShots', () => {
    expect([0, 1.9, 2, 3.9, 4, 8, 50].map((c) => volleyShots(c, VOLLEY))).toEqual([0, 0, 1, 1, 2, 4, 4])
  })

  it("holds the charge max where the most projectiles are reached, so a smaller mana capacity reaches fewer", () => {
    const attack = { ...engineDefs['boltFan']!.attack, chargeMaxModifier: 1, chargeMaxBasic: 0, volley: { ...VOLLEY, maxShots: 10 } }
    const merlin = (capacity: number): ActorDef => ({ ...engineDefs['player']!, mana_capacity: capacity, attack })
    expect(chargeLimits(merlin(100)).max).toBe(20) // 10 * 2
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

  it('stacks one icon per projectile in rows of five, with no cap but the shots', () => {
    expect([0, 1, 5, 6, 10, 11, 18].map(iconRows)).toEqual([0, 1, 1, 2, 2, 3, 4])
    // each further row shifts the stack's box by ICON_ROW_SHIFT
    const five = iconStackSize(5)
    expect(iconStackSize(18)).toEqual({ w: five.w + 3 * ICON_ROW_SHIFT.x, h: five.h + 3 * ICON_ROW_SHIFT.y })
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

/** Charge ticks for one projectile of the test volley (chargeSpeed 1, chargePerShot 2), short of a second. */
const ONE_SHOT_TICKS = 3

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

  it('a tap below the first projectile fires nothing', () => {
    let s = release(world(scrollAttack()), 1)
    for (let i = 0; i < 5; i++) s = stepSim(s, aim)
    expect(bolts(s)).toBe(0)
    expect(s.actors.some((a) => a.def === 'spell')).toBe(false)
  })

  it('a projectile hits the first hostile it touches and stops there; the one behind is spared', () => {
    let s = world(scrollAttack())
    let near: number
    let far: number
    ;[s, near] = withDummy(s, PLAYER.x + 40)
    ;[s, far] = withDummy(s, PLAYER.x + 70)
    s = release(s, ONE_SHOT_TICKS) // one projectile
    for (let i = 0; i < 40; i++) s = stepSim(s, aim)
    expect(energyOf(s, near)).toBeLessThan(1e6)
    expect(energyOf(s, far)).toBe(1e6)
  })

  it('a projectile hits a dwelling too (the spell\'s hit roles, not the bullet\'s own)', () => {
    let s = world(scrollAttack())
    let dwelling: number
    ;[s, dwelling] = withDummy(s, PLAYER.x + 50, 'skeletonDwelling')
    const before = energyOf(s, dwelling)
    s = release(s, ONE_SHOT_TICKS)
    for (let i = 0; i < 40; i++) s = stepSim(s, aim)
    expect(energyOf(s, dwelling)).toBeLessThan(before)
  })

  const bombLanding = (dist: number): number => {
    const bombs = { ...engineDefs['bombVolley']!.attack, chargeSpeed: 1, chargeMaxModifier: 1, chargeMaxBasic: 0 }
    const at: InputSnapshot = { ...NO_INPUT, mouseWorld: { x: PLAYER.x + dist, y: SPELL_Y } }
    let s = world(bombs)
    for (let i = 0; i < ONE_SHOT_TICKS; i++) s = stepSim(s, { ...at, chargeHeld: true })
    s = stepSim(s, at)
    let landed: { x: number; y: number } | undefined
    for (let i = 0; i < 60 && !landed; i++) {
      s = stepSim(s, at)
      landed = s.actors.find((a) => a.def === 'bomb' && a.mode === 'explode')?.pos
    }
    expect(landed).toBeDefined()
    return landed!.x - PLAYER.x
  }

  it('the first projectile that explodes on landing lands on the aim when the aim is in range', () => {
    // the spell stands a little above the charge loc; the aim is level with the charge loc
    for (const dist of [60, 90]) expect(Math.abs(bombLanding(dist) - dist)).toBeLessThan(6)
  })

  it('a close aim is overshot: the launch keeps at least minLandingSpeedShare of the full speed', () => {
    expect(bombLanding(5)).toBeGreaterThan(15)
  })

  it("deals the bullet's damage times Merlin's damageDealtMultiplier and the volley's damageMultiplier", () => {
    const dealt = (attack: AttackDef): number => {
      let s = world(attack)
      let id: number
      ;[s, id] = withDummy(s, PLAYER.x + 40)
      s = release(s, ONE_SHOT_TICKS) // one projectile
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
    s = release(s, ONE_SHOT_TICKS)
    for (let i = 0; i < 40; i++) s = stepSim(s, aim)
    expect(once).toBeCloseTo((1e6 - energyOf(s, id)) * 2)
  })

  it('a piercing projectile flies on through `pierce` hostiles, hitting each once, and stops at the next', () => {
    const lineHit = (pierce: number): number[] => {
      let s = world(scrollAttack({ spreadMinDeg: 0, pierce }))
      const ids: number[] = []
      for (const dx of [40, 60, 80]) {
        let id: number
        ;[s, id] = withDummy(s, PLAYER.x + dx)
        ids.push(id)
      }
      s = release(s, ONE_SHOT_TICKS)
      for (let i = 0; i < 40; i++) s = stepSim(s, aim)
      return ids.map((id) => 1e6 - energyOf(s, id))
    }
    const [first, second, third] = lineHit(1)
    expect(second).toBeGreaterThan(0)
    expect(third).toBe(0)
    expect(first).toBeCloseTo(lineHit(0)[0]!) // hit once, as a projectile that stops there
  })

  it('a chilling volley freezes what it hits, glowing teal; a plain one does not', () => {
    const struck = (chill: number) => {
      let s = world(scrollAttack({ spreadMinDeg: 0, chill }))
      let id: number
      ;[s, id] = withDummy(s, PLAYER.x + 40)
      s = release(s, ONE_SHOT_TICKS)
      for (let i = 0; i < 40 && energyOf(s, id) === 1e6; i++) s = stepSim(s, aim)
      return s.actors.find((a) => a.id === id)!
    }
    const chilled = struck(4)
    expect(chilled.freezeTicks).toBeGreaterThan(0)
    expect(chilled.glowTeal).toBe(true)
    expect(struck(0).freezeTicks).toBe(0)
  })
})

describe('the fireball (remake, blastFromCharge)', () => {
  /** The fireball scroll's own data, charging fast enough to reach its full charge in under a second. */
  const fireball = (): AttackDef => ({ ...engineDefs['lavaLob']!.attack, chargeSpeed: 2, chargeMaxModifier: 10 })
  const fireballVolley = (): VolleyDef => fireball().volley!
  /** Charge ticks for a quick tap (just past the projectile's charge) and for the full charge. */
  const TAP_TICKS = 2
  const FULL_TICKS = 25

  /** Charges for `ticks`, releases at a point `dist` px ahead (a dummy there when `target`), and returns the blast and the dummy's damage. */
  function blast(ticks: number, dist: number, target: boolean): { radius: number; at: number; damage: number; rocks: number } {
    const at: InputSnapshot = { ...NO_INPUT, mouseWorld: { x: PLAYER.x + dist, y: SPELL_Y } }
    let s = world(fireball())
    let id = -1
    if (target) [s, id] = withDummy(s, PLAYER.x + dist)
    for (let i = 0; i < ticks; i++) s = stepSim(s, { ...at, chargeHeld: true })
    const rocks = new Set<number>()
    let ev: { radius: number; x: number } | undefined
    for (let i = 0; i < 80; i++) {
      s = stepSim(s, at)
      for (const a of s.actors) if (a.def === 'flamingRock') rocks.add(a.id)
      const e = s.events.find((x) => x.kind === 'explode')
      if (e && e.kind === 'explode' && !ev) ev = { radius: e.radius, x: e.pos.x - PLAYER.x }
    }
    expect(ev).toBeDefined()
    return { radius: ev!.radius, at: ev!.x, damage: target ? 1e6 - energyOf(s, id) : 0, rocks: rocks.size }
  }

  it('fires a single projectile, however long it was charged', () => {
    expect(blast(TAP_TICKS, 80, false).rocks).toBe(1)
    expect(blast(FULL_TICKS, 80, false).rocks).toBe(1)
  })

  it('charges on past its one projectile to its own fullCharge; other volleys stop at maxShots x chargePerShot', () => {
    const merlin = (attack: AttackDef): ActorDef => ({ ...engineDefs['player']!, mana_capacity: 100, attack })
    expect(chargeLimits(merlin(fireball())).max).toBe(fireballVolley().fullCharge)
    expect(volleyFullCharge(VOLLEY)).toBe(VOLLEY.maxShots * VOLLEY.chargePerShot)
  })

  it('lands on the aim and explodes there', () => {
    for (const dist of [60, 90]) expect(Math.abs(blast(FULL_TICKS, dist, false).at - dist)).toBeLessThan(6)
  })

  it("its blast grows with the charge at release (radius blastCharge / 2), and its damage with it", () => {
    const tap = blast(TAP_TICKS, 80, true)
    const full = blast(FULL_TICKS, 80, true)
    expect(full.radius).toBeCloseTo(blastCharge(fireballVolley().fullCharge, fireballVolley())! / 2)
    expect(full.radius).toBeGreaterThan(tap.radius * 2)
    expect(full.damage).toBeGreaterThan(tap.damage * 2)
  })

  it('bursts on the first hostile it touches on its way, the blast its only hit', () => {
    const at: InputSnapshot = { ...NO_INPUT, mouseWorld: { x: PLAYER.x + 120, y: SPELL_Y } }
    let s = world(fireball())
    let id: number
    ;[s, id] = withDummy(s, PLAYER.x + 50)
    for (let i = 0; i < TAP_TICKS; i++) s = stepSim(s, { ...at, chargeHeld: true })
    let burstAt: number | undefined
    for (let i = 0; i < 80; i++) {
      s = stepSim(s, at)
      const e = s.events.find((x) => x.kind === 'explode')
      if (e && e.kind === 'explode' && burstAt === undefined) burstAt = e.pos.x - PLAYER.x
    }
    expect(burstAt).toBeLessThan(60) // at the dummy, short of the aim
    expect(energyOf(s, id)).toBeLessThan(1e6)
  })

  it('spreads its damage more evenly than the engine blast (blastFalloff), and its icon grows instead of a ball', () => {
    const v = fireballVolley()
    const atk = volleyProjectileAttack(engineDefs['flamingRock']!.attack, ['teamMembers'], v, v.fullCharge)
    const pushAt = (a: AttackDef, dist: number) => {
      const p = explodeWithCharge({ x: 0, y: 0 }, a.explodeCharge, a, [{ id: 1, pos: { x: dist, y: 0 }, radius: 0 }]).pushes[0]!.push
      return Math.hypot(p.x, p.y)
    }
    const radius = atk.explodeCharge / 2
    const engine = { ...atk, blastFalloff: 1 }
    expect(pushAt(atk, radius * 0.9) / pushAt(atk, 0.01)).toBeGreaterThan(pushAt(engine, radius * 0.9) / pushAt(engine, 0.01))
    expect(volleyIconPx(0, v)).toBeLessThan(volleyIconPx(v.fullCharge, v))
    expect(volleyIconPx(v.fullCharge, v)).toBe(v.growingIconPx)
    expect(volleyIconPx(10, VOLLEY)).toBe(volleyIconPx(0, VOLLEY))
  })

  it("leaves other volleys' projectiles with their bullet's own explosion", () => {
    expect(blastCharge(10, VOLLEY)).toBeNull()
    expect(volleyProjectileAttack(engineDefs['bomb']!.attack, ['teamMembers'], VOLLEY, 10).explodeCharge).toBe(engineDefs['bomb']!.attack.explodeCharge)
  })
})

describe('the charging ball (remake)', () => {
  it('grows linearly with the charge and always holds the icon stack', () => {
    for (const maxShots of [10, 18]) {
      const v = { ...VOLLEY, maxShots }
      const charges = Array.from({ length: maxShots * 2 + 1 }, (_, i) => i)
      const sizes = charges.map((c) => volleyBallPx(c, 0.1, v))
      const steps = sizes.slice(1).map((px, i) => px - sizes[i]!)
      for (const step of steps) expect(step).toBeCloseTo(steps[0]!)
      for (const c of charges) expect(volleyBallPx(c, 0.1, v)).toBeGreaterThan(iconStackPx(volleyShots(c, v)))
    }
  })
})


describe("Merlin's lingering blasts (remake, explosionsLinger)", () => {
  /** Damage to a unit that steps into a bomb's blast a few ticks after it went off; `merlins`: the bomb is Merlin's. */
  const lateDamage = (merlins: boolean): number => {
    let s = world(scrollAttack())
    s = { ...s, defs: { ...s.defs, player: { ...s.defs['player']!, explosionsLinger: true } } }
    const at = { x: PLAYER.x + 120, y: SPELL_Y }
    const player = s.actors.find((a) => a.id === s.playerId)!
    const [bomb, after] = createActor(s, 'bomb', at)
    const owned = { ...bomb, mode: 'fly' as const, ownerId: merlins ? s.playerId : null, team: player.team }
    s = { ...after, actors: [...after.actors, owned] }
    for (let i = 0; i < 4; i++) s = stepSim(s, NO_INPUT) // it stalls at once and explodes
    expect(s.actors.find((a) => a.id === owned.id)?.mode).toBe('explode')
    let id: number
    ;[s, id] = withDummy(s, at.x)
    s = stepSim(s, NO_INPUT)
    return 1e6 - energyOf(s, id)
  }

  it("hits a unit that enters Merlin's blast while it plays; an enemy's blast is over after its first tick", () => {
    expect(lateDamage(true)).toBeGreaterThan(0)
    expect(lateDamage(false)).toBe(0)
  })
})
