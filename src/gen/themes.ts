// Floor themes for the random floor generator (docs/plans/2026-09-28-random-floor-design.md).
// A theme is data only: tiles per role, room shape tuning, and enemy tables. Tile numbers are
// 1-based indices into the merlin4 tilesets; themes.test.ts checks them against the tile keys.
import type { Vec } from '../mr-open/mr-geometry'
import type { LayerName } from '../mr-open/mr-map-format'

export interface Weighted<T> { value: T; weight: number }

/** A kind of obstacle patch; each patch picks one material, each tile a variant. */
export interface Material { name: string; weight: number; tiles: Weighted<number>[] }

export interface RoomShapeTuning {
  /** obstacle patches per room, and tiles per patch (grown from a random tile) */
  patches: readonly [number, number]
  patchSize: readonly [number, number]
  smoothSteps: number
  /** smoothing: an open tile turns solid with at least this many solid neighbours (of 8) */
  birth: number
  /** chance per room of one long wall from a walled edge toward the centre (U-shaped rooms) */
  longWallChance: number
  /** long wall length in tiles from the edge, for walls from the left/right and the top/bottom */
  longWallSide: readonly [number, number]
  longWallEnd: readonly [number, number]
  /** chance per open tile of a single solid stump */
  stumpChance: number
  /** chance per open tile of a walkable decoration (flowers, pebbles) */
  decorationChance: number
  /** reachable open tiles must be at least this share of the room, or the room is retried */
  minOpenShare: number
}

export interface EdgeTuning {
  /** chance that an edge outside the spanning tree opens too */
  extraOpenChance: number
  /** opening widths in tiles on the left/right edges (9 tall) and the top/bottom edges (18 wide) */
  sideOpening: readonly [number, number]
  endOpening: readonly [number, number]
  /** tiles kept clear inward from an opening on each side */
  openingDepth: number
}

export interface EnemyChoice {
  key: string
  weight: number
  /** only from this difficulty on */
  minDifficulty?: number
  maxPerRoom?: number
}

/** A room with fixed extra units, in engine room coordinates. */
export interface SpecialRoom { label: string; room: Vec; units: Record<string, number> }

export interface UnitTuning {
  player: string
  startMusic: string
  exitMusic: string
  /** difficulty at the start and the exit; rooms in between ramp over x + y progress */
  difficulty: readonly [number, number]
  /** enemies per room: base + perX * x progress + a random 0..random */
  enemiesBase: number
  enemiesPerX: number
  enemiesRandom: number
  enemies: EnemyChoice[]
  /** dwellings per room: floor(perY * y progress + a random 0..1) */
  dwellingsPerY: number
  dwellings: EnemyChoice[]
  specialRooms: SpecialRoom[]
}

export interface FloorTheme {
  id: string
  name: string
  tileSets: Record<LayerName, string>
  /** object key symbol -> index in the objects tileset */
  objectTiles: Record<string, number>
  ground: Weighted<number>[]
  wall: Weighted<number>[]
  longWall: Weighted<number>[]
  materials: Material[]
  stumps: Weighted<number>[]
  decorations: Weighted<number>[]
  shape: RoomShapeTuning
  edges: EdgeTuning
  units: UnitTuning
}

const w = <T>(value: T, weight = 1): Weighted<T> => ({ value, weight })

/** merlin4Objects key indices (assets/tile-keys/merlin4Objects.txt, 8 per row). */
const MERLIN4_OBJECTS: Record<string, number> = {
  player: 1,
  goblinHut: 20,
  goblinArcher: 21,
  goblinWarrior: 22,
  goblinMageHut: 23,
  goblinMage: 24,
  bowOrc: 66,
  mageOrc: 67,
  swordOrc: 68,
  orcHouse: 69,
  musicLastStand: 77,
  musicWoodsOfEvil: 78,
}

