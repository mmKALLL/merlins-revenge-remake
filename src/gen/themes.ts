// Floor themes for the random floor generator (docs/plans/2026-09-28-random-floor-design.md),
// after the four floors of docs/design/the-sorcerers-tower.md. A theme is data only: floor size,
// tiles per role, room shape tuning (including which interior wall styles it uses), and enemy
// tables. Tile numbers are 1-based indices into the theme's tilesets; floor.test.ts checks them
// against the tile keys.
import type { Vec } from '../mr-open/mr-geometry'
import type { LayerName } from '../mr-open/mr-map-format'

export interface Weighted<T> { value: T; weight: number }

/** A kind of obstacle patch; each patch picks one material, each tile a variant. */
export interface Material { name: string; weight: number; tiles: Weighted<number>[] }

/** Tree lines cutting through a room from an edge, some turning once (L and T shaped rooms). */
export interface CutTuning {
  /** chance per room of a cut, and of a second one */
  chance: number
  extraChance: number
  /** chance that a cut turns once, partway across */
  turnChance: number
  /** chance that a cut leaves a gap, and its width in tiles */
  gapChance: number
  gapWidth: readonly [number, number]
  /** chance per step of a sideways step, so the line looks grown rather than built */
  wobbleChance: number
}

/** Parallel walls from alternating sides of a room, so the way through zigzags (S shapes). */
export interface BaffleTuning {
  chance: number
  /** walls per room */
  count: readonly [number, number]
  /** wall length as a share of the room across the wall's direction */
  reach: readonly [number, number]
  /** chance the walls stand vertically (spaced along the room's width) */
  verticalChance: number
  thickness: readonly [number, number]
}

/** Recursive division of a room into chambers, each wall with one door (mazes). */
export interface DivisionTuning {
  /** narrowest chamber or corridor in tiles */
  minChamber: number
  doorWidth: readonly [number, number]
  /** chance to stop dividing a region that could still be divided */
  stopChance: number
}

export interface RoomShapeTuning {
  /** obstacle patches per room, and tiles per patch (grown from a random tile) */
  patches: readonly [number, number]
  patchSize: readonly [number, number]
  smoothSteps: number
  /** smoothing: an open tile turns solid with at least this many solid neighbours (of 8) */
  birth: number
  /** interior wall styles, each optional */
  division?: DivisionTuning
  baffles?: BaffleTuning
  cuts?: CutTuning
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
  /** extra weight in the far column (toward the exit along x) and the far row (along y), ramped */
  weightFarX?: number
  weightFarY?: number
  /** only from this difficulty on */
  minDifficulty?: number
  maxPerRoom?: number
  /** summons units (its weapon is a summon spell), so it counts as a producer like a dwelling */
  producer?: boolean
  /**
   * Teams that hate each other brawl (engine-mechanics-enemies-3.md, Teams), so a room draws one
   * faction and only takes choices of that faction (or of none).
   */
  faction?: string
}

/**
 * Floor corners as the sketch names them: it counts x right and y up from the start corner, so
 * `farX` is its room "4,1" (the other bottom corner) and `farY` its room "1,4" (the other top corner).
 */
export type Corner = 'exit' | 'farX' | 'farY'

/** A fixed group of units; `faction` sets the room's faction for its other enemies. */
export interface UnitGroup { label: string; units: Record<string, number>; faction?: string }

/** A side corner room with one of its groups (picked at random) on top of the usual enemies. */
export interface SpecialRoom { corner: Exclude<Corner, 'exit'>; groups: UnitGroup[] }

/** An exit room group; its `boss` unit stands two tiles in from the floor's far corner. */
export interface BossGroup extends UnitGroup { boss: string }

/** An amount ramping over x progress (0 at the start column, 1 at the far one): floor(base + farX * x + a random 0..1). */
export interface Amount { base: number; farX: number }

/**
 * How a room brings its numbers (quantity, over x): a swarm of single regular enemies, or a few
 * producers (dwellings and summoners) with a few regular enemies alongside. The exit room has both.
 */
export interface QuantityTuning {
  swarmWeight: number
  producerWeight: number
  swarm: Amount
  producers: Amount
  /** regular enemies alongside the producers */
  escorts: readonly [number, number]
}

