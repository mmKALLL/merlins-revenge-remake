// Floor themes for the random floor generator (docs/plans/2026-09-28-random-floor-design.md),
// after the four floors of docs/design/the-sorcerers-tower.md. A theme is data only: floor size,
// tiles per role, room shape tuning (including which interior wall styles it uses), enemy
// tables with tiers, and the room plan (what each room of the floor holds). Tile numbers are 1-based indices into the theme's tilesets; floor.test.ts checks them
// against the tile keys.
import type { Vec } from '../mr-open/mr-geometry'
import type { LayerName } from '../mr-open/mr-map-format'
import { GOLDEN_MACHINE_GUN } from '../mr-open/mr-pickup'

export interface Weighted<T> {
  value: T
  weight: number
}

/** A kind of obstacle patch; each patch picks one material, each tile a variant. */
export interface Material {
  name: string
  weight: number
  tiles: Weighted<number>[]
}

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

/** How hard a choice is within its theme: the room plan asks for tiers, not for units. */
export type Tier = 'weak' | 'mid' | 'strong'
export const TIERS: readonly Tier[] = ['weak', 'mid', 'strong']

export interface EnemyChoice {
  key: string
  weight: number
  tier: Tier
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

/** A fixed group of units; `faction` sets the room's faction for its other enemies, `alone` leaves the room to the group. */
export interface UnitGroup {
  label: string
  units: Record<string, number>
  faction?: string
  alone?: boolean
}

/** An exit room group; its `boss` unit stands two tiles in from the floor's far corner. */
export interface BossGroup extends UnitGroup {
  boss: string
}

/** Units of one kind for a room: a count drawn uniformly from `[lo, hi]`, each unit's tier by weight. */
export interface TierDraw {
  count: readonly [number, number]
  tiers: Partial<Record<Tier, number>>
}

/** One draw, or alternatives of which the room takes one by weight. */
export type DrawSpec = TierDraw | Weighted<TierDraw>[]

/**
 * One room of the plan. `start` is the start room (no enemies), `boss` the exit room (one of the
 * theme's bosses), `midboss` a side corner led by a powerful group. Any cell but the start can
 * hold fixed `groups` (one picked at random, on top of the counts unless it is `alone`) and draws
 * `producers` (dwellings and summoners) and `regulars` (the other enemies) by tier.
 */
export interface RoomPlanCell {
  kind: 'start' | 'boss' | 'midboss' | 'normal'
  groups?: UnitGroup[]
  producers?: DrawSpec
  regulars?: DrawSpec
}

/** The floor's rooms as on screen: the first row is the far row (engine y 1), the start bottom-left, the exit top-right. */
export type RoomPlan = readonly (readonly RoomPlanCell[])[]

export interface UnitTuning {
  player: string
  startMusic: string
  exitMusic: string
  /** what each room holds */
  roomPlan: RoomPlan
  /**
   * Chance per normal room of drawing another normal cell's producers and regulars instead of its
   * own (it keeps its own groups), for variance; never the start, midboss or boss room.
   */
  wildcardChance: number
  /** regular enemies and summoners (`producer`) */
  enemies: EnemyChoice[]
  dwellings: EnemyChoice[]
  /** the exit room picks one */
  bosses: BossGroup[]
  /** potions for the two side corner rooms, drawn by weight (floor.ts potionTiles); no kits (owner rule) */
  potions: Weighted<string>[]
  startRewards: StartRewards
}

/**
 * The floor-start rewards (owner request): pickups in the start room near where Merlin starts, or
 * on the tower's later floors where he comes up the stair (floor.ts startRewardKeys, rewardTiles).
 */
export interface StartRewards {
  /** potions drawn by weight, `potionCount` of them */
  potions: Weighted<string>[]
  potionCount: number
  medikits: number
  /** One spell scroll per floor, drawn by weight; the tower draws one per floor without repeats. */
  spellScrolls: Weighted<string>[]
  /** further pickups, one each */
  extras: string[]
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

// ---- room plans ----

/** Owner: about one normal room in ten ignores its cell (UnitTuning.wildcardChance). */
const WILDCARD_CHANCE = 0.1

/** Tier weights for a draw; a tier the room's faction lacks is skipped, so mixes fall back. */
type TierWeights = Partial<Record<Tier, number>>
const WEAK: TierWeights = { weak: 1 }
const WEAK_MID: TierWeights = { weak: 2, mid: 1 }
const STRONG_MID: TierWeights = { strong: 2, mid: 1 }
const MOSTLY_STRONG: TierWeights = { strong: 3, mid: 1 }

/** lo..hi units of these tiers. */
const n = (lo: number, hi: number, tiers: TierWeights): TierDraw => ({ count: [lo, hi], tiers })
/** One of these draws, by weight. */
const either = (...options: [TierDraw, number][]): Weighted<TierDraw>[] => options.map(([draw, weight]) => w(draw, weight))
/** The owner's centre room: a few weak producers, or a single strong one. */
const FEW_WEAK_OR_ONE_STRONG = either([n(2, 3, WEAK), 2], [n(1, 1, MOSTLY_STRONG), 1])

type CellFill = Omit<RoomPlanCell, 'kind'>
const START: RoomPlanCell = { kind: 'start' }
const normal = (fill: CellFill): RoomPlanCell => ({ kind: 'normal', ...fill })
const midboss = (groups: UnitGroup[], fill: CellFill = {}): RoomPlanCell => ({ kind: 'midboss', groups, ...fill })
const boss = (fill: CellFill): RoomPlanCell => ({ kind: 'boss', ...fill })

/**
 * The plan reflected across the start-exit diagonal: the top-left half swaps with the bottom-right
 * half, so the farY corner's room goes to farX and the other way round.
 */
export function flippedPlan(plan: RoomPlan): RoomPlan {
  const last = plan.length - 1
  if (plan.some((row) => row.length !== plan.length)) throw new Error('only a square room plan can be flipped')
  return plan.map((row, r) => row.map((_, c) => plan[last - c]![last - r]!))
}

// ---- floor-start rewards ----

/** Owner rule: every floor starts with three potions and a medikit (four before Merlin kept his tuned starting charge). */
const START_POTIONS = 3
const START_MEDIKITS = 1
/** The four potions, Quick Charge and Max Blast first; the start rooms and most corner rooms draw from it. */
const POTION_WEIGHTS = [w('manaFlow', 3), w('manaCapacity', 3), w('manaBurst', 2), w('walkSpeed', 1)]

const startRewards = (spellScrolls: Weighted<string>[], extras: string[] = []): StartRewards => ({
  potions: POTION_WEIGHTS,
  potionCount: START_POTIONS,
  medikits: START_MEDIKITS,
  spellScrolls,
  extras,
})

/**
 * Spell scrolls (act_<key>, objType #objScroll) by their objects tileset key symbols
 * (docs/notes/engine-mechanics-spells.md). energyBlast is left out: Merlin starts with it.
 */
export const SPELL_SCROLLS = [
  'armySummon',
  'energyMines',
  'energyPulseSpell',
  'cBlast',
  'energyPunch',
  'monsterSummon',
  'healBlast',
  'arcticBlast',
  'energyBeamSpell',
  'merlinSword',
] as const

/** The golden machine gun pickup (act_gmg, an objScroll); merlinOpenObjects has its tile, merlin4Objects has none. */
export { GOLDEN_MACHINE_GUN }
/**
 * Owner note: the Magic Maze also gives the golden machine gun once act_gmg is ported. Off until
 * then; on, the maze's start rewards include it.
 */
export const MAZE_GIVES_GOLDEN_MACHINE_GUN = false

/** Reward keys the sim does not spawn yet: the golden machine gun. */
export const PENDING_SCROLLS: ReadonlySet<string> = new Set<string>([GOLDEN_MACHINE_GUN])

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
  manaCapacity: 13,
  manaBurst: 14,
  manaFlow: 15,
  walkSpeed: 16,
  medikit: 17,
  armySummon: 10,
  energyMines: 11,
  energyPulseSpell: 12,
  cBlast: 32,
  merlinSword: 40,
  healBlast: 101,
  energyPunch: 103,
  monsterSummon: 104,
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

/**
 * The owner's plan: generators toward the top-left (farY), regular enemies toward the bottom-right
 * (farX), where there are no generators; the centre balances the two with stronger enemies.
 */
const GOBLIN_FOREST_PLAN: RoomPlan = [
  [
    midboss([
      { label: 'orc hole', units: { orcHouse: 1, bowOrc: 1 } },
      { label: 'orc shamans', units: { mageOrc: 2 } },
    ], { regulars: n(0, 2, WEAK) }),
    normal({ producers: n(4, 6, WEAK), regulars: n(0, 2, WEAK) }),
    boss({ producers: n(0, 1, WEAK_MID), regulars: n(2, 3, WEAK_MID) }),
  ],
  [
    normal({ producers: n(2, 3, WEAK), regulars: n(0, 2, WEAK) }),
    normal({ producers: FEW_WEAK_OR_ONE_STRONG, regulars: n(1, 3, MOSTLY_STRONG) }),
    normal({ regulars: n(4, 5, STRONG_MID) }),
  ],
  [
    START,
    normal({ regulars: n(2, 3, WEAK) }),
    normal({
      groups: [
        { label: 'goblin warrior band', units: { goblinWarrior: 4 } },
        { label: 'archers and bats', units: { goblinArcher: 3, bat: 2 } },
      ],
      regulars: n(1, 3, WEAK),
    }),
  ],
]

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
    roomPlan: GOBLIN_FOREST_PLAN,
    wildcardChance: WILDCARD_CHANCE,
    enemies: [
      { key: 'goblinArcher', weight: 6, tier: 'weak' },
      { key: 'goblinWarrior', weight: 1.5, tier: 'weak' },
      { key: 'bat', weight: 1, tier: 'weak', maxPerRoom: 2 },
      { key: 'goblinMage', weight: 1, tier: 'mid', maxPerRoom: 2 },
      { key: 'swordOrc', weight: 1, tier: 'strong', maxPerRoom: 2 },
      { key: 'bowOrc', weight: 0.7, tier: 'strong', maxPerRoom: 2 },
      { key: 'mageOrc', weight: 1, tier: 'strong', maxPerRoom: 1, producer: true },
    ],
    dwellings: [
      { key: 'goblinHut', weight: 1, tier: 'weak' },
      { key: 'goblinMageHut', weight: 1, tier: 'mid', maxPerRoom: 1 },
      { key: 'batTree', weight: 0.6, tier: 'mid', maxPerRoom: 1 },
      { key: 'orcHouse', weight: 1, tier: 'strong', maxPerRoom: 1 },
    ],
    bosses: [
      { label: 'orc camp', units: { orcHouse: 1, swordOrc: 1 }, boss: 'swordOrc' },
      { label: 'hydra trainer', units: { hydra1: 1, goblinHero: 1, goblinWarrior: 1 }, boss: 'hydra1' },
    ],
    potions: POTION_WEIGHTS,
    startRewards: startRewards([w('armySummon', 3), w('energyMines', 2), w('energyPulseSpell', 2), w('merlinSword', 2), w('healBlast', 1)]),
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
  manaCapacity: 41,
  manaBurst: 42,
  manaFlow: 43,
  walkSpeed: 44,
  medikit: 45,
  maxikit: 46,
  armySummon: 22,
  energyMines: 23,
  energyPulseSpell: 24,
  cBlast: 25,
  energyPunch: 26,
  monsterSummon: 27,
  healBlast: 28,
  arcticBlast: 29,
  energyBeamSpell: 30,
  gmg: 38,
  merlinSword: 39,
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
const BLUE_COBBLES = 35

/**
 * The forest's plan flipped: written in the forest's orientation, so after the flip the generators
 * and the midboss sit toward the bottom-right (farX) and the regular-enemy rooms toward the top-left.
 * Owner: necromancers are midboss/boss tier here, so they only come in fixed groups.
 */
const UNDEAD_MARSH_PLAN: RoomPlan = flippedPlan([
  [
    midboss([
      { label: 'lone necromancer', units: { necromancer: 1 }, faction: 'undead', alone: true },
      { label: 'haunted crypt', units: { skeletonDwelling: 1, greyGhost: 2 }, faction: 'undead' },
    ], { regulars: n(0, 2, WEAK) }),
    normal({ producers: n(4, 6, WEAK), regulars: n(0, 2, WEAK) }),
    boss({ producers: n(0, 1, WEAK_MID), regulars: n(2, 3, WEAK_MID) }),
  ],
  [
    normal({ producers: n(2, 3, WEAK), regulars: n(0, 2, WEAK) }),
    normal({ producers: FEW_WEAK_OR_ONE_STRONG, regulars: n(1, 3, MOSTLY_STRONG) }),
    normal({ regulars: n(4, 5, STRONG_MID) }),
  ],
  [
    START,
    normal({ regulars: n(2, 3, WEAK) }),
    normal({
      groups: [
        { label: 'critter nest', units: { cocoon: 1, quadranid: 3 }, faction: 'critters' },
        { label: 'skeleton patrol', units: { skeletonWarrior: 3, skeletonThrower: 1 }, faction: 'undead' },
      ],
      regulars: n(1, 3, WEAK),
    }),
  ],
])

export const UNDEAD_MARSH: FloorTheme = {
  id: 'undead-marsh',
  name: 'Undead Marsh',
  floorSize: DEFAULT_FLOOR_SIZE,
  tileSets: MERLIN_OPEN_TILESETS,
  objectTiles: MERLIN_OPEN_OBJECTS,
  ground: [w(MUD)],
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
    roomPlan: UNDEAD_MARSH_PLAN,
    wildcardChance: WILDCARD_CHANCE,
    enemies: [
      { key: 'skeletonWarrior', weight: 6, tier: 'weak', faction: 'undead' },
      { key: 'skeletonThrower', weight: 2, tier: 'weak', faction: 'undead' },
      { key: 'skeletonArcher', weight: 2, tier: 'mid', faction: 'undead' },
      { key: 'greyGhost', weight: 1, tier: 'mid', maxPerRoom: 1, faction: 'undead', producer: true },
      { key: 'skeletonComando', weight: 1, tier: 'mid', maxPerRoom: 2, faction: 'undead' },
      { key: 'skeletonGiant', weight: 1, tier: 'strong', maxPerRoom: 2, faction: 'undead' },
      // the owner's "gun critter": monsters, which brawl with the undead, so they hold rooms of their own
      { key: 'quadranid', weight: 4, tier: 'weak', faction: 'critters' },
      { key: 'bat', weight: 1.5, tier: 'weak', maxPerRoom: 2 },
    ],
    dwellings: [
      { key: 'skeletonDwelling', weight: 3, tier: 'weak', faction: 'undead' },
      { key: 'cocoon', weight: 2, tier: 'weak', maxPerRoom: 2, faction: 'critters' },
      { key: 'batTree', weight: 1, tier: 'mid', maxPerRoom: 1 },
    ],
    bosses: [
      { label: 'skeleton army', units: { skelitonLord: 1, skeletonWarrior: 3 }, faction: 'undead', boss: 'skelitonLord' },
      { label: 'necromancer pair', units: { necromancer: 2 }, faction: 'undead', boss: 'necromancer', alone: true },
      { label: 'necromancer and giant', units: { necromancer: 1, skeletonGiant: 1 }, faction: 'undead', boss: 'necromancer', alone: true },
    ],
    potions: POTION_WEIGHTS,
    startRewards: startRewards([w('energyPulseSpell', 2), w('energyMines', 2), w('arcticBlast', 2), w('cBlast', 2), w('armySummon', 1), w('healBlast', 1), w('monsterSummon', 1)]),
  },
}

/**
 * The forest's orientation: the sketch's golem quarry (a boulder cave, a producer) already led the
 * farY corner, so it stays the generator midboss there.
 */
const DRAGON_CANYON_PLAN: RoomPlan = [
  [
    midboss([
      { label: 'golem quarry', units: { boulderCave: 1, boulderMonster: 1 } },
      { label: 'dark cave', units: { darkCave: 1, darkGolem: 1 } },
    ], { regulars: n(0, 2, WEAK) }),
    normal({ producers: n(4, 6, WEAK), regulars: n(0, 2, WEAK) }),
    boss({ producers: n(0, 1, WEAK_MID), regulars: n(2, 3, WEAK_MID) }),
  ],
  [
    normal({ producers: n(2, 3, WEAK), regulars: n(0, 2, WEAK) }),
    normal({ producers: FEW_WEAK_OR_ONE_STRONG, regulars: n(1, 3, MOSTLY_STRONG) }),
    normal({ regulars: n(4, 5, STRONG_MID) }),
  ],
  [
    START,
    normal({ regulars: n(2, 3, WEAK) }),
    normal({
      groups: [
        { label: 'dojo class', units: { karateGuy: 3, kongFuChicken: 2 } },
        { label: 'lizard pack', units: { lizard: 4 } },
      ],
      regulars: n(1, 3, WEAK),
    }),
  ],
]

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
    roomPlan: DRAGON_CANYON_PLAN,
    wildcardChance: WILDCARD_CHANCE,
    // martial artists as the weak ones; dragons, hydras and dark golems as the strong ones
    enemies: [
      { key: 'karateGuy', weight: 4, tier: 'weak' },
      { key: 'kongFuChicken', weight: 2, tier: 'weak' },
      { key: 'lizard', weight: 2, tier: 'weak' },
      { key: 'plant', weight: 1.2, tier: 'mid', maxPerRoom: 2 },
      { key: 'boulderMonster', weight: 1.5, tier: 'mid', maxPerRoom: 2 },
      { key: 'lizardSoldier', weight: 1, tier: 'mid' },
      { key: 'hydra1', weight: 0.8, tier: 'strong', maxPerRoom: 1 },
      { key: 'dragon', weight: 1.5, tier: 'strong', maxPerRoom: 2 },
      { key: 'darkGolem', weight: 0.8, tier: 'strong', maxPerRoom: 1 },
    ],
    dwellings: [
      { key: 'dojo', weight: 3, tier: 'weak' },
      { key: 'boulderCave', weight: 1, tier: 'mid', maxPerRoom: 1 },
      { key: 'darkCave', weight: 1, tier: 'strong', maxPerRoom: 1 },
    ],
    bosses: [
      { label: 'dark golems', units: { fourArmGolem: 1, doubleDarkGolem: 1 }, boss: 'fourArmGolem' },
      { label: "dragon's lair", units: { dragon: 3, lizardSoldier: 2 }, boss: 'dragon' },
      { label: 'hydra den', units: { hydra3: 1, hydra1: 2, plant: 2 }, boss: 'hydra3' },
    ],
    potions: POTION_WEIGHTS,
    startRewards: startRewards([w('arcticBlast', 2), w('energyBeamSpell', 2), w('cBlast', 2), w('energyPunch', 2), w('armySummon', 1), w('monsterSummon', 1)]),
  },
}

