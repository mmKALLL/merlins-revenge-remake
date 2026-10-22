// Generated floors in the real sim, with the page's converted data (pnpm assets:convert): they
// start clear in the start room, clearing the exit room completes the map, and every unit a theme
// can place is a ported actor with sprites.
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { tileCentre } from '../mr-open/mr-geometry'
import { pageDefs, pageTeams } from '../debug/snapshot-test-data'
import { NO_INPUT, type InputSnapshot, type SimState, type WorldMode } from '../sim/state'
import { anims } from '../sim/test-data'
import { createSim, findStartPos, stepSim } from '../sim/tick'
import { buildWorldGrid } from '../sim/world-grid'
import { ROOM_SIZE, exitRoom, generateFloor } from './floor'
import { THEMES, type FloorTheme } from './themes'

const symbols = (name: string): string[] =>
  (JSON.parse(readFileSync(`public/generated/tilesets/${name}.json`, 'utf8')) as { symbols: string[] }).symbols
const KILL: InputSnapshot = { ...NO_INPUT, cheatKillAll: true }
const MUSIC_OBJ_TYPE = 'objMusic'

function start(theme: FloorTheme, seed: number, mode: WorldMode, inExitRoom = false): SimState {
  const active = symbols(theme.tileSets.backgroundActive)
  const objects = symbols(theme.tileSets.objects)
  const floor = generateFloor(theme, seed)
  const grid = buildWorldGrid(floor.map, (i) => i >= 1 && active[i - 1] === 'solid', objects)
  let pos = findStartPos(grid, objects.indexOf('player') + 1)
  if (inExitRoom) {
    const exit = exitRoom(theme.floorSize)
    const enemy = floor.placements.find((p) => p.room.x === exit.x && p.room.y === exit.y)!
    pos = tileCentre((exit.x - 1) * ROOM_SIZE.x + enemy.tile.x + 1, (exit.y - 1) * ROOM_SIZE.y + enemy.tile.y + 1)
  }
  return createSim(grid, pageDefs, pageTeams, anims, seed, pos, mode)
}

describe.each(THEMES)('random floor in the sim: $name', (theme) => {
  it('starts in a clear start room and runs in both world modes', () => {
    for (const mode of ['rooms', 'continuous'] as const) {
      let s = start(theme, 7, mode)
      if (mode === 'rooms') expect(s.exitsOpen).toBe(true)
      for (let i = 0; i < 90; i++) s = stepSim(s, NO_INPUT)
      expect(s.mapComplete).toBe(false)
    }
  })

  it('completes the map when the exit room is cleared', () => {
    let s = start(theme, 7, 'rooms', true)
    expect(s.room).toEqual(exitRoom(theme.floorSize))
    expect(s.exitsOpen).toBe(false)
    for (let i = 0; i < 600 && !s.mapComplete; i++) s = stepSim(s, i % 30 === 0 ? KILL : NO_INPUT)
    expect(s.mapComplete).toBe(true)
  })

  it('places only ported actors with sprites', () => {
    for (const key of Object.keys(theme.objectTiles)) {
      const def = pageDefs[key]
      expect(def, key).toBeDefined()
      if (def!.objType === MUSIC_OBJ_TYPE) continue
      expect(existsSync(`public/generated/sprites/${def!.name}.json`), `${key} (${def!.name})`).toBe(true)
    }
  })
})
