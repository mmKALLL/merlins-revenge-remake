// A generated floor in the real sim, with the page's converted data (pnpm assets:convert): it
// starts clear in the start room, and clearing the exit room completes the map.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { tileCentre } from '../mr-open/mr-geometry'
import { pageDefs, pageTeams } from '../debug/snapshot-test-data'
import { NO_INPUT, type InputSnapshot, type SimState, type WorldMode } from '../sim/state'
import { anims } from '../sim/test-data'
import { createSim, findStartPos, stepSim } from '../sim/tick'
import { buildWorldGrid } from '../sim/world-grid'
import { EXIT_ROOM, ROOM_SIZE, generateFloor } from './floor'
import { GOBLIN_FOREST } from './themes'

const symbols = (name: string): string[] =>
  (JSON.parse(readFileSync(`public/generated/tilesets/${name}.json`, 'utf8')) as { symbols: string[] }).symbols
const active = symbols(GOBLIN_FOREST.tileSets.backgroundActive)
const objects = symbols(GOBLIN_FOREST.tileSets.objects)
const KILL: InputSnapshot = { ...NO_INPUT, cheatKillAll: true }

function start(seed: number, mode: WorldMode, inExitRoom = false): SimState {
  const floor = generateFloor(GOBLIN_FOREST, seed)
  const grid = buildWorldGrid(floor.map, (i) => i >= 1 && active[i - 1] === 'solid', objects)
  let pos = findStartPos(grid, objects.indexOf('player') + 1)
  if (inExitRoom) {
    const enemy = floor.placements.find((p) => p.room.x === EXIT_ROOM.x && p.room.y === EXIT_ROOM.y)!
    pos = tileCentre((EXIT_ROOM.x - 1) * ROOM_SIZE.x + enemy.tile.x + 1, (EXIT_ROOM.y - 1) * ROOM_SIZE.y + enemy.tile.y + 1)
  }
  return createSim(grid, pageDefs, pageTeams, anims, seed, pos, mode)
}

describe('random floor in the sim', () => {
  it('starts in a clear start room and runs in both world modes', () => {
    for (const mode of ['rooms', 'continuous'] as const) {
      let s = start(7, mode)
      if (mode === 'rooms') expect(s.exitsOpen).toBe(true)
      for (let i = 0; i < 90; i++) s = stepSim(s, NO_INPUT)
      expect(s.mapComplete).toBe(false)
    }
  })

  it('completes the map when the exit room is cleared', () => {
    let s = start(7, 'rooms', true)
    expect(s.room).toEqual(EXIT_ROOM)
    expect(s.exitsOpen).toBe(false)
    for (let i = 0; i < 300 && !s.mapComplete; i++) s = stepSim(s, i % 30 === 0 ? KILL : NO_INPUT)
    expect(s.mapComplete).toBe(true)
  })
})
