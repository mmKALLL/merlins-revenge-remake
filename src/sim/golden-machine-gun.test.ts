// The golden machine gun in the sim (docs/notes/engine-mechanics-spells.md §6): collecting it, E
// switching it, every spell's gun version (the energy blast's autofire, a pulse a tick, the summons'
// faster hand-released charge), the remake's volley stream, Merlin holding the gun, and the owner's
// tuning of it (the muzzle, cBlast's rate, the pulse's rate, the mine stream, the army summon).
import { describe, expect, it } from 'vitest'
import type { ActorDef, AttackDef } from '../mr-open/mr-actor-data'
import { withUnits } from '../mr-open/mr-army'
import { gmgAttack, gmgCollected, gmgMuzzle, gmgStrip } from '../mr-open/mr-golden-machine-gun'
import type { MapDefinition } from '../mr-open/mr-map-format'
import { GOLDEN_MACHINE_GUN } from '../mr-open/mr-pickup'
import { chargeLimits } from '../mr-open/mr-spell'
import { addWeapon } from '../mr-open/mr-weapons'
import { playerOf, playerStatsOf } from './actors'
import { NO_INPUT, type ActorState, type InputSnapshot, type SimState } from './state'
import { anims, defs as engineDefs, teams } from './test-data'
import { createSim, stepSim } from './tick'
import { buildWorldGrid } from './world-grid'

/**
 * act_gmg: an objScroll like any spell's but #character #gmg and no #attack; the stand-in keeps the
 * cBlast scroll's art (its touch area), the gun's own coming from tools/copy-assets.ts.
 */
const gmgScroll: ActorDef = { ...engineDefs['cBlast']!, key: GOLDEN_MACHINE_GUN, character: GOLDEN_MACHINE_GUN }
const defs: Record<string, ActorDef> = { ...engineDefs, [GOLDEN_MACHINE_GUN]: gmgScroll }
const SYMBOLS = ['none', GOLDEN_MACHINE_GUN, 'goblinWarrior']
const ROW = 4
const PLAYER = { x: 100, y: ROW * 32 + 16 }
const RIGHT: InputSnapshot = { ...NO_INPUT, move: { x: 1, y: 0 } }
const FAR_RIGHT = { x: 560, y: PLAYER.y }
const TOGGLE: InputSnapshot = { ...NO_INPUT, toggleGun: true }
const aimAt = (at: { x: number; y: number }): InputSnapshot => ({ ...NO_INPUT, chargeHeld: true, mouseWorld: at })

/** Two open rooms: room 1 holds the objects (symbol -> column) on ROW, room 2 a goblin. */
function world(objects: Record<string, number>): SimState {
  const fill = (v: number) => Array.from({ length: 9 }, () => Array<number>(18).fill(v))
  const layers = [fill(0), fill(0)]
  for (const [symbol, col] of Object.entries(objects)) layers[0]![ROW]![col - 1] = SYMBOLS.indexOf(symbol) + 1
  layers[1]![ROW]![9] = SYMBOLS.indexOf('goblinWarrior') + 1
  const map: MapDefinition = {
    mapSize: { x: 2, y: 1 }, roomSize: { x: 18, y: 9 }, startRoom: { x: 1, y: 1 },
    layers: [{ name: 'backgroundPassive', tileSet: 'p' }, { name: 'backgroundActive', tileSet: 'a' }, { name: 'objects', tileSet: 'o' }],
    rooms: [1, 2].map((num) => ({ num, layers: { backgroundActive: fill(0), backgroundPassive: fill(1), objects: layers[num - 1]! } })),
  }
  return createSim(buildWorldGrid(map, () => false, SYMBOLS), defs, teams, anims, 1, PLAYER, 'rooms')
}

/** Merlin with the gun on, as if he had collected it. */
const withGun = (s: SimState): SimState => ({ ...s, gmg: gmgCollected(s.gmg) })
/** Merlin holding a scroll's spell, current. */
const holding = (s: SimState, spell: string): SimState => ({ ...s, arsenal: addWeapon(s.arsenal, spell, s.defs[spell]!.attack) })

