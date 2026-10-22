// The #army key (R): modAutoSummon.summonArmy summons the whole reserve around the mouse under the
// team cap; with army members in play (remake) it sends them all back into the reserve once the
// fight is over.
import { describe, expect, it } from 'vitest'
import { autoSummonTypes } from '../mr-open/mr-auto-summon'
import { TELEPORT_TICKS } from '../mr-open/mr-army'
import type { MapDefinition } from '../mr-open/mr-map-format'
import { addWeapon } from '../mr-open/mr-weapons'
import type { Vec } from '../mr-open/mr-geometry'
import { createActor, playerOf } from './actors'
import { NO_INPUT, type ActorState, type InputSnapshot, type SimState, type WorldMode } from './state'
import { anims, defs, teams } from './test-data'
import { createSim, stepSim } from './tick'
import { buildWorldGrid } from './world-grid'

const SYMBOLS = ['none', 'goblinWarrior']
const PLAYER = { x: 100, y: 144 }
const MOUSE = { x: 300, y: 150 }
const R: InputSnapshot = { ...NO_INPUT, armyKey: true, mouseWorld: MOUSE }
const MEMBERS = ['warrior', 'archer', 'monk', 'dwarf', 'kingInGame']

/**
 * Two open 18x9 rooms side by side with a goblin near Merlin, so the fight is not over (allies with
 * nothing to fight teleport out by themselves), and one in the far room.
 */
function world(mode: WorldMode, reserve: Record<string, number>): SimState {
  const fill = (v: number) => Array.from({ length: 9 }, () => Array<number>(18).fill(v))
  const goblin = SYMBOLS.indexOf('goblinWarrior') + 1
  const near = fill(0)
  const far = fill(0)
  near[4]![7] = goblin
  far[4]![9] = goblin
  const map: MapDefinition = {
    mapSize: { x: 2, y: 1 }, roomSize: { x: 18, y: 9 }, startRoom: { x: 1, y: 1 },
    layers: [{ name: 'backgroundPassive', tileSet: 'p' }, { name: 'backgroundActive', tileSet: 'a' }, { name: 'objects', tileSet: 'o' }],
    rooms: [near, far].map((objects, i) => ({ num: i + 1, layers: { backgroundActive: fill(0), backgroundPassive: fill(1), objects } })),
  }
  const s = createSim(buildWorldGrid(map, () => false, SYMBOLS), defs, teams, anims, 1, PLAYER, mode)
  return { ...s, army: { [playerOf(s).team]: reserve } }
}

const allies = (s: SimState): ActorState[] => s.actors.filter((a) => MEMBERS.includes(a.def))
const reserveOf = (s: SimState) => s.army[playerOf(s).team]

describe('modAutoSummon.summonArmy: which units one press summons', () => {
  const inReserve = (r: Record<string, number>) => (typ: string) => r[typ] ?? 0

  it('shares the free slots over the army types, each type up to its units in the reserve', () => {
    expect(autoSummonTypes(11, MEMBERS, inReserve({ warrior: 2, archer: 2, monk: 1, dwarf: 1 }))).toEqual(['warrior', 'warrior', 'archer', 'archer', 'monk', 'dwarf'])
    // 11 slots over 5 types: 2 per type, however many warriors wait
    expect(autoSummonTypes(11, MEMBERS, inReserve({ warrior: 20 }))).toEqual(['warrior', 'warrior'])
  })

  it('with fewer slots than types, shares them over all but the last two until they run out', () => {
    const plenty = inReserve({ warrior: 5, archer: 5, monk: 5, dwarf: 5, kingInGame: 5 })
    expect(autoSummonTypes(4, MEMBERS, plenty)).toEqual(['warrior', 'archer', 'monk', 'dwarf'])
    expect(autoSummonTypes(0, MEMBERS, plenty)).toEqual([])
  })
})