export interface UnitTuning {
  player: string
  startMusic: string
  exitMusic: string
  /** quality: the difficulty in the start row and the far row, ramping over y progress in between */
  difficulty: readonly [number, number]
  quantity: QuantityTuning
  /** regular enemies and summoners (`producer`) */
  enemies: EnemyChoice[]
  dwellings: EnemyChoice[]
  specialRooms: SpecialRoom[]
  /** the exit room picks one */
  bosses: BossGroup[]
}

export interface FloorTheme {
  id: string
  name: string
  /** rooms across and down */
  floorSize: Vec
  tileSets: Record<LayerName, string>
  /** object key symbol -> index in the objects tileset */
  objectTiles: Record<string, number>
  ground: Weighted<number>[]
  wall: Weighted<number>[]
  /** interior walls: long walls, cuts, baffles and maze walls */
  longWall: Weighted<number>[]
  materials: Material[]
  stumps: Weighted<number>[]
  decorations: Weighted<number>[]
  shape: RoomShapeTuning
  edges: EdgeTuning
  units: UnitTuning
}

export const DEFAULT_FLOOR_SIZE: Vec = { x: 3, y: 3 }

const w = <T>(value: T, weight = 1): Weighted<T> => ({ value, weight })

// ---- Goblin Forest (merlin4 tilesets) ----

/** merlin4Objects key indices (assets/tile-keys/merlin4Objects.txt, 8 per row). */
export const MERLIN4_OBJECTS: Record<string, number> = {
  player: 1,
  goblinHero: 19,
  goblinHut: 20,
  goblinArcher: 21,
  goblinWarrior: 22,
  goblinMageHut: 23,
  goblinMage: 24,
  batTree: 49,
  bat: 50,
  hydra1: 57,
  bowOrc: 66,
  mageOrc: 67,
  swordOrc: 68,
  orcHouse: 69,
  musicLastStand: 77,
  musicWoodsOfEvil: 78,
}

export const MERLIN4_TILESETS: Record<LayerName, string> = {
  backgroundPassive: 'merlin4Passive',
  backgroundActive: 'merlin4Active',
  objects: 'merlin4Objects',
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
  floorSize: DEFAULT_FLOOR_SIZE,
  tileSets: MERLIN4_TILESETS,
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
    quantity: {
      swarmWeight: 2,
      producerWeight: 1,
      swarm: { base: 2, farX: 3.6 },
      producers: { base: 1, farX: 1.5 },
      escorts: [0, 2],
    },
    enemies: [
      { key: 'goblinArcher', weight: 6 },
      { key: 'goblinWarrior', weight: 1.5 },
      { key: 'bat', weight: 1, minDifficulty: 1, maxPerRoom: 2 },
      { key: 'goblinMage', weight: 1.5, minDifficulty: 1.5, maxPerRoom: 2 },
      { key: 'swordOrc', weight: 1, minDifficulty: 2.5, maxPerRoom: 1 },
      { key: 'bowOrc', weight: 0.7, minDifficulty: 2.5, maxPerRoom: 1 },
      { key: 'mageOrc', weight: 0.5, minDifficulty: 2.9, maxPerRoom: 1, producer: true },
    ],
    dwellings: [
      { key: 'goblinHut', weight: 4 },
      { key: 'batTree', weight: 0.6, minDifficulty: 1.5, maxPerRoom: 1 },
      { key: 'goblinMageHut', weight: 1, minDifficulty: 2, maxPerRoom: 1 },
    ],
    specialRooms: [
      { corner: 'farX', groups: [{ label: 'goblin warrior band', units: { goblinWarrior: 4 } }] },
    ],
    bosses: [
      { label: 'orc camp', units: { orcHouse: 1, swordOrc: 1 }, boss: 'swordOrc' },
      { label: 'hydra trainer', units: { hydra1: 1, goblinHero: 1, goblinWarrior: 1 }, boss: 'hydra1' },
    ],
  },
}

// ---- the other floors (merlinOpen tilesets, which hold every ported actor) ----