// merlin4Active tiles (8 per row): trees and rocks are #solid, flowers and pebbles #none.
const PINES = 10
const LEAFY_TREE = 11
const OAK = 29
const BUSHY_TREE = 32
const SMALL_PINE = 46
const PINE_CLUMP = 81
const GREY_ROCK = 2
const ROCK_PILE = 7
const BOULDER = 26
const CRAGGY_ROCK = 28
const ROUND_ROCK = 38
const STUMP = 47
const PEBBLES = 8
const YELLOW_FLOWERS = 54
const YELLOW_PETALS = 65
const LITTLE_PEBBLES = 66
const BUTTERCUP = 73
// merlin4Passive tiles (7 per row)
const GRASS = 12
const GRASS_FLOWERS = 14

export const GOBLIN_FOREST: FloorTheme = {
  id: 'goblin-forest',
  name: 'Goblin Forest',
  tileSets: { backgroundPassive: 'merlin4Passive', backgroundActive: 'merlin4Active', objects: 'merlin4Objects' },
  objectTiles: MERLIN4_OBJECTS,
  ground: [w(GRASS, 20), w(GRASS_FLOWERS, 1)],
  wall: [w(PINES, 3), w(PINE_CLUMP, 3), w(LEAFY_TREE, 1), w(BUSHY_TREE, 1)],
  longWall: [w(PINES, 2), w(PINE_CLUMP, 2), w(BUSHY_TREE, 1)],
  materials: [
    { name: 'forest', weight: 7, tiles: [w(PINES, 3), w(LEAFY_TREE, 2), w(OAK, 1), w(BUSHY_TREE, 2), w(PINE_CLUMP, 2), w(SMALL_PINE, 1)] },
    { name: 'rocks', weight: 2.5, tiles: [w(GREY_ROCK, 3), w(ROCK_PILE, 2), w(BOULDER, 2), w(CRAGGY_ROCK, 1), w(ROUND_ROCK, 1)] },
  ],
  stumps: [w(STUMP)],
  decorations: [w(YELLOW_FLOWERS, 2), w(BUTTERCUP, 2), w(YELLOW_PETALS, 1), w(PEBBLES, 1), w(LITTLE_PEBBLES, 1)],
  shape: {
    patches: [4, 7],
    patchSize: [2, 9],
    smoothSteps: 1,
    birth: 5,
    longWallChance: 0.45,
    longWallSide: [6, 9],
    longWallEnd: [3, 5],
    stumpChance: 0.012,
    decorationChance: 0.03,
    minOpenShare: 0.6,
  },
  edges: { extraOpenChance: 0.75, sideOpening: [3, 5], endOpening: [4, 8], openingDepth: 2 },
  units: {
    player: 'player',
    startMusic: 'musicWoodsOfEvil',
    exitMusic: 'musicLastStand',
    difficulty: [0, 3],
    enemiesBase: 2,
    enemiesPerX: 1.2,
    enemiesRandom: 1,
    enemies: [
      { key: 'goblinArcher', weight: 6 },
      { key: 'goblinWarrior', weight: 1.5 },
      { key: 'goblinMage', weight: 1.5, minDifficulty: 1.5, maxPerRoom: 2 },
      { key: 'swordOrc', weight: 1, minDifficulty: 2.5, maxPerRoom: 1 },
      { key: 'bowOrc', weight: 0.7, minDifficulty: 2.5, maxPerRoom: 1 },
      { key: 'mageOrc', weight: 0.5, minDifficulty: 2.9, maxPerRoom: 1 },
    ],
    dwellingsPerY: 0.6,
    dwellings: [
      { key: 'goblinHut', weight: 4 },
      { key: 'goblinMageHut', weight: 1, minDifficulty: 2, maxPerRoom: 1 },
    ],
    specialRooms: [
      // the sketch's room 4,1 counts y up from the start: the bottom-right corner here
      { label: 'goblin warrior band', room: { x: 4, y: 4 }, units: { goblinWarrior: 4 } },
      { label: 'orc camp (exit)', room: { x: 4, y: 1 }, units: { orcHouse: 1, swordOrc: 1 } },
    ],
  },
}

export const THEMES: readonly FloorTheme[] = [GOBLIN_FOREST]
