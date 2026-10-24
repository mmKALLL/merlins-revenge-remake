// Remake (roguelite, docs/plans/2026-10-25-roguelite-mode-design.md): a floor ends when Merlin leaves
// its marked end room through the top edge of the map; any other room, or an unmarked map, keeps him in.
import { describe, expect, it } from 'vitest'
import type { Vec } from '../mr-open/mr-geometry'
import type { MapDefinition } from '../mr-open/mr-map-format'
import { NO_INPUT, type InputSnapshot, type SimState, type WorldMode } from './state'
import { anims, defs, teams } from './test-data'
import { createSim, stepSim } from './tick'
import { buildWorldGrid } from './world-grid'

const ROOM = { x: 18, y: 9 }
const ROOM_W = 576
const NEAR_TOP_Y = 40
const WALK_TICKS = 60
const up: InputSnapshot = { ...NO_INPUT, move: { x: 0, y: -1 } }

/** Two open rooms side by side, the right one the end room. */
function floor(markExit: boolean): MapDefinition {
  const fill = (v: number) => Array.from({ length: ROOM.y }, () => Array<number>(ROOM.x).fill(v))
  return {
    mapSize: { x: 2, y: 1 }, roomSize: ROOM, startRoom: { x: 1, y: 1 }, endRoom: { x: 2, y: 1 }, markExit,
    layers: [{ name: 'backgroundPassive', tileSet: 'p' }, { name: 'backgroundActive', tileSet: 'a' }, { name: 'objects', tileSet: 'o' }],
    rooms: [1, 2].map((num) => ({ num, layers: { backgroundActive: fill(0), backgroundPassive: fill(1), objects: fill(0) } })),
  }
}

const sim = (start: Vec, mode: WorldMode, markExit = true): SimState =>
  createSim(buildWorldGrid(floor(markExit), () => false), defs, teams, anims, 1, start, mode)

/** Walks up for WALK_TICKS ticks; the floorExit events on the way and the last state. */
function walkUp(s: SimState): { exits: number; s: SimState } {
  let exits = 0
  for (let i = 0; i < WALK_TICKS; i++) {
    s = stepSim(s, up)
    exits += s.events.filter((e) => e.kind === 'floorExit').length
  }
  return { exits, s }
}

describe.each<WorldMode>(['rooms', 'continuous'])('floor exit (%s)', (mode) => {
  it('emits floorExit once when Merlin walks up out of the end room', () => {
    const { exits, s } = walkUp(sim({ x: ROOM_W + ROOM_W / 2, y: NEAR_TOP_Y }, mode))
    expect(exits).toBe(1)
    expect(s.floorExited).toBe(true)
    expect(s.room).toEqual({ x: 2, y: 1 })
  })

  it('emits nothing at the top of another room', () => {
    const { exits, s } = walkUp(sim({ x: ROOM_W / 2, y: NEAR_TOP_Y }, mode))
    expect(exits).toBe(0)
    expect(s.floorExited).toBe(false)
  })

  it('never completes the map: a cleared marked floor ends only through its exit', () => {
    const { s } = walkUp(sim({ x: ROOM_W / 2, y: NEAR_TOP_Y }, mode))
    expect(s.mapComplete).toBe(false)
    expect(sim({ x: ROOM_W / 2, y: NEAR_TOP_Y }, mode, false).mapComplete).toBe(true)
  })

  it('emits nothing on a map that does not mark its exit', () => {
    expect(walkUp(sim({ x: ROOM_W + ROOM_W / 2, y: NEAR_TOP_Y }, mode, false)).exits).toBe(0)
  })
})
