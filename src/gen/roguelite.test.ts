// Roguelite floors (docs/plans/2026-10-25-roguelite-mode-design.md): each one a generated floor on the
// tower tilesets, connected, with its exit room open at the top and marked as the exit.
import { describe, expect, it } from 'vitest'
import { roomXYToNum } from '../mr-open/mr-map-format'
import { pageDefs } from '../debug/snapshot-test-data'
import type { Vec } from '../mr-open/mr-geometry'
import { ROOM_SIZE, energyLookup, exitRoom, floorCells, floorIsConnected, themeIsSolid, worldTile, type GeneratedFloor } from './floor'
import { ROGUELITE_MAP_ID, generateMap, isGeneratedMapId } from './generated-maps'
import { floodOpen } from './grid'
import { inOpeningBand, signTiles } from './location-sign'
import { SAFE_ARRIVAL_TILES, rogueliteFloor } from './roguelite'
import { ROGUELITE_FLOORS, firstBiome, floorSeed, rogueliteFloorMap } from './roguelite-biomes'
import { runSteps } from './steps'
import type { FloorTheme } from './themes'
import { TOWER_FLOORS } from './tower'

const energyOf = energyLookup(pageDefs)
const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1)
const ARRIVAL_SEEDS = Array.from({ length: 50 }, (_, i) => i * 7919 + 1)
const BIOMES = [...new Set(ROGUELITE_FLOORS.flat())]
const sameVec = (a: Vec, b: Vec) => a.x === b.x && a.y === b.y

/** Merlin and the start room's pickups: what may stand near his arrival. */
function friendlyKeys(theme: FloorTheme): Set<string> {
  const u = theme.units
  const r = u.startRewards
  return new Set([u.player, u.startMusic, 'medikit', ...r.potions.map((p) => p.value), ...r.spellScrolls.map((s) => s.value), ...r.extras])
}

const playerOf = (floor: GeneratedFloor, theme: FloorTheme) => floor.placements.find((p) => p.key === theme.units.player)!

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

describe('roguelite run map', () => {
  it('has 4 floors, each with at least one biome', () => {
    expect(ROGUELITE_FLOORS).toHaveLength(4)
    for (const biomes of ROGUELITE_FLOORS) expect(biomes.length).toBeGreaterThan(0)
  })

  it('is a generated map id whose map is the first floor, in one of its biomes', () => {
    expect(isGeneratedMapId(ROGUELITE_MAP_ID)).toBe(true)
    const seed = 7
    expect(ROGUELITE_FLOORS[0]).toContain(firstBiome(seed))
    expect(generateMap(ROGUELITE_MAP_ID, seed, energyOf)).toEqual(runSteps(rogueliteFloorMap(firstBiome(seed), seed, 0, energyOf)))
  })

  it('gives each floor of a run its own seed', () => {
    const seeds = ROGUELITE_FLOORS.map((_, floor) => floorSeed(7, floor))
    expect(new Set(seeds).size).toBe(seeds.length)
  })
})

describe.each(BIOMES)('roguelite arrival: $name', (theme) => {
  const isSolid = themeIsSolid(theme)
  const floors = ARRIVAL_SEEDS.map((seed) => ({ seed, floor: runSteps(rogueliteFloor(theme, seed, energyOf)) }))

  it(`places no unit within ${SAFE_ARRIVAL_TILES} tiles of Merlin`, () => {
    const friendly = friendlyKeys(theme)
    for (const { seed, floor } of floors) {
      const at = worldTile(playerOf(floor, theme))
      const near = floor.placements.filter((p) => {
        const t = worldTile(p)
        return Math.abs(t.x - at.x) + Math.abs(t.y - at.y) <= SAFE_ARRIVAL_TILES
      })
      expect(near.map((p) => p.key).filter((k) => !friendly.has(k)), `seed ${seed}`).toEqual([])
    }
  })

  it('stands the sign in the start room, off the openings\' bands and the placements, the room still connected', () => {
    for (const { seed, floor } of floors) {
      const sign = floor.map.locationSign
      expect(sign, `seed ${seed}`).toBeDefined()
      expect(sign!.text).toBe(theme.name)
      expect(sign!.room).toEqual(floor.map.startRoom)
      const edges = floor.edges[`${sign!.room.x},${sign!.room.y}`]!
      const room = floor.map.rooms.find((r) => r.num === roomXYToNum(sign!.room, floor.map.mapSize))!
      for (const t of signTiles(sign!)) {
        expect(t.x > 0 && t.y > 0 && t.x < ROOM_SIZE.x - 1 && t.y < ROOM_SIZE.y - 1, `seed ${seed}`).toBe(true)
        expect(inOpeningBand(edges, t), `seed ${seed}`).toBe(false)
        expect(floor.placements.some((p) => sameVec(p.room, sign!.room) && sameVec(p.tile, t)), `seed ${seed}`).toBe(false)
        expect(isSolid(room.layers.backgroundActive![t.y]![t.x]!), `seed ${seed}`).toBe(true)
      }
      expect(floorIsConnected(floor, isSolid), `seed ${seed}`).toBe(true)
      // every open tile of the start room is still reached from Merlin
      const { cells, size } = floorCells(floor, isSolid)
      const reach = floodOpen(cells, size, [worldTile(playerOf(floor, theme))])
      const origin = { x: (sign!.room.x - 1) * ROOM_SIZE.x, y: (sign!.room.y - 1) * ROOM_SIZE.y }
      for (let y = 0; y < ROOM_SIZE.y; y++) {
        for (let x = 0; x < ROOM_SIZE.x; x++) {
          const i = (origin.y + y) * size.x + origin.x + x
          if (!isSolid(room.layers.backgroundActive![y]![x]!)) expect(reach[i], `seed ${seed} tile ${x},${y}`).toBe(true)
        }
      }
    }
  })
})
