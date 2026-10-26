// Roguelite floors (docs/plans/2026-10-25-roguelite-mode-design.md): each one a generated floor on the
// tower tilesets, connected, with its exit room open at the top and marked as the exit.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { roomXYToNum } from '../mr-open/mr-map-format'
import { pageDefs } from '../debug/snapshot-test-data'
import type { Vec } from '../mr-open/mr-geometry'
import { ROOM_SIZE, cornerRoom, energyLookup, inDoorway, exitRoom, floorCells, floorIsConnected, themeIsSolid, worldTile, type GeneratedFloor } from './floor'
import { ROGUELITE_MAP_ID, generateMap, isGeneratedMapId } from './generated-maps'
import { floodOpen } from './grid'
import { inOpeningBand, signTiles } from './location-sign'
import { SAFE_ARRIVAL_TILES, rogueliteFloor } from './roguelite'
import { ROGUELITE_FLOORS, firstBiome, floorSeed, rogueliteFloorMap } from './roguelite-biomes'
import { runSteps } from './steps'
import type { FloorTheme } from './themes'
import { TOWER_TILESETS } from './tower-tilesets'
import { rewardPickups, rewardPools, rollRewards, startingKitPickups } from '../run/rewards'

const energyOf = energyLookup(pageDefs)
const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1)
const ARRIVAL_SEEDS = Array.from({ length: 50 }, (_, i) => i * 7919 + 1)
const BIOMES = [...new Set(ROGUELITE_FLOORS.flat())]
const sameVec = (a: Vec, b: Vec) => a.x === b.x && a.y === b.y
const sorted = (keys: readonly string[]) => [...keys].sort()

/** Merlin, the start music and the start room's pickups: what may stand near his arrival. */
const friendlyKeys = (theme: FloorTheme, pickups: readonly string[]): Set<string> => new Set([theme.units.player, theme.units.startMusic, ...pickups])
/** Some pickups for the floors whose pickups are not under test. */
const SOME_PICKUPS = ['maxikit', 'medikit']

const playerOf = (floor: GeneratedFloor, theme: FloorTheme) => floor.placements.find((p) => p.key === theme.units.player)!

describe('roguelite floor', () => {
  for (const theme of ROGUELITE_FLOORS.flat()) {
    it(`${theme.id}: connected, its exit room open at the top and marked`, () => {
      const isSolid = themeIsSolid(theme)
      for (const seed of SEEDS) {
        const floor = runSteps(rogueliteFloor(theme, seed, energyOf, SOME_PICKUPS))
        expect(floor.map.markExit).toBe(true)
        expect(floorIsConnected(floor, isSolid), `seed ${seed}`).toBe(true)
        const exit = floor.map.rooms.find((r) => r.num === roomXYToNum(exitRoom(theme.floorSize), floor.map.mapSize))!
        expect(exit.layers.backgroundActive![0]!.some((tile) => !isSolid(tile)), `seed ${seed}`).toBe(true)
      }
    })
  }
})

