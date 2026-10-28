// The golden machine gun in the sim (docs/notes/engine-mechanics-spells.md §6): collecting it, its
// autofire (a blast whenever the gmg charge counter finishes and the cooldown allows), the charge
// beside the gun, and putting it away by picking another weapon.
import { describe, expect, it } from 'vitest'
import type { ActorDef } from '../mr-open/mr-actor-data'
import { GMG_SPELL, gmgAttack } from '../mr-open/mr-golden-machine-gun'
import type { MapDefinition } from '../mr-open/mr-map-format'
import { GOLDEN_MACHINE_GUN } from '../mr-open/mr-pickup'
import { chargeLimits } from '../mr-open/mr-spell'
import { addWeapon } from '../mr-open/mr-weapons'
import { playerOf } from './actors'
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

/** Merlin holding the gun, as if he had collected it. */
const withGun = (s: SimState): SimState => ({ ...s, arsenal: addWeapon(s.arsenal, GOLDEN_MACHINE_GUN, gmgAttack(s.defs['player']!.attack)) })

const spells = (s: SimState): ActorState[] => s.actors.filter((a) => a.def === 'spell')

/** Holds the attack at `at` for `ticks` ticks; the spells released, by id, with the charge each left with. */
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

describe('the golden machine gun', () => {
  it('collected (gmgCollected), it is on at once: a weapon of its own, current, with no bonus energy but temporary invincibility', () => {
    let s = world({ [GOLDEN_MACHINE_GUN]: 5 })
    s = { ...s, actors: s.actors.map((a) => (a.id === s.playerId ? { ...a, energy: 100 } : a)) }
    for (let i = 0; i < 300 && s.arsenal.current !== GOLDEN_MACHINE_GUN; i++) s = stepSim(s, RIGHT)
    expect(s.arsenal.current).toBe(GOLDEN_MACHINE_GUN)
    expect(playerOf(s).energy).toBe(100)
    expect(s.pickups.invinceTicks).toBeGreaterThan(0)
    const gun = s.arsenal.weapons.find((w) => w.key === GOLDEN_MACHINE_GUN)!.attack
    const blast = s.defs[GMG_SPELL]!.attack.gmg!
    expect(gun).toMatchObject({ gmgOn: true, chargeMax: blast.chargeMax, chargeSpeed: blast.chargeSpeed, chargeStart: blast.chargeStart, chargeSpeedMax: blast.chargeSpeed, fireDelay: 0 })
  })

  it('held, it fires a blast whenever the charge counter finishes and the cooldown allows: one every second tick', () => {
    const s0 = withGun(world({}))
    const { released, releasedOn } = fire(s0, 12)
    // the energy blast's gmg charge: start 5 + mana_burst, +5 a tick, up to min(15, the mana max); released one step short of it
    const limits = chargeLimits({ ...s0.defs['player']!, attack: gmgAttack(s0.defs['player']!.attack) })
    expect(releasedOn).toEqual([2, 4, 6, 8, 10, 12])
    for (const charge of released.values()) expect(charge).toBe(limits.start + limits.speed)
  })

  it('without the gun the energy blast keeps charging while held (no autofire)', () => {
    const { s, released } = fire(world({}), 30)
    expect(released.size).toBe(0)
    expect(spells(s)).toHaveLength(1)
  })

  it('charges beside the gun, ahead of Merlin, not over his head', () => {
    let s = withGun(world({}))
    s = stepSim(s, aimAt(FAR_RIGHT))
    const p = playerOf(s)
    const spell = spells(s)[0]!
    expect(spell.pos.x).toBeGreaterThan(p.pos.x + s.defs['player']!.gmgChargeLoc.x)
    expect(spell.pos.y).toBe(p.pos.y + s.defs['player']!.gmgChargeLoc.y)
  })

  it('picking another weapon puts it away; its number key takes it up again', () => {
    let s = withGun(world({}))
    s = stepSim(s, { ...NO_INPUT, selectSpell: 1 })
    expect(s.arsenal.current).toBe('energyBlast')
    expect(fire(s, 12).released.size).toBe(0)
    s = stepSim(s, { ...NO_INPUT, selectSpell: 2 })
    expect(s.arsenal.current).toBe(GOLDEN_MACHINE_GUN)
  })
})
