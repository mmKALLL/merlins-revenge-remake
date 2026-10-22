// Debug cheat keys (gameMaster.cheat): K kills the enemies on screen (killAll ->
// teamMaster.killEnemyTeams), M gives Merlin one
// more medikit (remake; the original's #medikit, medikitCollected without a type, healed fully).
import { describe, expect, it } from 'vitest'
import type { MapDefinition } from '../mr-open/mr-map-format'
import { BONUS_ENERGY, medikitsHeld } from '../mr-open/mr-pickup'
import { defOf, playerOf } from './actors'
import { NO_INPUT, type ActorState, type InputSnapshot, type SimState, type WorldMode } from './state'
import { anims, defs, teams } from './test-data'
import { createSim, stepSim } from './tick'
import { buildWorldGrid } from './world-grid'

const SYMBOLS = ['none', 'goblinWarrior', 'goblinMageHut']
const tileOf = (symbol: string) => SYMBOLS.indexOf(symbol) + 1
const PLAYER = { x: 100, y: 144 }
const KILL: InputSnapshot = { ...NO_INPUT, cheatKillAll: true }
const MEDIKIT: InputSnapshot = { ...NO_INPUT, cheatMedikit: true }

type Placed = { room: 1 | 2; x: number; symbol: string }

/** Two open 18x9 rooms side by side with objects on row 5 (room 1 or 2, 1-based column). */
function twoRooms(objects: Placed[]): MapDefinition {
  const fill = (v: number) => Array.from({ length: 9 }, () => Array(18).fill(v))
  const obj = [fill(0), fill(0)]
  for (const o of objects) obj[o.room - 1]![4]![o.x - 1] = tileOf(o.symbol)
  return {
    mapSize: { x: 2, y: 1 }, roomSize: { x: 18, y: 9 }, startRoom: { x: 1, y: 1 },
    layers: [{ name: 'backgroundPassive', tileSet: 'p' }, { name: 'backgroundActive', tileSet: 'a' }, { name: 'objects', tileSet: 'o' }],
    rooms: [1, 2].map((num) => ({ num, layers: { backgroundActive: fill(1), backgroundPassive: fill(1), objects: obj[num - 1]! } })),
  }
}

const world = (mode: WorldMode, objects: Placed[]): SimState =>
  createSim(buildWorldGrid(twoRooms(objects), () => false, SYMBOLS), defs, teams, anims, 1, PLAYER, mode)

const enemies = (s: SimState): ActorState[] => s.actors.filter((a) => a.id !== s.playerId && a.team !== playerOf(s).team)
const dying = (a: ActorState) => a.mode === 'die' || a.mode === 'dead' || a.mode === 'finish'

