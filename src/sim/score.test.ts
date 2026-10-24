// Scoring (remake): the room countdown, its pause outside the room, banking on clear, rooms with
// nothing to clear paying nothing, the continuous world's rooms, and a mode switch voiding the run.
import { describe, expect, it } from 'vitest'
import type { MapDefinition } from '../mr-open/mr-map-format'
import { currentRoomPoints, NEW_SCORE, ROOM_COUNTDOWN_TICKS, ROOM_POINTS_MAX, roomPoints, stepScore } from './score'
import { NO_INPUT, type RoomState, type SimState, type WorldMode } from './state'
import { anims, defs, teams } from './test-data'
import { createSim, stepSim } from './tick'
import { buildWorldGrid } from './world-grid'
import { switchWorldMode } from './world-mode'

const OBJECT_SYMBOLS = ['none', 'goblinWarrior']
const GOBLIN = 2 // 1-based into OBJECT_SYMBOLS

/** Open 18x9 rooms side by side; `goblins[i]`: room i+1 holds a goblin warrior. */
function map(goblins: boolean[]): MapDefinition {
  const fill = (v: number) => Array.from({ length: 9 }, () => Array<number>(18).fill(v))
  return {
    mapSize: { x: goblins.length, y: 1 }, roomSize: { x: 18, y: 9 }, startRoom: { x: 1, y: 1 },
    layers: [{ name: 'backgroundPassive', tileSet: 'p' }, { name: 'backgroundActive', tileSet: 'a' }, { name: 'objects', tileSet: 'o' }],
    rooms: goblins.map((goblin, i) => {
      const obj = fill(0)
      if (goblin) obj[4]![11] = GOBLIN
      return { num: i + 1, layers: { backgroundActive: fill(1), backgroundPassive: fill(1), objects: obj } }
    }),
  }
}
const sim = (m: MapDefinition, mode: WorldMode = 'rooms'): SimState =>
  createSim(buildWorldGrid(m, () => false, OBJECT_SYMBOLS), defs, teams, anims, 1, { x: 100, y: 144 }, mode)
const withoutGoblins = (s: SimState): SimState => ({ ...s, actors: s.actors.filter((a) => a.def !== 'goblinWarrior') })
const steps = (s: SimState, n: number): SimState => {
  for (let i = 0; i < n; i++) s = stepSim(s, NO_INPUT)
  return s
}

describe('room points', () => {
  it('count down linearly from 9999 to 0 over ROOM_COUNTDOWN_TICKS', () => {
    expect(roomPoints(0)).toBe(ROOM_POINTS_MAX)
    expect(roomPoints(ROOM_COUNTDOWN_TICKS / 2)).toBe(Math.floor(ROOM_POINTS_MAX / 2))
    expect(roomPoints(ROOM_COUNTDOWN_TICKS - 1)).toBeGreaterThan(0)
    expect(roomPoints(ROOM_COUNTDOWN_TICKS)).toBe(0)
    expect(roomPoints(ROOM_COUNTDOWN_TICKS + 100)).toBe(0)
  })
})

describe('scoring in rooms', () => {
  it('a start room with no hostile has nothing to clear and pays nothing', () => {
    const s = steps(sim(map([false, true])), 30)
    expect(s.score.valid).toBe(true)
    expect(s.score.total).toBe(0)
    expect(currentRoomPoints(s)).toBeNull()
  })

  it('a room clear on Merlin\'s first entry pays nothing', () => {
    const rooms: Record<string, RoomState> = {
      '1,1': { spawned: true, actors: [], graves: [], clear: true },
      '2,1': { spawned: true, actors: [], graves: [], clear: true },
    }
    const at = (x: number, score = NEW_SCORE) => ({ worldMode: 'rooms', room: { x, y: 1 }, rooms, score } as SimState)
    const score = stepScore(at(1), at(2, stepScore(at(1), at(1))))
    expect(score.total).toBe(0)
    expect(score.rooms['2,1']?.banked).toBe(true)
  })

  it('a hostile room counts down while Merlin is in it and banks what is left when it clears', () => {
    let s = sim(map([true]))
    expect(s.score.total).toBe(0)
    expect(currentRoomPoints(s)).toBe(ROOM_POINTS_MAX)
    s = steps(s, 30)
    expect(currentRoomPoints(s)).toBe(roomPoints(30))
    // the exits open on the tick after the last hostile has gone, and that tick still counts
    s = stepSim(withoutGoblins(s), NO_INPUT)
    expect(s.exitsOpen).toBe(true)
    expect(s.score.total).toBe(roomPoints(31))
    expect(currentRoomPoints(s)).toBeNull()
    s = steps(s, 30)
    expect(s.score.total).toBe(roomPoints(31))
  })

  it('a room left uncleared keeps its countdown paused until Merlin is back', () => {
    const rooms = (clearA: boolean): Record<string, RoomState> => ({
      '1,1': { spawned: true, actors: [], graves: [], clear: clearA },
      '2,1': { spawned: true, actors: [], graves: [], clear: false },
    })
    const at = (x: number, score = NEW_SCORE, clearA = false) =>
      ({ worldMode: 'rooms', room: { x, y: 1 }, rooms: rooms(clearA), score } as SimState)
    let score = NEW_SCORE
    for (let i = 0; i < 5; i++) score = stepScore(at(1), at(1, score))
    for (let i = 0; i < 7; i++) score = stepScore(at(2), at(2, score))
    expect(score.rooms['1,1']?.ticks).toBe(5)
    expect(score.rooms['2,1']?.ticks).toBe(7)
    score = stepScore(at(1), at(1, score))
    expect(score.rooms['1,1']?.ticks).toBe(6)
    score = stepScore(at(1, score, true), at(1, score, true))
    expect(score.total).toBe(roomPoints(6))
  })
})

describe('scoring in the continuous world', () => {
  it('a run started there counts down Merlin\'s room by the map\'s rooms and banks it once no hostile is in it', () => {
    let s = steps(sim(map([true, true]), 'continuous'), 30)
    expect(s.score.valid).toBe(true)
    expect(currentRoomPoints(s)).toBe(roomPoints(30))
    s = stepSim(withoutGoblins(s), NO_INPUT)
    expect(s.score.total).toBe(roomPoints(30))
    expect(currentRoomPoints(s)).toBeNull()
  })

  it('a start room with no hostile pays nothing there either', () => {
    const s = steps(sim(map([false, true]), 'continuous'), 5)
    expect(s.score.valid).toBe(true)
    expect(s.score.total).toBe(0)
  })
})

describe('switching the world mode during a run voids it', () => {
  it.each<[WorldMode, WorldMode]>([['rooms', 'continuous'], ['continuous', 'rooms']])('from %s to %s, and switching back does not restore it', (from, to) => {
    let s = steps(sim(map([true, true]), from), 3)
    expect(s.score.valid).toBe(true)
    s = switchWorldMode(s, to)
    expect(s.score.valid).toBe(false)
    s = steps(switchWorldMode(steps(s, 3), from), 3)
    expect(s.score.valid).toBe(false)
    expect(s.score.total).toBe(0)
  })
})
