// Roguelite floors (docs/plans/2026-10-25-roguelite-mode-design.md): each one a generated floor on the
// tower tilesets, connected, with its exit room open at the top and marked as the exit.
import { describe, expect, it } from 'vitest'
import { roomXYToNum } from '../mr-open/mr-map-format'
import { pageDefs } from '../debug/snapshot-test-data'
import { energyLookup, exitRoom, floorIsConnected, themeIsSolid } from './floor'
import { rogueliteFloor } from './roguelite'
import { runSteps } from './steps'
import { TOWER_FLOORS } from './tower'

const energyOf = energyLookup(pageDefs)
const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1)

describe('roguelite floor', () => {
  for (const theme of TOWER_FLOORS) {
    it(`${theme.id}: connected, its exit room open at the top and marked`, () => {
      const isSolid = themeIsSolid(theme)
      for (const seed of SEEDS) {
        const floor = runSteps(rogueliteFloor(theme, seed, energyOf))
        expect(floor.map.markExit).toBe(true)
        expect(floorIsConnected(floor, isSolid), `seed ${seed}`).toBe(true)
        const exit = floor.map.rooms.find((r) => r.num === roomXYToNum(exitRoom(theme.floorSize), floor.map.mapSize))!
        expect(exit.layers.backgroundActive![0]!.some((tile) => !isSolid(tile)), `seed ${seed}`).toBe(true)
      }
    })
  }
})