/** merlinOpenObjects key indices (assets/tile-keys/merlinOpenObjects.txt, 10 per row). */
export const MERLIN_OPEN_OBJECTS: Record<string, number> = {
  player: 2,
  skeletonArcher: 81,
  skeletonWarrior: 82,
  skeletonThrower: 83,
  greyGhost: 84,
  necromancer: 85,
  darkMage: 86,
  skeletonDwelling: 87,
  skeletonComando: 90,
  skelitonLord: 91,
  skeletonGiant: 99,
  bombMage: 101,
  thunderMonk: 103,
  shrouder: 104,
  magicPortal: 105,
  karateGuy: 116,
  kongFuChicken: 117,
  dojo: 118,
  hydra1: 121,
  hydra3: 123,
  dragon: 125,
  lizard: 126,
  vultureGuard: 127,
  blackOrc: 128,
  quadranid: 129,
  cocoon: 130,
  darkCave: 131,
  darkGolem: 132,
  boulderCave: 133,
  boulderMonster: 134,
  fourArmGolem: 135,
  doubleDarkGolem: 136,
  batTree: 137,
  bat: 138,
  lizardSoldier: 142,
  plant: 147,
  scWarrior: 151,
  scArcher: 152,
  scMonk: 153,
  musicLastStand: 176,
  musicBaroqueRock: 178,
  musicBaroqueRockTechno: 179,
  musicElectronicMerlin: 180,
}

export const MERLIN_OPEN_TILESETS: Record<LayerName, string> = {
  backgroundPassive: 'merlinOpenPassive',
  backgroundActive: 'merlinOpenActive',
  objects: 'merlinOpenObjects',
}

// merlinOpenActive tiles (10 per row). Solid: bricks, bars, rocks, trees, pots, skull, shrine.
const BRICK_WALL = 12
const BRICK_WALL_B = 13
const BRICK_WALL_LOW = 22
const BRICK_WALL_LOW_B = 23
const IRON_BARS = 18
const IRON_BARS_B = 28
const STONE_SHRINE = 7
const STONE_BLOCK = 27
const GREY_BOULDER = 32
const ROCK_SPIRE = 33
const GREY_CRAG = 34
const DEAD_TREE = 36
const DEAD_SAPLING = 37
const DARK_ROCK = 39
const EYED_TREE = 52
const EYED_TREE_B = 53
const BARE_TREE = 54
const BEIGE_POT = 59
const EYED_SHRUB = 62
const EYED_SHRUB_B = 63
const THORN_TREE = 64
const CACTUS = 69
const WHITE_POT = 75
const CRACKED_POT = 76
const VINE_POT = 78
const SKULL = 80
const ROCK_HEAP = 90
const STONE_BOULDER = 111
const STONE_BOULDER_B = 112
const STONE_BOULDER_C = 113
// walkable (#none)
const GOLD_COINS = 60
const LITTLE_PLANT = 70
const GREY_PEBBLES = 79
const GREY_FLOWER = 83
const PUDDLE = 120
const DARK_PEBBLES = 140
// merlinOpenPassive tiles (10 per row)
const MUD = 2
const MUD_STONES = 9
const DARK_GRASS = 22
const MARSH_WATER = 23
const BLUE_COBBLES = 35