const spells = (s: SimState): ActorState[] => s.actors.filter((a) => a.def === 'spell')

/** Holds the attack at `at` for `ticks` ticks; the spells released, by id, with the charge each left with, and the tick of each. */
function fire(s: SimState, ticks: number, at = FAR_RIGHT): { s: SimState; released: Map<number, number>; releasedOn: number[] } {
  const released = new Map<number, number>()
  const releasedOn: number[] = []
  for (let i = 1; i <= ticks; i++) {
    s = stepSim(s, aimAt(at))
    for (const spell of spells(s)) {
      if (spell.mode === 'charge' || released.has(spell.id)) continue
      released.set(spell.id, spell.charge)
      releasedOn.push(i)
    }
  }
  return { s, released, releasedOn }
}

/** Holds the attack (or, `held` false, nothing) for `ticks` ticks; the `bullet` actors that appeared, each with the tick it appeared on. */
function shots(s: SimState, bullet: string, ticks: number, held = true): { s: SimState; shot: ActorState[]; shotOn: number[] } {
  const seen = new Set<number>()
  const shot: ActorState[] = []
  const shotOn: number[] = []
  for (let i = 1; i <= ticks; i++) {
    s = stepSim(s, held ? aimAt(FAR_RIGHT) : { ...NO_INPUT, mouseWorld: FAR_RIGHT })
    for (const a of s.actors) {
      if (a.def !== bullet || seen.has(a.id)) continue
      seen.add(a.id)
      shot.push(a)
      shotOn.push(i)
    }
  }
  return { s, shot, shotOn }
}

const gunLimits = (s: SimState, spell: string) => chargeLimits({ ...playerStatsOf(s, playerOf(s)), attack: gmgAttack(s.defs[spell]!.attack) })

describe('the golden machine gun: a mode, switched by E', () => {
  it('collected (gmgCollected), it is on at once: no weapon of its own, no bonus energy, temporary invincibility', () => {
    let s = world({ [GOLDEN_MACHINE_GUN]: 5 })
    s = { ...s, actors: s.actors.map((a) => (a.id === s.playerId ? { ...a, energy: 100 } : a)) }
    const weapons = s.arsenal.weapons.map((w) => w.key)
    for (let i = 0; i < 300 && !s.gmg.collected; i++) s = stepSim(s, RIGHT)
    expect(s.gmg).toEqual({ collected: true, on: true })
    expect(s.arsenal.weapons.map((w) => w.key)).toEqual(weapons)
    expect(playerOf(s).energy).toBe(100)
    expect(s.pickups.invinceTicks).toBeGreaterThan(0)
  })

  it('E switches it off and on again once found, and does nothing before', () => {
    let s = stepSim(world({}), TOGGLE)
    expect(s.gmg).toEqual({ collected: false, on: false })
    s = withGun(s)
    s = stepSim(s, TOGGLE)
    expect(s.gmg.on).toBe(false)
    s = stepSim(s, TOGGLE)
    expect(s.gmg.on).toBe(true)
  })

  it('E fires nothing', () => {
    let s = withGun(world({}))
    for (let i = 0; i < 10; i++) s = stepSim(s, { ...TOGGLE, mouseWorld: FAR_RIGHT })
    expect(spells(s)).toEqual([])
  })

  it('switching it releases the spell in hand; a held attack then charges anew in the other mode', () => {
    let s = world({})
    s = withGun(stepSim(s, aimAt(FAR_RIGHT)))
    // turned on under a plain charge: that spell goes, a gun spell follows
    s = stepSim(s, aimAt(FAR_RIGHT))
    expect(spells(s).filter((a) => a.mode === 'charge')).toEqual([])
    for (let i = 0; i < 3 && !spells(s).some((a) => a.mode === 'charge'); i++) s = stepSim(s, { ...aimAt(FAR_RIGHT), toggleGun: i === 0 })
    // switched off again: the next spell charges the plain way
    const charging = spells(s).find((a) => a.mode === 'charge')!
    expect(charging.attack!.gmgOn).toBe(false)
  })

  it('Merlin holds the gun while it is on and a spell is his weapon, not while he swings a melee weapon', () => {
    let s = withGun(world({}))
    s = stepSim(s, NO_INPUT)
    expect(playerOf(s).anim.toLowerCase()).toBe(gmgStrip(false).toLowerCase())
    s = stepSim(s, RIGHT)
    expect(playerOf(s).anim.toLowerCase()).toBe(gmgStrip(true).toLowerCase())
    s = stepSim(stepSim(s, TOGGLE), NO_INPUT)
    expect(playerOf(s).anim.toLowerCase()).not.toBe(gmgStrip(false).toLowerCase())
    s = stepSim(stepSim(s, TOGGLE), { ...NO_INPUT, selectWeapon: s.defs['player']!.naturalAttack.name })
    expect(s.gmg.on).toBe(true)
    s = stepSim(s, aimAt(FAR_RIGHT))
    expect(playerOf(s).anim.toLowerCase()).not.toContain('weaponmagic')
  })
})