describe('R: the army key', () => {
  for (const mode of ['rooms', 'continuous'] as const) {
    it(`${mode}: summons the whole reserve teleporting in around the mouse; sends it all back only once the fight is over`, () => {
      let s = stepSim(world(mode, { warrior: 2, archer: 1, dwarf: 1 }), R)
      const summoned = allies(s)
      expect(summoned.map((a) => a.def).sort()).toEqual(['archer', 'dwarf', 'warrior', 'warrior'])
      for (const a of summoned) {
        expect(a.teleport).toBe('in')
        expect(a.team).toBe(playerOf(s).team)
        expect(Math.abs(a.pos.y - MOUSE.y)).toBeLessThanOrEqual(15)
      }
      expect(reserveOf(s)).toEqual({ warrior: 0, archer: 0, dwarf: 0 })
      // the army is out and the goblin near Merlin still fights: R does nothing, not even summon
      s = stepSim(stepSim(s, NO_INPUT), R)
      expect(allies(s).some((a) => a.teleport === 'out')).toBe(false)
      expect(allies(s)).toHaveLength(4)
      // the fight is over (the room clear, nav mode in the continuous world): R sends every member back
      s = stepSim({ ...s, exitsOpen: true, navMode: true }, R)
      expect(allies(s).every((a) => a.teleport === 'out')).toBe(true)
      for (let i = 0; i < TELEPORT_TICKS; i++) s = stepSim(s, NO_INPUT)
      expect(allies(s)).toHaveLength(0)
      expect(reserveOf(s)).toEqual({ warrior: 2, archer: 1, dwarf: 1 })
    })
  }

  it('summons at the nearest hostile on screen instead of the mouse when Space is not in mouse mode', () => {
    const s0 = world('rooms', { warrior: 2 })
    const goblin = s0.actors.find((a) => a.def === 'goblinWarrior' && Math.abs(a.pos.x - PLAYER.x) < 300)!
    const s = stepSim(s0, { ...R, armyAtNearest: true })
    for (const a of allies(s)) {
      expect(Math.abs(a.pos.x - goblin.pos.x)).toBeLessThan(Math.abs(a.pos.x - MOUSE.x))
      expect(Math.abs(a.pos.y - goblin.pos.y)).toBeLessThanOrEqual(20)
    }
    expect(allies(s)).toHaveLength(2)
  })

  it('summons no more than the team cap leaves room for, shared over the army types', () => {
    const s0 = world('rooms', { warrior: 20, archer: 20, monk: 20, dwarf: 20, kingInGame: 20 })
    const freeSlots = teams[playerOf(s0).team]!.maxMembers! - 1 // Merlin takes a slot
    const summoned = allies(stepSim(s0, R))
    expect(summoned.length).toBeLessThanOrEqual(freeSlots)
    for (const typ of MEMBERS) expect(summoned.filter((a) => a.def === typ)).toHaveLength(Math.floor(freeSlots / MEMBERS.length))
  })

  it('does nothing without the key press', () => {
    const s = stepSim(world('rooms', { warrior: 2 }), { ...NO_INPUT, mouseWorld: MOUSE })
    expect(allies(s)).toHaveLength(0)
    expect(reserveOf(s)).toEqual({ warrior: 2 })
  })
})

describe('the army summon spell released blank (remake)', () => {
  const NEAR_ALLY = { x: PLAYER.x + 30, y: PLAYER.y }
  const FAR_ALLY = { x: PLAYER.x - 60, y: PLAYER.y }

  /** Merlin with the army summon and two warriors of his in play, the nearer one 30 px away. */
  function withAllies(reserve: Record<string, number>): SimState {
    let s = world('rooms', reserve)
    s = { ...s, arsenal: addWeapon(s.arsenal, 'armySummon', defs['armySummon']!.attack) }
    for (const pos of [FAR_ALLY, NEAR_ALLY]) {
      const [a, next] = createActor(s, 'warrior', pos)
      s = { ...next, actors: [...next.actors, a] }
    }
    return s
  }

  /** Charges for `ticks` with the mouse far away, then lets go: where the released spell flies, and the state it was released in. */
  function release(s: SimState, ticks: number): { at: Vec | undefined; before: SimState } {
    const held: InputSnapshot = { ...NO_INPUT, chargeHeld: true, mouseWorld: MOUSE }
    for (let i = 0; i < ticks; i++) s = stepSim(s, held)
    const after = stepSim(s, { ...NO_INPUT, mouseWorld: MOUSE })
    return { at: after.actors.find((a) => a.def === 'spell' && a.mode === 'fly')?.targetPoint ?? undefined, before: s }
  }

  it('below the first stage flies at the ally nearest to Merlin instead of the mouse', () => {
    const { at, before } = release(withAllies({}), 2)
    const [near] = allies(before).sort((a, b) => Math.abs(a.pos.x - PLAYER.x) - Math.abs(b.pos.x - PLAYER.x))
    expect(at).toEqual(near!.pos)
  })

  it('at a summon stage flies at the mouse as before', () => {
    expect(release(withAllies({ warrior: 1 }), 30).at).toEqual(MOUSE)
  })
})