export const UNDEAD_MARSH: FloorTheme = {
  id: 'undead-marsh',
  name: 'Undead Marsh',
  floorSize: DEFAULT_FLOOR_SIZE,
  tileSets: MERLIN_OPEN_TILESETS,
  objectTiles: MERLIN_OPEN_OBJECTS,
  ground: [w(DARK_GRASS, 16), w(MARSH_WATER, 3)],
  wall: [w(BARE_TREE, 4), w(THORN_TREE, 4), w(DEAD_TREE, 2), w(EYED_TREE, 0.5), w(EYED_SHRUB, 0.5)],
  longWall: [w(BARE_TREE, 4), w(THORN_TREE, 4), w(DEAD_TREE, 2), w(DEAD_SAPLING, 1), w(EYED_TREE_B, 0.5), w(EYED_SHRUB_B, 0.5)],
  materials: [
    { name: 'dead wood', weight: 5, tiles: [w(BARE_TREE, 2), w(THORN_TREE, 2), w(DEAD_TREE, 2), w(DEAD_SAPLING, 1)] },
    { name: 'rocks', weight: 2, tiles: [w(GREY_BOULDER, 2), w(DARK_ROCK, 2), w(GREY_CRAG, 1)] },
  ],
  stumps: [w(SKULL, 2), w(DEAD_SAPLING, 1)],
  decorations: [w(PUDDLE, 3), w(GREY_FLOWER, 2), w(GREY_PEBBLES, 1), w(DARK_PEBBLES, 1), w(LITTLE_PLANT, 1)],
  shape: {
    patches: [1, 3],
    patchSize: [2, 6],
    smoothSteps: 1,
    birth: 5,
    cuts: { chance: 0.75, extraChance: 0.35, turnChance: 0.6, gapChance: 0.65, gapWidth: [2, 3], wobbleChance: 0.2 },
    longWallChance: 0,
    longWallSide: [6, 9],
    longWallEnd: [3, 5],
    stumpChance: 0.015,
    decorationChance: 0.05,
    minOpenShare: 0.5,
  },
  edges: { extraOpenChance: 0.6, sideOpening: [3, 4], endOpening: [3, 6], openingDepth: 2 },
  units: {
    player: 'player',
    startMusic: 'musicBaroqueRock',
    exitMusic: 'musicLastStand',
    difficulty: [1, 5],
    quantity: {
      swarmWeight: 1.2,
      producerWeight: 1,
      swarm: { base: 2, farX: 3 },
      producers: { base: 1, farX: 1.5 },
      escorts: [0, 2],
    },
    enemies: [
      { key: 'skeletonWarrior', weight: 6, faction: 'undead' },
      { key: 'skeletonThrower', weight: 2, minDifficulty: 1.5, faction: 'undead' },
      { key: 'skeletonArcher', weight: 2, minDifficulty: 2, faction: 'undead' },
      { key: 'greyGhost', weight: 1, minDifficulty: 3, maxPerRoom: 1, faction: 'undead', producer: true },
      { key: 'necromancer', weight: 0.6, minDifficulty: 3.5, maxPerRoom: 1, faction: 'undead', producer: true },
      { key: 'skeletonComando', weight: 1, minDifficulty: 3.5, maxPerRoom: 1, faction: 'undead' },
      { key: 'skeletonGiant', weight: 0.8, minDifficulty: 4, maxPerRoom: 1, faction: 'undead' },
      // the owner's "gun critter": monsters, which brawl with the undead, so they hold rooms of their own
      { key: 'quadranid', weight: 4, faction: 'critters' },
      { key: 'bat', weight: 1.5, maxPerRoom: 2 },
    ],
    dwellings: [
      { key: 'skeletonDwelling', weight: 3, faction: 'undead' },
      { key: 'cocoon', weight: 2, maxPerRoom: 1, faction: 'critters' },
      { key: 'batTree', weight: 1, minDifficulty: 2, maxPerRoom: 1 },
    ],
    specialRooms: [
      { corner: 'farY', groups: [{ label: 'necromancer guard', units: { necromancer: 2, skeletonWarrior: 2 }, faction: 'undead' }] },
      { corner: 'farX', groups: [{ label: 'critter nest', units: { cocoon: 1, quadranid: 3 }, faction: 'critters' }] },
    ],
    bosses: [
      { label: 'skeleton army', units: { skelitonLord: 1, skeletonWarrior: 3 }, faction: 'undead', boss: 'skelitonLord' },
      { label: 'necromancy club', units: { necromancer: 3, skeletonDwelling: 1 }, faction: 'undead', boss: 'necromancer' },
    ],
  },
}