describe('every spell in its gun version', () => {
  it('the energy blast: held, a blast whenever the gmg charge counter finishes and the cooldown allows, one every second tick', () => {
    const s0 = withGun(world({}))
    const { released, releasedOn } = fire(s0, 12)
    const limits = gunLimits(s0, 'energyBlast')
    expect(releasedOn).toEqual([2, 4, 6, 8, 10, 12])
    for (const charge of released.values()) expect(charge).toBe(limits.start + limits.speed)
  })

  it('without the gun the energy blast keeps charging while held (no autofire)', () => {
    const { s, released } = fire(world({}), 30)
    expect(released.size).toBe(0)
    expect(spells(s)).toHaveLength(1)
  })

  it('the energy pulse (gmg charge 0 to 0, fireDelay 0, cooldown 0): a pulse every tick while held', () => {
    const s0 = withGun(holding(world({}), 'energyPulseSpell'))
    const pulse = s0.defs['energyPulseSpell']!.attack.bullet!
    const { shotOn } = shots(s0, pulse, 12)
    expect(shotOn.length).toBeGreaterThanOrEqual(10)
    expect(new Set(shotOn).size).toBe(shotOn.length) // one a tick
  })

  it('a summon (no gmgAutoFire) charges at its gmg speed and waits to be let go', () => {
    const s0 = withGun(holding(world({}), 'monsterSummon'))
    const { s, released } = fire(s0, 40)
    expect(released.size).toBe(0)
    const limits = gunLimits(s0, 'monsterSummon')
    expect(spells(s)[0]!.charge).toBeCloseTo(limits.max)
    expect(limits.speed).toBe(s0.defs['monsterSummon']!.attack.gmg!.chargeSpeed)
  })

  it('charges beside the gun, ahead of Merlin, not over his head', () => {
    let s = withGun(world({}))
    s = stepSim(s, aimAt(FAR_RIGHT))
    const p = playerOf(s)
    const spell = spells(s)[0]!
    expect(spell.pos.x).toBeGreaterThan(p.pos.x + s.defs['player']!.gmgChargeLoc.x)
    expect(spell.pos.y).toBe(p.pos.y + s.defs['player']!.gmgChargeLoc.y)
  })
})

