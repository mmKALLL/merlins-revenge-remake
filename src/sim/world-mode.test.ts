// Switching between the room-by-room world and the continuous world during play (remake feature;
// engine notes walking-and-rooms, "Continuous world").
import { describe, expect, it } from 'vitest'
import type { MapDefinition } from '../mr-open/mr-map-format'
import { playerOf } from './actors'
import { NO_INPUT, type ActorState, type SimState } from './state'
import { anims, defs, teams } from './test-data'
import { createSim, stepSim } from './tick'
import { buildWorldGrid } from './world-grid'
import { switchWorldMode } from './world-mode'

const SYMBOLS = ['none', 'goblinWarrior', 'goblinMageHut']
const tileOf = (symbol: string) => SYMBOLS.indexOf(symbol) + 1
const PLAYER = { x: 100, y: 144 }

/** Two open 18x9 rooms side by side with objects on row 5 (room 1 or 2, 1-based column). */
function twoRooms(objects: { room: 1 | 2; x: number; symbol: string }[]): MapDefinition {
  const fill = (v: number) => Array.from({ length: 9 }, () => Array(18).fill(v))
  const obj = [fill(0), fill(0)]
  for (const o of objects) obj[o.room - 1]![4]![o.x - 1] = tileOf(o.symbol)
  return {
    mapSize: { x: 2, y: 1 }, roomSize: { x: 18, y: 9 }, startRoom: { x: 1, y: 1 },
    layers: [{ name: 'backgroundPassive', tileSet: 'p' }, { name: 'backgroundActive', tileSet: 'a' }, { name: 'objects', tileSet: 'o' }],
    rooms: [1, 2].map((num) => ({ num, layers: { backgroundActive: fill(1), backgroundPassive: fill(1), objects: obj[num - 1]! } })),
  }
}

const roomsWorld = (objects: { room: 1 | 2; x: number; symbol: string }[]): SimState =>
  createSim(buildWorldGrid(twoRooms(objects), () => false, SYMBOLS), defs, teams, anims, 1, PLAYER, 'rooms')

const goblins = (s: SimState): ActorState[] => s.actors.filter((a) => a.def === 'goblinWarrior')
const storedIn = (s: SimState, key: string): ActorState[] => s.rooms[key]?.actors ?? []
const summary = (as: ActorState[]) => as.map((a) => ({ id: a.id, energy: a.energy, pos: a.pos })).sort((a, b) => a.id - b.id)
/** Every goblin, live or stored in a room. */
const allGoblins = (s: SimState): ActorState[] =>
  [...goblins(s), ...Object.values(s.rooms).flatMap((r) => r.actors.filter((a) => a.def === 'goblinWarrior'))]

