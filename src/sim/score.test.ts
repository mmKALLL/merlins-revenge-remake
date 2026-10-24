// Scoring (remake): the room countdown, its pause outside the room, banking on clear, and the
// continuous world voiding the score.
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
  it('count down linearly from 9999 to 0 over 200 seconds', () => {
    expect(roomPoints(0)).toBe(ROOM_POINTS_MAX)
    expect(ROOM_COUNTDOWN_TICKS).toBe(200 * 30)
    expect(roomPoints(ROOM_COUNTDOWN_TICKS / 2)).toBe(Math.floor(ROOM_POINTS_MAX / 2))
    expect(roomPoints(ROOM_COUNTDOWN_TICKS - 1)).toBeGreaterThan(0)
    expect(roomPoints(ROOM_COUNTDOWN_TICKS)).toBe(0)
    expect(roomPoints(ROOM_COUNTDOWN_TICKS + 100)).toBe(0)
  })
})

describe('scoring in rooms', () => {
  it('a start room with no hostile is clear at once and pays its full value', () => {
    const s = sim(map([false, true]))
    expect(s.score.total).toBe(ROOM_POINTS_MAX)
    expect(currentRoomPoints(s)).toBeNull()
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

describe('the continuous world voids the score', () => {
  it('starting in the continuous world gives no score', () => {
    const s = steps(sim(map([false, true]), 'continuous'), 5)
    expect(s.score.valid).toBe(false)
    expect(s.score.total).toBe(0)
  })

  it('switching to it during a run voids the run, and switching back does not restore it', () => {
    let s = sim(map([false, true]))
    expect(s.score.valid).toBe(true)
    s = switchWorldMode(s, 'continuous')
    expect(s.score.valid).toBe(false)
    s = steps(switchWorldMode(steps(s, 3), 'rooms'), 3)
    expect(s.score.valid).toBe(false)
    expect(s.score.total).toBe(0)
  })
})
