// The roguelite run's floors (docs/plans/2026-10-25-roguelite-mode-design.md, Biomes): for each floor
// from the bottom, the biomes it may be. Every biome draws from the tower tilesets, so the page's
// tilesets never change between floors. The new biomes join each floor's list in a later slice.
import type { MapDefinition } from '../mr-open/mr-map-format'
import type { EnergyOf } from './floor'
import { GenRandom } from './random'
import { rogueliteFloor } from './roguelite'
import type { Steps } from './steps'
import { DRAGON_CANYON, GOBLIN_FOREST, MAGIC_MAZE, UNDEAD_MARSH, type FloorTheme } from './themes'
import { inTowerTilesets } from './tower-tilesets'

export const ROGUELITE_FLOORS: readonly (readonly FloorTheme[])[] = [[GOBLIN_FOREST], [UNDEAD_MARSH], [DRAGON_CANYON], [MAGIC_MAZE]]
  .map((biomes) => biomes.map(inTowerTilesets))

/** Mixes the floor number into the run seed, so each floor's seed is its own. */
const FLOOR_SEED_MIX = 0x9e3779b9
/** Floor seeds are uniform over 32 bits. */
const SEED_RANGE = 2 ** 32

/** The seed of a floor (0 = the first) of the run with this seed. */
export const floorSeed = (runSeed: number, floor: number): number =>
  Math.floor(new GenRandom((runSeed ^ Math.imul(floor + 1, FLOOR_SEED_MIX)) >>> 0).next() * SEED_RANGE)

/** The run's first floor: one of floor 1's biomes, at random from the run seed. */
export const firstBiome = (runSeed: number): FloorTheme => new GenRandom(runSeed).pick(ROGUELITE_FLOORS[0]!)

/** The map of the run's floor (0 = the first) in the chosen biome. */
export function* rogueliteFloorMap(biome: FloorTheme, runSeed: number, floor: number, energyOf: EnergyOf): Steps<MapDefinition> {
  return (yield* rogueliteFloor(biome, floorSeed(runSeed, floor), energyOf)).map
}