describe('roguelite last floor (owner: 4x4, medikits in the side corners)', () => {
  const potionKeys = new Set(['manaCapacity', 'manaBurst', 'manaFlow', 'walkSpeed'])
  for (const theme of ROGUELITE_FLOORS[3]!) {
    it(`${theme.id}: 4x4 rooms, connected, two medikits and no potion in each side corner`, () => {
      const isSolid = themeIsSolid(theme)
      for (const seed of SEEDS) {
        const floor = runSteps(rogueliteFloor(theme, seed, energyOf, SOME_PICKUPS))
        expect(floor.map.mapSize).toEqual({ x: 4, y: 4 })
        expect(floorIsConnected(floor, isSolid), `seed ${seed}`).toBe(true)
        for (const corner of ['farX', 'farY'] as const) {
          const room = cornerRoom(theme.floorSize, corner)
          const keys = floor.placements.filter((p) => sameVec(p.room, room)).map((p) => p.key)
          expect(keys.filter((k) => k === 'medikit'), `seed ${seed} ${corner}`).toHaveLength(2)
          expect(keys.filter((k) => potionKeys.has(k)), `seed ${seed} ${corner}`).toEqual([])
        }
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
    expect(generateMap(ROGUELITE_MAP_ID, seed, energyOf)).toEqual(runSteps(rogueliteFloorMap(firstBiome(seed), seed, 0, energyOf, startingKitPickups(seed))))
  })

  it('makes the quadranids mid enemies on floor 2 (owner)', () => {
    for (const theme of ROGUELITE_FLOORS[1]!) {
      expect(theme.units.enemies.filter((c) => c.key === 'quadranid').map((c) => c.tier), theme.id).toEqual(['mid'])
    }
  })

  it('gives each floor of a run its own seed', () => {
    const seeds = ROGUELITE_FLOORS.map((_, floor) => floorSeed(7, floor))
    expect(new Set(seeds).size).toBe(seeds.length)
  })
})

describe.each(BIOMES)('roguelite location sign: $name', (theme) => {
  const towerActive = (JSON.parse(readFileSync(`public/generated/tilesets/${TOWER_TILESETS.backgroundActive}.json`, 'utf8')) as { symbols: string[] }).symbols

  it('is an original sign, 2 or 3 solid tiles of the tower\'s active tileset', () => {
    const sign = theme.locationSign!
    expect(sign.tileSet).toBe(TOWER_TILESETS.backgroundActive)
    expect([2, 3]).toContain(sign.tiles.length)
    for (const t of sign.tiles) expect(towerActive[t - 1], `tile ${t}`).toBe('solid')
  })
})

describe.each(BIOMES)('roguelite arrival: $name', (theme) => {
  const isSolid = themeIsSolid(theme)
  const floors = ARRIVAL_SEEDS.map((seed) => {
    const pickups = startingKitPickups(seed)
    return { seed, pickups, floor: runSteps(rogueliteFloor(theme, seed, energyOf, pickups)) }
  })

  it(`places no unit within ${SAFE_ARRIVAL_TILES} tiles of Merlin`, () => {
    for (const { seed, pickups, floor } of floors) {
      const friendly = friendlyKeys(theme, pickups)
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
      expect(sign!.room).toEqual(floor.map.startRoom)
      const edges = floor.edges[`${sign!.room.x},${sign!.room.y}`]!
      const room = floor.map.rooms.find((r) => r.num === roomXYToNum(sign!.room, floor.map.mapSize))!
      expect(signTiles(sign!).map((t) => room.layers.backgroundActive![t.y]![t.x]), `seed ${seed}`).toEqual(theme.locationSign!.tiles)
      expect(signTiles(sign!).some((t) => sameVec(t, playerOf(floor, theme).tile)), `seed ${seed}`).toBe(false)
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

describe('roguelite start pickups', () => {
  /** The start room's placements besides Merlin and the start music. */
  const startPickupsOf = (floor: GeneratedFloor, theme: FloorTheme) =>
    floor.placements.filter((p) => sameVec(p.room, floor.map.startRoom) && p.key !== theme.units.player && p.key !== theme.units.startMusic)

  /** Throws unless the start room holds exactly `pickups`, off the sign, the doorways and Merlin's tile. */
  function expectLaidOut(floor: GeneratedFloor, theme: FloorTheme, pickups: readonly string[], label: string) {
    const placed = startPickupsOf(floor, theme)
    expect(sorted(placed.map((p) => p.key)), label).toEqual(sorted(pickups))
    const edges = floor.edges[`${floor.map.startRoom.x},${floor.map.startRoom.y}`]!
    const sign = signTiles(floor.map.locationSign!)
    const merlin = playerOf(floor, theme).tile
    for (const p of placed) {
      expect(inDoorway(edges, p.tile), label).toBe(false)
      expect(sign.some((t) => sameVec(t, p.tile)), label).toBe(false)
      expect(sameVec(p.tile, merlin), label).toBe(false)
    }
  }

  it('lays out the starting kit on the first floor: a scroll, a medikit and 5 potions of 2 types', () => {
    for (const seed of SEEDS) {
      const kit = startingKitPickups(seed)
      const theme = firstBiome(seed)
      const potions = kit.filter((k) => theme.units.startRewards.potions.some((p) => p.value === k))
      expect(potions, `seed ${seed}`).toHaveLength(5)
      expect(new Set(potions).size, `seed ${seed}`).toBe(2)
      expect(kit.filter((k) => !potions.includes(k)).sort(), `seed ${seed}`).toEqual(sorted(['medikit', kit[0]!]))
      expect(theme.units.startRewards.spellScrolls.map((s) => s.value), `seed ${seed}`).toContain(kit[0])
      expectLaidOut(runSteps(rogueliteFloor(theme, floorSeed(seed, 0), energyOf, kit)), theme, kit, `seed ${seed}`)
    }
  })

  it('lays out each reward of the later floors and none of the theme\'s start rewards', () => {
    for (const [floor, biomes] of ROGUELITE_FLOORS.entries()) {
      if (floor === 0) continue
      for (const seed of SEEDS.slice(0, 5)) {
        for (const reward of rollRewards(seed, floor, rewardPools(biomes), () => false)) {
          for (const theme of biomes) {
            const pickups = rewardPickups(reward)
            const label = `floor ${floor} seed ${seed} ${theme.id} ${reward.kind}`
            expectLaidOut(runSteps(rogueliteFloor(theme, floorSeed(seed, floor), energyOf, pickups)), theme, pickups, label)
          }
        }
      }
    }
  })
})
