// The whole map cleared (objMap.checkMapCleared -> gameMaster.gameEvent(#mapClear) -> gameComplete)
// and the end room (gameMaster.teamDied -> isEndRoom), against the engine's actor and team data.
import { describe, expect, it } from 'vitest'
import type { Vec } from '../mr-open/mr-geometry'
import type { MapDefinition } from '../mr-open/mr-map-format'
import { playerOf } from './actors'
import { NO_INPUT, type InputSnapshot, type SimState, type WorldMode } from './state'
import { anims, defs, teams } from './test-data'
import { createSim, stepSim } from './tick'
import { buildWorldGrid } from './world-grid'

const OBJECT_SYMBOLS = ['none', 'goblinWarrior', 'warrior', 'energyBlast', 'friendlyGoblinHut', 'musicLastStand']
const GOBLIN = 2 // #inf
const FRIENDLY_WARRIOR = 3 // #fre
const SCROLL = 4 // #spe
const FRIENDLY_HUT = 5 // #clr, produces friendly goblins
const MUSIC = 6 // #clr

/** Open 18x9 rooms side by side; `objects[i]` lists the object tiles of room i+1 (tile x, y, index). */
function map(objects: { x: number; y: number; tile: number }[][], endRoom?: Vec): MapDefinition {
  const fill = (v: number) => Array.from({ length: 9 }, () => Array<number>(18).fill(v))
  return {
    mapSize: { x: objects.length, y: 1 }, roomSize: { x: 18, y: 9 }, startRoom: { x: 1, y: 1 }, ...(endRoom ? { endRoom } : {}),
    layers: [{ name: 'backgroundPassive', tileSet: 'p' }, { name: 'backgroundActive', tileSet: 'a' }, { name: 'objects', tileSet: 'o' }],
    rooms: objects.map((tiles, i) => {
      const obj = fill(0)
      for (const t of tiles) obj[t.y - 1]![t.x - 1] = t.tile
      return { num: i + 1, layers: { backgroundActive: fill(1), backgroundPassive: fill(1), objects: obj } }
    }),
  }
}
const at = (tile: number) => ({ x: 12, y: 5, tile })
const sim = (m: MapDefinition, mode: WorldMode = 'rooms'): SimState =>
  createSim(buildWorldGrid(m, () => false, OBJECT_SYMBOLS), defs, teams, anims, 1, { x: 100, y: 144 }, mode)

/** Takes every goblin warrior out, as if its #finish had just run (the exits test runs on the next tick). */
const withoutGoblins = (s: SimState): SimState => ({ ...s, actors: s.actors.filter((a) => a.def !== 'goblinWarrior') })
const completions = (s: SimState) => s.events.filter((e) => e.kind === 'mapComplete')
const sounds = (s: SimState) => s.events.flatMap((e) => (e.kind === 'sound' ? [e.name] : []))
const right: InputSnapshot = { ...NO_INPUT, move: { x: 1, y: 0 } }

/** Walks right into the next room (exits must be open). */
function walkIntoNextRoom(s: SimState): SimState {
  const from = s.room.x
  for (let i = 0; i < 300 && s.room.x === from; i++) s = stepSim(s, right)
  expect(s.room.x).toBe(from + 1)
  return s
}

describe('map complete (rooms)', () => {
  it('clearing the last hostile room completes the map once: end_level instead of end_screen', () => {
    let s = sim(map([[at(GOBLIN)], [at(MUSIC)]]))
    expect(s.mapComplete).toBe(false)
    s = stepSim(withoutGoblins(s), NO_INPUT)
    expect(s.exitsOpen).toBe(true)
    expect(completions(s)).toHaveLength(1)
    expect(sounds(s)).toEqual(['end_level'])
    expect(s.mapComplete).toBe(true)
    for (let i = 0; i < 10; i++) {
      s = stepSim(s, NO_INPUT)
      expect(completions(s)).toHaveLength(0)
    }
  })

  it('an unvisited room with a hostile keeps the map going until it is visited and cleared', () => {
    let s = sim(map([[at(GOBLIN)], [at(GOBLIN)]]))
    s = stepSim(withoutGoblins(s), NO_INPUT)
    expect(sounds(s)).toEqual(['end_screen'])
    expect(s.mapComplete).toBe(false)
    s = walkIntoNextRoom(s)
    expect(s.exitsOpen).toBe(false)
    expect(s.mapComplete).toBe(false)
    s = stepSim(withoutGoblins(s), NO_INPUT)
    expect(completions(s)).toHaveLength(1)
  })

  it('an unvisited room with a friendly (#fre) or special (#spe) actor is not cleared until visited', () => {
    for (const tile of [FRIENDLY_WARRIOR, SCROLL]) {
      let s = sim(map([[at(GOBLIN)], [at(tile)]]))
      s = stepSim(withoutGoblins(s), NO_INPUT)
      expect(s.mapComplete).toBe(false)
      // objRoom.activate -> attemptOpenExits: no hostile, so the room clears and the map with it
      s = walkIntoNextRoom(s)
      expect(s.mapComplete).toBe(true)
      expect(completions(s)).toHaveLength(1)
    }
  })

  it('a map with nothing hostile anywhere completes as the start room activates', () => {
    const s = sim(map([[at(MUSIC)], []]))
    expect(s.mapComplete).toBe(true)
    expect(completions(s)).toHaveLength(1)
    expect(sounds(s)).toEqual(['end_level'])
  })

  it('clearing the end room completes the map even with hostiles left elsewhere', () => {
    let s = sim(map([[at(GOBLIN)], [at(GOBLIN)]], { x: 1, y: 1 }))
    s = stepSim(withoutGoblins(s), NO_INPUT)
    expect(completions(s)).toHaveLength(1)
    // not the whole map: the room-cleared jingle still plays next to the game-complete sound
    expect(sounds(s)).toEqual(['end_screen', 'end_level'])
  })

  it('the end room only counts when its hostiles die, not when it is entered clear', () => {
    let s = sim(map([[], [at(GOBLIN)], [at(GOBLIN)]], { x: 1, y: 1 }))
    expect(s.mapComplete).toBe(false)
    s = walkIntoNextRoom(s)
    expect(s.mapComplete).toBe(false)
  })

  it('after completion the units stop acting: a friendly hut produces nobody', () => {
    const produced = (s: SimState) => {
      const count = s.actors.length
      for (let i = 0; i < 30 * 60; i++) s = stepSim(s, NO_INPUT)
      expect(playerOf(s)).toBeDefined()
      return s.actors.length - count
    }
    const going = sim(map([[at(FRIENDLY_HUT)], [at(GOBLIN)]]))
    expect(going.mapComplete).toBe(false)
    expect(produced(going)).toBeGreaterThan(0)
    const complete = sim(map([[at(FRIENDLY_HUT)], []]))
    expect(complete.mapComplete).toBe(true)
    expect(produced(complete)).toBe(0)
  })
})

describe('map complete (continuous world)', () => {
  it('completes when no hostile is left anywhere on the map', () => {
    let s = sim(map([[at(GOBLIN)], [at(GOBLIN)]]), 'continuous')
    expect(s.mapComplete).toBe(false)
    s = stepSim({ ...s, actors: s.actors.filter((a) => !(a.def === 'goblinWarrior' && a.pos.x < 576)) }, NO_INPUT)
    expect(s.mapComplete).toBe(false)
    s = stepSim(withoutGoblins(s), NO_INPUT)
    expect(completions(s)).toHaveLength(1)
    expect(sounds(s)).toContain('end_level')
    s = stepSim(s, NO_INPUT)
    expect(completions(s)).toHaveLength(0)
  })
})
