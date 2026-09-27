// Exit arrows of the current room (objRoom.drawExitArrows; engine notes walking-and-rooms §7).
import { describe, expect, it } from 'vitest'
import type { MapDefinition } from '../mr-open/mr-map-format'
import { exitArrowsFor } from './exit-arrows'
import { EMPTY_ROOM, createSim } from './tick'
import { anims, defs, teams } from './test-data'
import { buildWorldGrid } from './world-grid'
import type { SimState } from './state'

const SYMBOLS = ['none', 'goblinWarrior', 'musicOff']
const PLAYER = { x: 100, y: 144 }
const SOLID = 2 // backgroundActive tile index the test's isSolid treats as #solid

/** Two 18x9 rooms side by side; `solid` lists [room, column, row] of solid active tiles (1-based). */
function twoRooms(room2Objects: string[], solid: [number, number, number][] = []): MapDefinition {
  const fill = (v: number) => Array.from({ length: 9 }, () => Array(18).fill(v))
  const active = [fill(1), fill(1)]
  for (const [room, col, row] of solid) active[room - 1]![row - 1]![col - 1] = SOLID
  const objects = [fill(0), fill(0)]
  room2Objects.forEach((sym, i) => { objects[1]![4]![8 + i] = SYMBOLS.indexOf(sym) + 1 })
  return {
    mapSize: { x: 2, y: 1 }, roomSize: { x: 18, y: 9 }, startRoom: { x: 1, y: 1 },
    layers: [{ name: 'backgroundPassive', tileSet: 'p' }, { name: 'backgroundActive', tileSet: 'a' }, { name: 'objects', tileSet: 'o' }],
    rooms: [1, 2].map((num) => ({ num, layers: { backgroundActive: active[num - 1]!, backgroundPassive: fill(1), objects: objects[num - 1]! } })),
  }
}

const sim = (map: MapDefinition, mode: 'rooms' | 'continuous' = 'rooms'): SimState =>
  createSim(buildWorldGrid(map, (i) => i === SOLID, SYMBOLS), defs, teams, anims, 1, PLAYER, mode)

describe('exitArrowsFor', () => {
  it('lines the open right edge of a cleared room with arrows 16 px in, none on the map edges', () => {
    const arrows = exitArrowsFor(sim(twoRooms([])))
    expect(arrows).toHaveLength(18) // 9 tiles of 32 px, one 16 px arrow per 16 px
    expect(arrows.every((a) => a.edge === 'right' && a.pos.x === 560)).toBe(true)
    expect(arrows.map((a) => a.pos.y)).toEqual(Array.from({ length: 18 }, (_, i) => i * 16))
  })

  it('is red towards an unvisited room whose objects layer holds a hostile, green without one', () => {
    expect(exitArrowsFor(sim(twoRooms(['goblinWarrior'])))[0]!.colour).toBe('rdd')
    expect(exitArrowsFor(sim(twoRooms(['musicOff'])))[0]!.colour).toBe('grn')
  })

  it('uses the stored units of a visited room', () => {
    const s = sim(twoRooms(['goblinWarrior']))
    const cleared: SimState = { ...s, rooms: { ...s.rooms, '2,1': { ...EMPTY_ROOM, spawned: true } } }
    expect(exitArrowsFor(cleared)[0]!.colour).toBe('grn')
  })

  it('leaves a gap where either side of the boundary is solid', () => {
    const arrows = exitArrowsFor(sim(twoRooms([], [[1, 18, 2], [2, 1, 5]])))
    const rows = new Set(arrows.map((a) => Math.floor(a.pos.y / 32) + 1))
    expect([...rows]).toEqual([1, 3, 4, 6, 7, 8, 9])
  })

  it('draws nothing while the exits are shut or in a continuous world', () => {
    const s = sim(twoRooms([]))
    expect(exitArrowsFor({ ...s, exitsOpen: false })).toEqual([])
    expect(exitArrowsFor(sim(twoRooms([]), 'continuous'))).toEqual([])
  })
})