describe('a volley in gun mode (remake): a stream', () => {
  /** Ticks one projectile takes to charge: chargePerShot over the charge speed with Merlin's mana flow. */
  const ticksPerShot = (s: SimState, spell: string): number => {
    const atk = s.defs[spell]!.attack
    return atk.volley!.chargePerShot / chargeLimits({ ...playerStatsOf(s, playerOf(s)), attack: atk }).speed
  }

  it('fires one projectile whenever the charge holds one, the first straight at the aim', () => {
    const s0 = withGun(holding(world({}), 'arrowRain'))
    const arrow = s0.defs['arrowRain']!.attack.bullet!
    const ticks = 90
    const { shot } = shots(s0, arrow, ticks)
    expect(shot.length).toBeGreaterThan(1)
    expect(Math.abs(shot.length - ticks / ticksPerShot(s0, 'arrowRain'))).toBeLessThanOrEqual(1)
    const first = shot[0]!
    const offAimDeg = (Math.atan2(first.vel.y, first.vel.x) - Math.atan2(FAR_RIGHT.y - first.pos.y, FAR_RIGHT.x - first.pos.x)) * (180 / Math.PI)
    expect(Math.abs(offAimDeg)).toBeLessThan(0.5)
  })

  it('without the gun the volley keeps charging while held', () => {
    const s0 = holding(world({}), 'arrowRain')
    expect(shots(s0, s0.defs['arrowRain']!.attack.bullet!, 90).shot).toEqual([])
  })

  it('the fireball streams fireballs of its gmgShotCharge each, their blasts grown from that charge', () => {
    const s0 = withGun(holding(world({}), 'lavaLob'))
    const atk = s0.defs['lavaLob']!.attack
    const v = atk.volley!
    expect(v.gmgShotCharge).toBeGreaterThan(v.chargePerShot)
    const ticks = 120
    const { shot } = shots(s0, atk.bullet!, ticks)
    const ticksPerFireball = v.gmgShotCharge / chargeLimits({ ...playerStatsOf(s0, playerOf(s0)), attack: atk }).speed
    expect(Math.abs(shot.length - ticks / ticksPerFireball)).toBeLessThanOrEqual(1)
    for (const rock of shot) expect(rock.attack!.explodeCharge).toBeCloseTo(v.blastFromCharge!.base + v.gmgShotCharge * v.blastFromCharge!.perCharge)
  })

  it('let go, the stream stops and what is left of its charge goes', () => {
    let s = withGun(holding(world({}), 'arrowRain'))
    s = shots(s, s.defs['arrowRain']!.attack.bullet!, 10).s
    s = stepSim(s, NO_INPUT)
    expect(spells(s)).toEqual([])
  })
})

/** The scroll's attack with remake fields set, as assets/tuning.json would (these tests' defs are the engine's). */
function tuned(s: SimState, spell: string, fields: Partial<AttackDef>): SimState {
  const def = s.defs[spell]!
  return { ...s, defs: { ...s.defs, [spell]: { ...def, attack: { ...def.attack, ...fields } } } }
}

/** The ticks between one entry and the next. */
const gaps = (ticks: number[]): number[] => ticks.slice(1).map((n, i) => n - ticks[i]!)

describe('fired through the gun (remake): from its muzzle', () => {
  /** Merlin's gun muzzle: the middle of his still gun frame's front edge, `shift` px further out. */
  const muzzle = (s: SimState, shift = 0) => {
    const p = playerOf(s)
    const frame = s.anims[s.defs['player']!.name]![gmgStrip(false)]!
    return gmgMuzzle(p.pos, { w: frame.w, h: frame.h, reg: frame.reg! }, p.facingLeft, shift)
  }

  it("the muzzle is the middle of the gun frame's front edge, mirrored when Merlin faces left", () => {
    const frame = { w: 19, h: 14, reg: { x: 9, y: 7 } }
    expect(gmgMuzzle({ x: 100, y: 50 }, frame, false, 0)).toEqual({ x: 110, y: 50 })
    expect(gmgMuzzle({ x: 100, y: 50 }, frame, true, 4)).toEqual({ x: 86, y: 50 })
  })

  it('a blast leaves from the muzzle', () => {
    let s = withGun(world({}))
    for (let i = 0; i < 4 && !spells(s).some((a) => a.mode === 'fly'); i++) s = stepSim(s, aimAt(FAR_RIGHT))
    expect(spells(s).find((a) => a.mode === 'fly')!.prevPos).toEqual(muzzle(s))
  })

  it('a pulse leaves gmgMuzzleShift px further out than the muzzle', () => {
    const s0 = withGun(holding(tuned(world({}), 'energyPulseSpell', { gmgMuzzleShift: 4 }), 'energyPulseSpell'))
    const { s, shot } = shots(s0, s0.defs['energyPulseSpell']!.attack.bullet!, 1)
    expect(shot[0]!.pos).toEqual(muzzle(s, 4))
  })

  it("a volley's projectiles leave from the muzzle", () => {
    let s = withGun(holding(world({}), 'arrowRain'))
    const arrow = s.defs['arrowRain']!.attack.bullet!
    for (let i = 0; i < 30 && !s.actors.some((a) => a.def === arrow); i++) s = stepSim(s, aimAt(FAR_RIGHT))
    expect(s.actors.find((a) => a.def === arrow)!.prevPos).toEqual(muzzle(s))
  })
})

