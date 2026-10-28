// Remake (owner request): exits opened by a room's clear let Merlin out only after the player's
// exitOpenDelayTicks; the exits (and their arrows) are open from the start of the delay.
import { describe, expect, it } from 'vitest'
import type { MapDefinition } from '../mr-open/mr-map-format'
import { NO_INPUT, type InputSnapshot, type SimState } from './state'
import { anims, defs, teams } from './test-data'
import { createSim, stepSim } from './tick'
import { buildWorldGrid } from './world-grid'

const SYMBOLS = ['none', 'goblinWarrior']
const DELAY = 18
const KILL: InputSnapshot = { ...NO_INPUT, cheatKillAll: true }
const WALK_RIGHT: InputSnapshot = { ...NO_INPUT, move: { x: 1, y: 0 } }

/** Two open 18x9 rooms side by side, a goblin warrior in the first. */
function twoRooms(): MapDefinition {
  const fill = (v: number) => Array.from({ length: 9 }, () => Array(18).fill(v))
  const objects = fill(0)
  objects[4]![9] = SYMBOLS.indexOf('goblinWarrior') + 1
  return {
    mapSize: { x: 2, y: 1 }, roomSize: { x: 18, y: 9 }, startRoom: { x: 1, y: 1 },
    layers: [{ name: 'backgroundPassive', tileSet: 'p' }, { name: 'backgroundActive', tileSet: 'a' }, { name: 'objects', tileSet: 'o' }],
    rooms: [1, 2].map((num) => ({ num, layers: { backgroundActive: fill(1), backgroundPassive: fill(1), objects: num === 1 ? objects : fill(0) } })),
  }
}

/** Merlin against the first room's right edge; the goblin killed, stepped (walking right) until the exits open. */
function clearedWithDelay(delay: number): SimState {
  const delayed = { ...defs, player: { ...defs['player']!, exitOpenDelayTicks: delay } }
  const grid = buildWorldGrid(twoRooms(), () => false, SYMBOLS)
  let s = stepSim(createSim(grid, delayed, teams, anims, 1, { x: grid.roomRectPx({ x: 1, y: 1 }).right - 20, y: 144 }), KILL)
  for (let i = 0; i < 300 && !s.exitsOpen; i++) s = stepSim(s, WALK_RIGHT)
  expect(s.exitsOpen).toBe(true)
  return s
}

/** Ticks of walking right until Merlin is in the second room. */
function ticksToLeave(s0: SimState): number {
  let s = s0
  for (let i = 1; i <= 120; i++) {
    s = stepSim(s, WALK_RIGHT)
    if (s.room.x === 2) return i
    expect(s.exitsOpen).toBe(true)
  }
  throw new Error('Merlin never left the room')
}

describe('exitOpenDelayTicks', () => {
  it('keeps Merlin in the cleared room for the delay, then lets him out', () => {
    const atOnce = ticksToLeave(clearedWithDelay(0))
    const delayed = ticksToLeave(clearedWithDelay(DELAY))
    expect(delayed).toBeGreaterThanOrEqual(DELAY)
    expect(delayed).toBeGreaterThan(atOnce)
  })
})
