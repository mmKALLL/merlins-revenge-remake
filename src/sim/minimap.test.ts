// What the mini-map shows: modMiniMap.getMiniMapData (#cur) over objRoom.getMiniMapStatus (saved
// room state once activated, else the objects layer), on screen in nav mode only.
import { describe, expect, it } from 'vitest'
import type { MapDefinition } from '../mr-open/mr-map-format'
import { miniMapCells, miniMapShown } from './minimap'
import { NO_INPUT, type InputSnapshot, type SimState, type WorldMode } from './state'
import { anims, defs, teams } from './test-data'
import { createSim, stepSim } from './tick'
import { switchWorldMode } from './world-mode'
import { buildWorldGrid } from './world-grid'

const OBJECT_SYMBOLS = ['none', 'goblinWarrior', 'warrior', 'energyBlast']
const GOBLIN = 2 // #inf
const FRIENDLY_WARRIOR = 3 // #fre
const SCROLL = 4 // #spe
const ROOM_W = 576

/** Open 18x9 rooms side by side; `objects[i]` lists the object tiles of room i+1, placed along row 5. */
function map(objects: number[][]): MapDefinition {
  const fill = (v: number) => Array.from({ length: 9 }, () => Array<number>(18).fill(v))
  return {
    mapSize: { x: objects.length, y: 1 }, roomSize: { x: 18, y: 9 }, startRoom: { x: 1, y: 1 },
    layers: [{ name: 'backgroundPassive', tileSet: 'p' }, { name: 'backgroundActive', tileSet: 'a' }, { name: 'objects', tileSet: 'o' }],
    rooms: objects.map((tiles, i) => {
      const obj = fill(0)
      tiles.forEach((tile, n) => { obj[4]![10 + n] = tile })
      return { num: i + 1, layers: { backgroundActive: fill(1), backgroundPassive: fill(1), objects: obj } }
    }),
  }
}
const sim = (m: MapDefinition, mode: WorldMode = 'rooms'): SimState =>
  createSim(buildWorldGrid(m, () => false, OBJECT_SYMBOLS), defs, teams, anims, 1, { x: 100, y: 144 }, mode)
const withoutGoblins = (s: SimState): SimState => ({ ...s, actors: s.actors.filter((a) => a.def !== 'goblinWarrior') })
const right: InputSnapshot = { ...NO_INPUT, move: { x: 1, y: 0 } }

describe('mini-map (rooms)', () => {
  it('shows every room from the start: #cur for the current one, the others by their placed actors', () => {
    const s = sim(map([[], [GOBLIN], [GOBLIN, FRIENDLY_WARRIOR], [SCROLL, GOBLIN], []]))
    expect(miniMapCells(s)).toEqual([['cur', 'inf', 'fre', 'spe', 'clr']])
  })

  it('is on screen in nav mode only: hidden while the room has enemies', () => {
    let s = sim(map([[GOBLIN], [GOBLIN]])) // a hostile room left, or the cleared map would finish the mini-map
    expect(miniMapShown(s)).toBe(false)
    s = stepSim(withoutGoblins(s), NO_INPUT)
    expect(miniMapShown(s)).toBe(true)
  })

  it('a room left behind shows its saved state', () => {
    let s = sim(map([[], [], [GOBLIN]]))
    for (let i = 0; i < 300 && s.room.x === 1; i++) s = stepSim(s, right)
    expect(s.room.x).toBe(2)
    expect(miniMapCells(s)).toEqual([['clr', 'cur', 'inf']])
  })
})

describe('mini-map (continuous world)', () => {
  it('has no current room: each room shows the living units standing in it', () => {
    const s = sim(map([[], [GOBLIN], []]), 'continuous')
    expect(miniMapCells(s)).toEqual([['clr', 'inf', 'clr']])
    const moved = { ...s, actors: s.actors.map((a) => (a.def === 'goblinWarrior' ? { ...a, pos: { x: 3 * ROOM_W - 50, y: 144 } } : a)) }
    expect(miniMapCells(moved)).toEqual([['clr', 'clr', 'inf']])
  })

  it('switching to rooms marks Merlin\'s room #cur again', () => {
    const s = switchWorldMode(sim(map([[], [GOBLIN]]), 'continuous'), 'rooms')
    expect(miniMapCells(s)).toEqual([['cur', 'inf']])
  })
})

describe('mini-map (roguelite exit)', () => {
  const marked = (m: MapDefinition): MapDefinition => ({ ...m, endRoom: { x: m.mapSize.x, y: 1 }, markExit: true })

  it('shows a markExit map\'s end room as the exit, whatever stands in it', () => {
    expect(miniMapCells(sim(marked(map([[], [GOBLIN], [GOBLIN]]))))).toEqual([['cur', 'inf', 'exit']])
    expect(miniMapCells(sim(marked(map([[], [GOBLIN]])), 'continuous'))).toEqual([['clr', 'exit']])
  })

  it('marks Merlin\'s room #cur even in the exit room', () => {
    const m = { ...map([[], [GOBLIN]]), endRoom: { x: 1, y: 1 }, markExit: true }
    expect(miniMapCells(sim(m))).toEqual([['cur', 'inf']])
  })

  it('an original map never shows an exit', () => {
    expect(miniMapCells(sim({ ...map([[], []]), endRoom: { x: 2, y: 1 } }))).toEqual([['cur', 'clr']])
  })
})