describe('the gun versions the owner tuned (remake)', () => {
  it('gmgChargeFullTicks: the gun cBlast fires once every that many ticks', () => {
    const gmg = { ...engineDefs['cBlast']!.attack.gmg!, chargeFullTicks: 60 }
    const { releasedOn } = fire(withGun(holding(tuned(world({}), 'cBlast', { gmg }), 'cBlast')), 200)
    expect(releasedOn.length).toBeGreaterThanOrEqual(3)
    for (const gap of gaps(releasedOn)) expect(gap).toBe(60)
  })

  it('fireRateScale: a released pulse spell fires every fireDelay / scale ticks on average', () => {
    const s0 = holding(tuned(world({}), 'energyPulseSpell', { fireRateScale: 0.7 }), 'energyPulseSpell')
    const pulse = s0.defs['energyPulseSpell']!.attack.bullet!
    const charged = shots(s0, pulse, 20).s
    const { shotOn } = shots(charged, pulse, 60, false)
    const period = s0.defs['energyPulseSpell']!.attack.fireDelay / 0.7
    expect(shotOn.length).toBeGreaterThanOrEqual(4)
    for (const gap of gaps(shotOn)) expect(Math.abs(gap - period)).toBeLessThan(1)
  })

  it('gmgFireRateScale: the gun pulse fires on that share of the ticks', () => {
    const s0 = withGun(holding(tuned(world({}), 'energyPulseSpell', { gmgFireRateScale: 0.7 }), 'energyPulseSpell'))
    const { shot } = shots(s0, s0.defs['energyPulseSpell']!.attack.bullet!, 100)
    expect(Math.abs(shot.length - 70)).toBeLessThanOrEqual(1)
  })

  it('gmgStreamSlowdown: held, the gun mines send a one-mine spell every slowdown x the time a plain charge takes for one; let go, they stop', () => {
    const s0 = withGun(holding(tuned(world({}), 'energyMines', { gmgStreamSlowdown: 2 }), 'energyMines'))
    const atk = s0.defs['energyMines']!.attack
    const plainSpeed = chargeLimits({ ...playerStatsOf(s0, playerOf(s0)), attack: atk }).speed
    const ticks = 90
    const { s, released } = fire(s0, ticks)
    for (const charge of released.values()) expect(charge).toBe(atk.chargePerUnit)
    expect(Math.abs(released.size - ticks / ((2 * atk.chargePerUnit) / plainSpeed))).toBeLessThanOrEqual(1)
    const letGo = stepSim(s, NO_INPUT)
    expect(spells(letGo).filter((a) => a.mode === 'charge')).toEqual([])
  })

  it('gmgSummonsLowest: the gun army summon goes at the lowest stage with a unit in the reserve; with none it holds a blank', () => {
    const gmg = { ...engineDefs['armySummon']!.attack.gmg!, chargeMax: 38 }
    let s0 = withGun(holding(tuned(world({}), 'armySummon', { gmgSummonsLowest: true, gmg }), 'armySummon'))
    s0 = { ...s0, army: withUnits(s0.army, playerOf(s0).team, { archer: 1, monk: 1 }) }
    const atk = s0.defs['armySummon']!.attack
    const stage = (charge: number) => atk.multistage.filter((m) => m.chargeRequired <= charge).length
    const { s, released } = fire(s0, 40)
    expect([...released.values()].map(stage)).toEqual([2, 3]) // the archer, then the monk
    const held = spells(s).find((a) => a.mode === 'charge')!
    expect(stage(held.charge)).toBe(0)
  })
})