/** The forest's plan flipped, as the marsh's: generators and the midboss toward the bottom-right (farX). */
const MAGIC_MAZE_PLAN: RoomPlan = flippedPlan([
  [
    midboss([
      { label: 'necromancy study', units: { necromancer: 2, darkMage: 1 }, faction: 'undead' },
      { label: 'Scarlet chapel', units: { scMonk: 2, scWarrior: 1 }, faction: 'scarlet' },
    ], { regulars: n(0, 2, WEAK) }),
    normal({ producers: n(4, 6, WEAK), regulars: n(0, 2, WEAK) }),
    boss({ producers: n(0, 1, WEAK_MID), regulars: n(2, 3, WEAK_MID) }),
  ],
  [
    normal({ producers: n(2, 3, WEAK), regulars: n(0, 2, WEAK) }),
    normal({ producers: FEW_WEAK_OR_ONE_STRONG, regulars: n(1, 3, MOSTLY_STRONG) }),
    normal({ regulars: n(4, 5, STRONG_MID) }),
  ],
  [
    START,
    normal({ regulars: n(2, 3, WEAK) }),
    normal({
      groups: [
        { label: 'alliance squad', units: { bombMage: 2, thunderMonk: 2 }, faction: 'alliance' },
        { label: 'Scarlet patrol', units: { scWarrior: 2, scArcher: 2 }, faction: 'scarlet' },
      ],
      regulars: n(1, 3, WEAK),
    }),
  ],
])

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
    roomPlan: MAGIC_MAZE_PLAN,
    wildcardChance: WILDCARD_CHANCE,
    // MR3's wizards are not ported: the magical alliance, the undead casters and Scarlet's army
    // (the chromatic sorcerers' troops) stand in, each faction in rooms of its own
    enemies: [
      { key: 'bombMage', weight: 3, tier: 'weak', faction: 'alliance' },
      { key: 'thunderMonk', weight: 3, tier: 'weak', faction: 'alliance' },
      { key: 'shrouder', weight: 2, tier: 'mid', faction: 'alliance' },
      { key: 'necromancer', weight: 2, tier: 'strong', maxPerRoom: 2, faction: 'undead', producer: true },
      { key: 'darkMage', weight: 2, tier: 'mid', faction: 'undead' },
      { key: 'greyGhost', weight: 1, tier: 'weak', maxPerRoom: 1, faction: 'undead', producer: true },
      { key: 'scWarrior', weight: 2, tier: 'weak', faction: 'scarlet' },
      { key: 'scArcher', weight: 2, tier: 'weak', faction: 'scarlet' },
      { key: 'scMonk', weight: 1, tier: 'mid', maxPerRoom: 1, faction: 'scarlet', producer: true },
      // giant orcs and vultures are monsters, who brawl with all of the above
      { key: 'blackOrc', weight: 1.5, tier: 'strong', maxPerRoom: 2, faction: 'monsters' },
      { key: 'vultureGuard', weight: 1, tier: 'strong', maxPerRoom: 2, faction: 'monsters' },
    ],
    dwellings: [
      { key: 'magicPortal', weight: 2, tier: 'weak', faction: 'alliance' },
      { key: 'skeletonDwelling', weight: 1, tier: 'weak', faction: 'undead' },
    ],
    // the Black Sorcerer is not in the engine's data: his stand-ins hold the exit
    bosses: [
      { label: "dark sorcerer's court", units: { darkMage: 3, necromancer: 1, greyGhost: 1 }, faction: 'undead', boss: 'darkMage' },
      { label: "Scarlet's guard", units: { scMonk: 2, scWarrior: 2, scArcher: 1 }, faction: 'scarlet', boss: 'scMonk' },
    ],
    potions: [w('manaCapacity', 3), w('manaBurst', 3), w('manaFlow', 2), w('walkSpeed', 1)],
    startRewards: startRewards(
      [w('energyBeamSpell', 3), w('cBlast', 2), w('energyPunch', 2), w('monsterSummon', 2), w('arcticBlast', 1)],
      MAZE_GIVES_GOLDEN_MACHINE_GUN ? [GOLDEN_MACHINE_GUN] : []
    ),
  },
}

export const THEMES: readonly FloorTheme[] = [GOBLIN_FOREST, UNDEAD_MARSH, DRAGON_CANYON, MAGIC_MAZE]