describe('switchWorldMode', () => {
  it('rooms -> continuous spawns the unvisited rooms, far units asleep, and opens the exits', () => {
    const s = switchWorldMode(roomsWorld([{ room: 2, x: 9, symbol: 'goblinWarrior' }]), 'continuous')
    expect(s.worldMode).toBe('continuous')
    expect(goblins(s)).toHaveLength(1)
    expect(goblins(s)[0]!.awake).toBe(false)
    expect(s.exitsOpen).toBe(true)
  })

  it('continuous -> rooms stores the units outside Merlin\'s room in their own room', () => {
    const s = switchWorldMode(switchWorldMode(roomsWorld([{ room: 2, x: 9, symbol: 'goblinWarrior' }]), 'continuous'), 'rooms')
    expect(s.worldMode).toBe('rooms')
    expect(goblins(s)).toHaveLength(0)
    const stored = storedIn(s, '2,1')
    expect(stored).toHaveLength(1)
    expect(stored[0]!.awake).toBe(true)
    expect(s.rooms['2,1']!.spawned).toBe(true)
  })

  it('round trip rooms -> continuous -> rooms keeps enemy ids, energies and positions', () => {
    let s = roomsWorld([{ room: 1, x: 12, symbol: 'goblinWarrior' }, { room: 2, x: 9, symbol: 'goblinWarrior' }])
    s = { ...s, actors: s.actors.map((a) => (a.def === 'goblinWarrior' ? { ...a, energy: a.energy - 3 } : a)) }
    const liveBefore = summary(goblins(s))
    const once = switchWorldMode(switchWorldMode(s, 'continuous'), 'rooms')
    expect(summary(goblins(once))).toEqual(liveBefore)
    const twice = switchWorldMode(switchWorldMode(once, 'continuous'), 'rooms')
    expect(summary(goblins(twice))).toEqual(liveBefore)
    expect(summary(storedIn(twice, '2,1'))).toEqual(summary(storedIn(once, '2,1')))
    expect(playerOf(twice).pos).toEqual(playerOf(s).pos)
  })

  it('restores a visited room\'s stored units into the continuous world', () => {
    const once = switchWorldMode(switchWorldMode(roomsWorld([{ room: 2, x: 9, symbol: 'goblinWarrior' }]), 'continuous'), 'rooms')
    const s = switchWorldMode(once, 'continuous')
    expect(summary(goblins(s))).toEqual(summary(storedIn(once, '2,1')))
    expect(goblins(s)[0]!.awake).toBe(false)
    expect(storedIn(s, '2,1')).toHaveLength(0)
  })

  it('spawns never-visited rooms exactly once across repeated toggles', () => {
    let s = roomsWorld([{ room: 2, x: 9, symbol: 'goblinWarrior' }, { room: 2, x: 12, symbol: 'goblinWarrior' }])
    for (let i = 0; i < 3; i++) {
      s = switchWorldMode(s, 'continuous')
      expect(allGoblins(s)).toHaveLength(2)
      s = switchWorldMode(s, 'rooms')
      expect(allGoblins(s)).toHaveLength(2)
    }
  })

  it('keeps the exits open when switching inside a cleared room', () => {
    const s = switchWorldMode(switchWorldMode(roomsWorld([{ room: 2, x: 9, symbol: 'goblinWarrior' }]), 'continuous'), 'rooms')
    expect(s.exitsOpen).toBe(true)
    expect(s.navMode).toBe(true)
  })

  it('closes the exits when switching with a hostile in Merlin\'s room', () => {
    const cont = switchWorldMode(roomsWorld([{ room: 1, x: 12, symbol: 'goblinWarrior' }]), 'continuous')
    expect(cont.exitsOpen).toBe(true)
    const s = switchWorldMode(cont, 'rooms')
    expect(s.exitsOpen).toBe(false)
    expect(s.navMode).toBe(false)
    expect(s.rooms['1,1']!.clear).toBe(false)
  })

  it('drops bullets and spells outside Merlin\'s room when going back to rooms', () => {
    const cont = switchWorldMode(roomsWorld([]), 'continuous')
    const far = { ...playerOf(cont), id: 99, def: 'goblinArrow', pos: { x: 700, y: 144 } }
    const near = { ...far, id: 100, pos: { x: 200, y: 144 } }
    const s = switchWorldMode({ ...cont, actors: [...cont.actors, far, near] }, 'rooms')
    expect(s.actors.map((a) => a.id)).toEqual([cont.playerId, 100])
  })

  it('returns the state unchanged when already in the mode', () => {
    const s = roomsWorld([])
    expect(switchWorldMode(s, 'rooms')).toBe(s)
  })
})

describe('units put to sleep stand perfectly still (regression: sleepers jittered after the switch)', () => {
  const run = (s: SimState, ticks: number): SimState => {
    for (let i = 0; i < ticks; i++) s = stepSim(s, NO_INPUT)
    return s
  }
  /** A room-1 goblin far from Merlin that has been walking at him for a few ticks. */
  const walkingFar = (): SimState => {
    const s = run(roomsWorld([{ room: 1, x: 17, symbol: 'goblinWarrior' }]), 6)
    const g = goblins(s)[0]!
    expect(g.pos).not.toEqual(g.prevPos)
    expect(g.vel).not.toEqual({ x: 0, y: 0 })
    return s
  }
  const expectStill = (g: ActorState) => {
    expect(g.awake).toBe(false)
    expect(g.prevPos).toEqual(g.pos)
    expect(g.vel).toEqual({ x: 0, y: 0 })
    expect(g.anim).toBe('stand')
  }

  it('settles a formerly walking unit stored in another room when switching to continuous', () => {
    const s = walkingFar()
    const g = goblins(s)[0]!
    const moved = { ...g, pos: { x: g.pos.x + 576, y: g.pos.y }, prevPos: { x: g.prevPos.x + 576, y: g.prevPos.y } }
    const stored: SimState = { ...s, actors: s.actors.filter((a) => a.id !== g.id), rooms: { ...s.rooms, '2,1': { spawned: true, actors: [moved], graves: [], clear: false } } }
    expectStill(goblins(switchWorldMode(stored, 'continuous'))[0]!)
  })

  it('settles a walking unit that falls asleep by distance after the switch, and keeps it still', () => {
    let s = run(switchWorldMode(walkingFar(), 'continuous'), 1)
    const g = goblins(s)[0]!
    expectStill(g)
    s = run(s, 10)
    expect(goblins(s)[0]!.pos).toEqual(g.pos)
    expect(goblins(s)[0]!.prevPos).toEqual(g.pos)
  })
})