export const DRAGON_CANYON: FloorTheme = {
  id: 'dragon-canyon',
  name: 'Dragon Canyon',
  floorSize: DEFAULT_FLOOR_SIZE,
  tileSets: MERLIN_OPEN_TILESETS,
  objectTiles: MERLIN_OPEN_OBJECTS,
  ground: [w(MUD, 30), w(MUD_STONES, 1)],
  wall: [w(STONE_BOULDER, 3), w(STONE_BOULDER_B, 3), w(STONE_BOULDER_C, 2), w(GREY_CRAG, 1)],
  longWall: [w(STONE_BOULDER, 3), w(STONE_BOULDER_B, 3), w(STONE_BOULDER_C, 3), w(GREY_BOULDER, 1), w(GREY_CRAG, 1)],
  materials: [
    { name: 'rocks', weight: 5, tiles: [w(GREY_BOULDER, 2), w(GREY_CRAG, 2), w(ROCK_SPIRE, 1), w(ROCK_HEAP, 1)] },
    { name: 'dark rocks', weight: 2, tiles: [w(DARK_ROCK)] },
    { name: 'cacti', weight: 1, tiles: [w(CACTUS)] },
  ],
  stumps: [w(ROCK_SPIRE, 2), w(CACTUS, 1)],
  decorations: [w(GREY_PEBBLES, 2), w(DARK_PEBBLES, 2), w(LITTLE_PLANT, 1)],
  shape: {
    patches: [1, 3],
    patchSize: [2, 5],
    smoothSteps: 1,
    birth: 5,
    baffles: { chance: 0.7, count: [2, 3], reach: [0.55, 0.75], verticalChance: 0.6, thickness: [1, 2] },
    longWallChance: 0,
    longWallSide: [6, 9],
    longWallEnd: [3, 5],
    stumpChance: 0.012,
    decorationChance: 0.04,
    minOpenShare: 0.5,
  },
  edges: { extraOpenChance: 0.7, sideOpening: [3, 5], endOpening: [4, 7], openingDepth: 2 },
  units: {
    player: 'player',
    startMusic: 'musicBaroqueRockTechno',
    exitMusic: 'musicLastStand',
    difficulty: [3, 6],
    quantity: {
      swarmWeight: 2,
      producerWeight: 1,
      swarm: { base: 2, farX: 2.5 },
      producers: { base: 1, farX: 1.5 },
      escorts: [1, 2],
    },
    // martial artists everywhere, golems more along y, dragons more along x (the sketch)
    enemies: [
      { key: 'karateGuy', weight: 4 },
      { key: 'kongFuChicken', weight: 2 },
      { key: 'lizard', weight: 2 },
      { key: 'plant', weight: 1.2, maxPerRoom: 2 },
      { key: 'boulderMonster', weight: 0.5, weightFarY: 3, maxPerRoom: 2 },
      { key: 'lizardSoldier', weight: 1, minDifficulty: 4 },
      { key: 'hydra1', weight: 0.8, minDifficulty: 4.5, maxPerRoom: 1 },
      { key: 'dragon', weight: 0.3, weightFarX: 2.5, minDifficulty: 4, maxPerRoom: 2 },
      { key: 'darkGolem', weight: 0, weightFarY: 1.2, minDifficulty: 5, maxPerRoom: 1 },
    ],
    dwellings: [
      { key: 'dojo', weight: 3, maxPerRoom: 1 },
      { key: 'boulderCave', weight: 0.5, weightFarY: 2.5, minDifficulty: 4, maxPerRoom: 1 },
      { key: 'darkCave', weight: 0, weightFarY: 1, minDifficulty: 5.5, maxPerRoom: 1 },
    ],
    specialRooms: [
      { corner: 'farY', groups: [{ label: 'golem quarry', units: { boulderCave: 1, boulderMonster: 1 } }] },
      { corner: 'farX', groups: [{ label: 'dragon roost', units: { dragon: 2 } }] },
    ],
    bosses: [
      { label: 'dark golems', units: { fourArmGolem: 1, doubleDarkGolem: 1 }, boss: 'fourArmGolem' },
      { label: "dragon's lair", units: { dragon: 3, lizardSoldier: 2 }, boss: 'dragon' },
      { label: 'hydra den', units: { hydra3: 1, plant: 2 }, boss: 'hydra3' },
    ],
  },
}

