// The roguelite run's floors (docs/plans/2026-10-25-roguelite-mode-design.md, Biomes): for each floor
// from the bottom, the biomes it may be. Every biome draws from the tower tilesets, so the page's
// tilesets never change between floors. Each floor offers its tower floor and one of the run's own biomes.
import type { Vec } from '../mr-open/mr-geometry'
import type { MapDefinition } from '../mr-open/mr-map-format'
import { MEDIKIT_CHARACTER } from '../mr-open/mr-pickup'
import type { EnergyOf } from './floor'
import { GenRandom } from './random'
import { rogueliteFloor } from './roguelite'
import type { Steps } from './steps'
import { DEEP_FOREST, DRAGON_CANYON, GOBLIN_FOREST, GOLDEN_PALACE, GOLEM_MOUNTAIN, HYDRA_MARSH, MAGIC_MAZE, UNDEAD_MARSH, type FloorTheme, type RoomPlan } from './themes'
import { inTowerTilesets } from './tower-tilesets'

/** Owner (2026-10-26): the run's last floor is 4x4 rooms (the tower keeps its floors 3 wide). */
const LAST_FLOOR_SIZE: Vec = { x: 4, y: 4 }
/**
 * The 3x3 plan cell (row, column) of each room of the 4x4 floor: the corners stay corners, the
 * diagonal from the start to the exit keeps the centre cell, and the rooms on either side of it
 * repeat their half's cells, so generators still gather toward the midboss corner and regular
 * enemies toward the "numerous weak" corner.
 */
const STRETCHED_CELLS: readonly (readonly (readonly [number, number])[])[] = [
  [[0, 0], [0, 1], [0, 1], [0, 2]],
  [[1, 0], [1, 0], [1, 1], [1, 2]],
  [[1, 0], [1, 1], [1, 2], [1, 2]],
  [[2, 0], [2, 1], [2, 1], [2, 2]],
]

/** A 3x3 room plan stretched to the 4x4 floor (STRETCHED_CELLS). */
function stretchedPlan(plan: RoomPlan): RoomPlan {
  return STRETCHED_CELLS.map((row) => row.map(([r, c]) => {
    const cell = plan[r]?.[c]
    if (!cell) throw new Error(`stretched room plan: the plan has no cell ${r},${c}`)
    return cell
  }))
}

/** Owner: the last floor's side corners hold medikits in place of the potions. */
const LAST_FLOOR_CORNER_PICKUPS = [{ value: MEDIKIT_CHARACTER, weight: 1 }]

/** A floor-4 biome as the roguelite's last floor: 4x4 rooms, medikits in its side corners. */
const asLastFloor = (theme: FloorTheme): FloorTheme => ({
  ...theme,
  floorSize: LAST_FLOOR_SIZE,
  units: { ...theme.units, roomPlan: stretchedPlan(theme.units.roomPlan), potions: LAST_FLOOR_CORNER_PICKUPS },
})

/** For each floor from the bottom, the biomes it may be, in their own tilesets (floor.test.ts checks them as it does the themes). */
export const ROGUELITE_BIOMES: readonly (readonly FloorTheme[])[] = [
  [GOBLIN_FOREST, DEEP_FOREST],
  [UNDEAD_MARSH, HYDRA_MARSH],
  [DRAGON_CANYON, GOLEM_MOUNTAIN],
  [MAGIC_MAZE, GOLDEN_PALACE].map(asLastFloor),
]

/** ROGUELITE_BIOMES drawing from the tower tilesets, as the run plays them. */
export const ROGUELITE_FLOORS: readonly (readonly FloorTheme[])[] = ROGUELITE_BIOMES.map((biomes) => biomes.map(inTowerTilesets))

/** Mixes the floor number into the run seed, so each floor's seed is its own. */
const FLOOR_SEED_MIX = 0x9e3779b9
/** Floor seeds are uniform over 32 bits. */
const SEED_RANGE = 2 ** 32

/** The seed of a floor (0 = the first) of the run with this seed. */
export const floorSeed = (runSeed: number, floor: number): number =>
  Math.floor(new GenRandom((runSeed ^ Math.imul(floor + 1, FLOOR_SEED_MIX)) >>> 0).next() * SEED_RANGE)

/** The salt of the first-biome draw's seed, apart from every floor's (the first draw of nearby small seeds is alike). */
const FIRST_BIOME_SALT = 0x85ebca6b

/** The run's first floor: one of floor 1's biomes, at random from the run seed. */
export const firstBiome = (runSeed: number): FloorTheme =>
  new GenRandom(floorSeed((runSeed ^ FIRST_BIOME_SALT) >>> 0, 0)).pick(ROGUELITE_FLOORS[0]!)

/** The map of the run's floor (0 = the first) in the chosen biome, `startPickups` (object keys) in its start room. */
export function* rogueliteFloorMap(biome: FloorTheme, runSeed: number, floor: number, energyOf: EnergyOf, startPickups: readonly string[]): Steps<MapDefinition> {
  return (yield* rogueliteFloor(biome, floorSeed(runSeed, floor), energyOf, startPickups)).map
}