describe('K: kill all cheat', () => {
  it('rooms: kills every hostile unit in Merlin\'s room, dwellings included, and none in other rooms', () => {
    const fresh = world('rooms', [{ room: 1, x: 10, symbol: 'goblinWarrior' }, { room: 1, x: 16, symbol: 'goblinMageHut' }])
    expect(fresh.exitsOpen).toBe(false)
    // a goblin stored in the visited room next door
    const goblin = enemies(fresh).find((a) => a.def === 'goblinWarrior')!
    const stored = { ...goblin, id: 999, pos: { x: 800, y: 144 }, prevPos: { x: 800, y: 144 } }
    const s0: SimState = { ...fresh, rooms: { ...fresh.rooms, '2,1': { spawned: true, actors: [stored], graves: [], clear: false } } }
    const s = stepSim(s0, KILL)
    const here = enemies(s)
    expect(here.map((a) => a.def).sort()).toEqual(['goblinMageHut', 'goblinWarrior'])
    for (const a of here) {
      expect(dying(a)).toBe(true)
      expect(a.energy).toBeLessThanOrEqual(0)
    }
    expect(s.events.filter((e) => e.kind === 'died')).toHaveLength(2)
    expect(s.rooms['2,1']!.actors).toEqual([stored])
  })

  it('rooms: the deaths play out as usual, graves recorded and the exits opening', () => {
    let s = stepSim(world('rooms', [{ room: 1, x: 10, symbol: 'goblinWarrior' }, { room: 1, x: 16, symbol: 'goblinMageHut' }]), KILL)
    let opened = false
    for (let i = 0; i < 300 && !s.exitsOpen; i++) {
      s = stepSim(s, NO_INPUT)
      opened ||= s.events.some((e) => e.kind === 'exitsOpened')
    }
    expect(opened).toBe(true)
    expect(enemies(s)).toHaveLength(0)
    expect(s.rooms['1,1']!.graves.map((g) => g.def).sort()).toEqual(['goblinMageHut', 'goblinWarrior'])
  })

  it('continuous: kills hostile units within the kill radius of Merlin (plain distance, sleepers too) and none beyond', () => {
    const s0 = world('continuous', [
      { room: 1, x: 13, symbol: 'goblinWarrior' }, // 300 px: asleep (beyond wakeDistance) but in range
      { room: 1, x: 14, symbol: 'goblinWarrior' }, // 332 px: out of range
      { room: 2, x: 9, symbol: 'goblinMageHut' }, // far away
    ])
    const radius = defOf(s0, playerOf(s0)).killAllCheatRadius
    const byX = (s: SimState) => enemies(s).sort((a, b) => a.home.x - b.home.x)
    const [near0, beyond0] = byX(s0)
    expect(near0!.awake).toBe(false)
    expect(Math.hypot(near0!.pos.x - PLAYER.x, near0!.pos.y - PLAYER.y)).toBeLessThan(radius)
    expect(Math.hypot(beyond0!.pos.x - PLAYER.x, beyond0!.pos.y - PLAYER.y)).toBeGreaterThan(radius)
    const [near, beyond, far] = byX(stepSim(s0, KILL))
    expect(dying(near!)).toBe(true)
    expect(near!.awake).toBe(true) // woken so its death plays out
    expect(dying(beyond!)).toBe(false)
    expect(dying(far!)).toBe(false)
  })

  it('does nothing without the key press', () => {
    const s = stepSim(world('rooms', [{ room: 1, x: 10, symbol: 'goblinWarrior' }]), NO_INPUT)
    expect(enemies(s).some(dying)).toBe(false)
  })
})

describe('M: medikit cheat', () => {
  it('gives Merlin one more medikit as collecting one does (+25 energy, invincibility), without a sound', () => {
    const s0 = world('rooms', [])
    const p = playerOf(s0)
    const hurt: SimState = { ...s0, actors: s0.actors.map((a) => (a.id === p.id ? { ...a, energy: 3 } : a)) }
    const s = stepSim(hurt, MEDIKIT)
    expect(medikitsHeld(s.pickups.medikits)).toBe(1)
    expect(playerOf(s).energy).toBeGreaterThanOrEqual(3 + BONUS_ENERGY)
    expect(playerOf(s).energy).toBeLessThan(defOf(s, p).maxEnergy)
    expect(s.pickups.invinceTicks).toBeGreaterThan(0)
    expect(s.events.some((e) => e.kind === 'sound')).toBe(false)
    expect(medikitsHeld(stepSim(hurt, NO_INPUT).pickups.medikits)).toBe(0)
  })
})

describe('medikit out of battle (remake)', () => {
  it('heals medikitRestRate times as fast once the room is clear', () => {
    const healed = (objects: Placed[]) => {
      const w = world('rooms', objects)
      let s: SimState = { ...w, defs: { ...w.defs, player: { ...w.defs['player']!, medikitRestRate: 3 } } }
      s = stepSim(s, MEDIKIT)
      const hurt = s.actors.map((a) => (a.id === s.playerId ? { ...a, energy: 50 } : a))
      s = { ...s, actors: hurt }
      for (let i = 0; i < 60; i++) s = stepSim(s, NO_INPUT)
      return playerOf(s).energy - 50
    }
    // a hut in Merlin's room keeps the fight going; one only next door leaves his room clear (and the map unfinished)
    const inBattle = healed([{ room: 1, x: 17, symbol: 'goblinMageHut' }])
    const atRest = healed([{ room: 2, x: 17, symbol: 'goblinMageHut' }])
    expect(inBattle).toBeGreaterThan(0)
    expect(atRest).toBeGreaterThanOrEqual(inBattle * 3 - 3)
  })
})