export const MAGIC_MAZE: FloorTheme = {
  id: 'magic-maze',
  name: 'Magic Maze',
  floorSize: DEFAULT_FLOOR_SIZE,
  tileSets: MERLIN_OPEN_TILESETS,
  objectTiles: MERLIN_OPEN_OBJECTS,
  ground: [w(BLUE_COBBLES)],
  wall: [w(BRICK_WALL, 3), w(BRICK_WALL_B, 3), w(BRICK_WALL_LOW, 1), w(BRICK_WALL_LOW_B, 1)],
  longWall: [w(BRICK_WALL, 4), w(BRICK_WALL_B, 4), w(IRON_BARS, 0.5), w(IRON_BARS_B, 0.5)],
  materials: [
    { name: 'pots', weight: 2, tiles: [w(WHITE_POT, 2), w(CRACKED_POT, 1), w(VINE_POT, 1), w(BEIGE_POT, 1)] },
    { name: 'stone', weight: 1, tiles: [w(STONE_BLOCK, 2), w(STONE_SHRINE, 1)] },
  ],
  stumps: [w(BEIGE_POT, 2), w(WHITE_POT, 1), w(STONE_SHRINE, 1)],
  decorations: [w(GOLD_COINS, 1), w(GREY_PEBBLES, 2)],
  shape: {
    patches: [0, 1],
    patchSize: [1, 3],
    smoothSteps: 0,
    birth: 5,
    division: { minChamber: 2, doorWidth: [2, 2], stopChance: 0.08 },
    longWallChance: 0,
    longWallSide: [6, 9],
    longWallEnd: [3, 5],
    stumpChance: 0.01,
    decorationChance: 0.02,
    minOpenShare: 0.4,
  },
  edges: { extraOpenChance: 0.55, sideOpening: [3, 3], endOpening: [3, 4], openingDepth: 2 },
  units: {
    player: 'player',
    startMusic: 'musicElectronicMerlin',
    exitMusic: 'musicLastStand',
    difficulty: [5, 7],
    quantity: {
      swarmWeight: 1,
      producerWeight: 1,
      swarm: { base: 2, farX: 2 },
      producers: { base: 1, farX: 1.2 },
      escorts: [0, 2],
    },
    // MR3's wizards are not ported: the magical alliance, the undead casters and Scarlet's army
    // (the chromatic sorcerers' troops) stand in, each faction in rooms of its own
    enemies: [
      { key: 'bombMage', weight: 3, faction: 'alliance' },
      { key: 'thunderMonk', weight: 3, faction: 'alliance' },
      { key: 'shrouder', weight: 2, minDifficulty: 5.5, faction: 'alliance' },
      { key: 'necromancer', weight: 2, maxPerRoom: 2, faction: 'undead', producer: true },
      { key: 'darkMage', weight: 2, faction: 'undead' },
      { key: 'greyGhost', weight: 1, maxPerRoom: 1, faction: 'undead', producer: true },
      { key: 'scWarrior', weight: 2, faction: 'scarlet' },
      { key: 'scArcher', weight: 2, faction: 'scarlet' },
      { key: 'scMonk', weight: 1, minDifficulty: 6, maxPerRoom: 1, faction: 'scarlet', producer: true },
      // giant orcs and vultures are monsters, who brawl with all of the above
      { key: 'blackOrc', weight: 1.5, minDifficulty: 6, maxPerRoom: 2, faction: 'monsters' },
      { key: 'vultureGuard', weight: 1, minDifficulty: 5.5, maxPerRoom: 1, faction: 'monsters' },
    ],
    dwellings: [
      { key: 'magicPortal', weight: 2, maxPerRoom: 1, faction: 'alliance' },
      { key: 'skeletonDwelling', weight: 1, maxPerRoom: 1, faction: 'undead' },
    ],
    specialRooms: [
      { corner: 'farY', groups: [{ label: 'necromancy study', units: { necromancer: 2, darkMage: 1 }, faction: 'undead' }] },
      { corner: 'farX', groups: [{ label: 'portal ward', units: { magicPortal: 1, shrouder: 1, thunderMonk: 1 }, faction: 'alliance' }] },
    ],
    // the Black Sorcerer is not in the engine's data: his stand-ins hold the exit
    bosses: [
      { label: "dark sorcerer's court", units: { darkMage: 3, necromancer: 1, greyGhost: 1 }, faction: 'undead', boss: 'darkMage' },
      { label: "Scarlet's guard", units: { scMonk: 2, scWarrior: 2, scArcher: 1 }, faction: 'scarlet', boss: 'scMonk' },
    ],
  },
}

export const THEMES: readonly FloorTheme[] = [GOBLIN_FOREST, UNDEAD_MARSH, DRAGON_CANYON, MAGIC_MAZE]
