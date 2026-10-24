// Floor themes for the random floor generator (docs/plans/2026-09-28-random-floor-design.md),
// after the four floors of docs/design/the-sorcerers-tower.md. A theme is data only: floor size,
// tiles per role, room shape tuning (including which interior wall styles it uses), enemy
// tables with tiers, and the room plan (what each room of the floor holds). Tile numbers are 1-based indices into the theme's tilesets; floor.test.ts checks them
// against the tile keys.
import type { Vec } from '../mr-open/mr-geometry'
import type { LayerName } from '../mr-open/mr-map-format'
import { GOLDEN_MACHINE_GUN, VOLLEY_SCROLLS } from '../mr-open/mr-pickup'
import { REMAKE_OBJECT_TILES } from './remake-object-tiles'

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

/** A wall cell's four neighbours, for wall autotiling (wall-autotile.ts). */
export type WallSide = 'up' | 'right' | 'down' | 'left'

/** Wall tiles for the wall cells whose neighbours match `when`: true = a wall there, false = none, unnamed = either. */
export interface WallTileRule {
  when: Partial<Record<WallSide, boolean>>
  tiles: Weighted<number>[]
}

/** A neighbour-to-tile table for walls: the first matching rule wins, so the last one should match anything. */
export type WallAutotile = readonly WallTileRule[]

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

/**
 * A fixed group of units; `faction` sets the room's faction for its other enemies, `allies` adds
 * further factions they may come from (teams that leave the group alone; with alliances the room
 * draws an alliance instead), `alone` leaves the room to the group. `lead` names its leader: a
 * floor's midboss and boss rooms take groups with different leaders when they can.
 */
export interface UnitGroup {
  label: string
  units: Record<string, number>
  faction?: string
  allies?: readonly string[]
  alone?: boolean
  lead?: string
}

/** An exit room group; its `boss` unit (its leader) stands two tiles in from the floor's far corner. */
export interface BossGroup extends UnitGroup {
  boss: string
}

/**
 * Total starting energy for a draw on a floor: `base + perLevel * level` (FloorTheme.level), plus
 * up to `spread` more drawn per room. With `producers` set, a producer (dwelling or summoner) counts
 * as `max(energy, least) * factor`, since what it releases outweighs its own energy. `capped` draws
 * only units that keep the room within the top of the range (`base + perLevel * level + spread`).
 */
export interface HpBudget {
  base: number
  perLevel: number
  spread?: number
  producers?: { factor: number; least: number }
  capped?: boolean
}

/**
 * Units of one kind for a room: a count drawn uniformly from `[lo, hi]`, each unit's tier by weight.
 * With an `hpBudget` the count is not drawn: units are drawn until the room's group and the drawn
 * units together reach the budget's energy, never fewer than `lo` nor more than `hi` units in all.
 */
export interface TierDraw {
  count: readonly [number, number]
  tiers: Partial<Record<Tier, number>>
  hpBudget?: HpBudget
}

/** One draw, or alternatives of which the room takes one by weight. */
export type DrawSpec = TierDraw | Weighted<TierDraw>[]

/**
 * One room of the plan. `start` is the start room (no enemies), `boss` the exit room (one of the
 * theme's bosses), `midboss` a side corner led by a powerful group. Any cell but the start can
 * hold fixed `groups` (one picked at random, on top of the counts unless it is `alone`) and draws
 * `producers` (dwellings and summoners), `regulars` (the other enemies) and `extras` (more regular
 * enemies, e.g. a few weak ones among strong ones) by tier.
 */
export interface RoomPlanCell {
  kind: 'start' | 'boss' | 'midboss' | 'normal'
  groups?: UnitGroup[]
  producers?: DrawSpec
  regulars?: DrawSpec
  extras?: DrawSpec
  /** units of any kind, producers and regular enemies alike */
  mixed?: DrawSpec
}

/** The floor's rooms as on screen: the first row is the far row (engine y 1), the start bottom-left, the exit top-right. */
export type RoomPlan = readonly (readonly RoomPlanCell[])[]

export interface UnitTuning {
  player: string
  startMusic: string
  /** what each room holds */
  roomPlan: RoomPlan
  /**
   * Chance per normal room of drawing another normal cell's producers and regulars instead of its
   * own (it keeps its own groups), for variance; never the start, midboss or boss room.
   */
  wildcardChance: number
  /** Chance per normal room of drawing from every faction at once (rival teams that brawl); its own roll. */
  mixedFactionChance: number
  /** regular enemies and summoners (`producer`) */
  enemies: EnemyChoice[]
  dwellings: EnemyChoice[]
  /** the exit room picks one */
  bosses: BossGroup[]
  /** potions for the two side corner rooms, drawn by weight (floor.ts potionTiles); no kits (owner rule) */
  potions: Weighted<string>[]
  startRewards: StartRewards
  /**
   * When set, a room draws one alliance (by weight) instead of one faction and takes choices of any
   * of its factions; an alliance holds teams that leave each other alone (assets/teams).
   */
  alliances?: Alliance[]
}

/** Factions that share a room peacefully. */
export interface Alliance {
  name: string
  factions: string[]
  weight: number
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
  /** 3-4 enemy keys that show who the player meets there (the roguelite pick screen's biome cards) */
  showcase: readonly string[]
  /** the floor's number, as in its map id and its place in the tower (1 = Goblin Forest); scales HP budgets */
  level: number
  /** rooms across and down */
  floorSize: Vec
  tileSets: Record<LayerName, string>
  /** object key symbol -> index in the objects tileset */
  objectTiles: Record<string, number>
  ground: Weighted<number>[]
  wall: Weighted<number>[]
  /** interior walls: long walls, cuts, baffles and maze walls */
  longWall: Weighted<number>[]
  /** when set, edge and interior walls take their tiles from it by their wall neighbours instead of `wall` and `longWall` */
  wallAutotile?: WallAutotile
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
/** Owner: about 15 % of normal rooms mix rival teams (UnitTuning.mixedFactionChance). */
const MIXED_FACTION_CHANCE = 0.15

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
/** Owner: many weak enemies are more fun than a few strong ones, so strong rooms get some weak ones too. */
const WEAK_SPRINKLE = n(2, 3, WEAK)
/**
 * The owner's "numerous weak" corner (farX in the forest's orientation): weak units, group included,
 * until about 800 + 400 * level energy in all. No unit limit (owner decision); the room's free tiles still cap it.
 */
const NUMEROUS_WEAK: TierDraw = { count: [0, Infinity], tiers: WEAK, hpBudget: { base: 800, perLevel: 400 } }

type CellFill = Omit<RoomPlanCell, 'kind'>
const START: RoomPlanCell = { kind: 'start' }
const normal = (fill: CellFill): RoomPlanCell => ({ kind: 'normal', ...fill })
const midboss = (groups: UnitGroup[], fill: CellFill = {}): RoomPlanCell => ({ kind: 'midboss', groups, ...fill })
const boss = (fill: CellFill): RoomPlanCell => ({ kind: 'boss', ...fill })

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
  ...VOLLEY_SCROLLS, // remake (owner request): the volley spells
] as const

/** Owner: any spell can come up on any floor at this weight; the floor's own spells weigh more. */
const ANY_SPELL_WEIGHT = 1
/** Added to a floor's own spell weights (its lists' 1 / 2 / 3 become 4 / 5 / 6). */
const THEMED_SPELL_BONUS = 3

/**
 * A floor's start scroll list: every spell its objects tileset has a tile for (merlin4Objects has
 * no arctic blast or energy beam), the floor's themed spells weighted up by THEMED_SPELL_BONUS (a
 * volley is themed where the floor's enemies fire its projectile). Owner: about half the scrolls are
 * original spells and half volleys, so the volleys' weights are scaled to the originals' total.
 */
function spellWeights(themed: Weighted<string>[], objectTiles: Record<string, number>): Weighted<string>[] {
  const weighted = SPELL_SCROLLS.filter((spell) => objectTiles[spell] !== undefined).map((spell) => {
    const own = themed.find((t) => t.value === spell)
    return w<string>(spell, own ? own.weight + THEMED_SPELL_BONUS : ANY_SPELL_WEIGHT)
  })
  const total = (volleys: boolean) => weighted.filter((s) => isVolley(s.value) === volleys).reduce((sum, s) => sum + s.weight, 0)
  const volleyScale = total(false) / total(true)
  return weighted.map((s) => (isVolley(s.value) ? w(s.value, s.weight * volleyScale) : s))
}

const isVolley = (spell: string): boolean => VOLLEY_SCROLLS.includes(spell)

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
  ...REMAKE_OBJECT_TILES['merlin4Objects'], // the volley spells' scrolls
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
    midboss(
      [
        { label: 'orc hole', units: { orcHouse: 1, bowOrc: 1 } },
        { label: 'orc shamans', units: { mageOrc: 2 } },
      ],
      { regulars: n(0, 2, WEAK) }
    ),
    normal({ producers: n(4, 6, WEAK), regulars: n(0, 2, WEAK) }),
    boss({ producers: n(0, 1, WEAK_MID), regulars: n(2, 3, WEAK_MID) }),
  ],
  [
    normal({ producers: n(2, 3, WEAK), regulars: n(0, 2, WEAK) }),
    normal({ producers: FEW_WEAK_OR_ONE_STRONG, regulars: n(1, 3, MOSTLY_STRONG), extras: n(1, 2, WEAK) }),
    normal({ regulars: n(4, 5, STRONG_MID), extras: WEAK_SPRINKLE }),
  ],
  [
    START,
    normal({ regulars: n(2, 3, WEAK) }),
    normal({
      groups: [
        { label: 'goblin warrior band', units: { goblinWarrior: 4 } },
        { label: 'archers and bats', units: { goblinArcher: 3, bat: 2 } },
      ],
      regulars: NUMEROUS_WEAK,
    }),
  ],
]

export const GOBLIN_FOREST: FloorTheme = {
  id: 'goblin-forest',
  name: 'Goblin Forest',
  showcase: ['goblinWarrior', 'goblinArcher', 'swordOrc', 'bat'],
  level: 1,
  floorSize: DEFAULT_FLOOR_SIZE,
  tileSets: MERLIN4_TILESETS,
  objectTiles: MERLIN4_OBJECTS,
  ground: [w(GRASS, 20), w(GRASS_FLOWERS, 1)],
  wall: [w(PINES, 5), w(LEAFY_TREE, 2), w(BUSHY_TREE, 2)],
  longWall: [w(PINES, 3), w(BUSHY_TREE, 1)],
  materials: [
    { name: 'forest', weight: 7, tiles: [w(PINES, 3), w(LEAFY_TREE, 2), w(OAK, 1), w(BUSHY_TREE, 2), w(SMALL_PINE, 1)] },
    { name: 'rocks', weight: 2.5, tiles: [w(GREY_ROCK, 3), w(ROCK_PILE, 2), w(BOULDER, 2), w(CRAGGY_ROCK, 1), w(ROUND_ROCK, 1)] },
  ],
  stumps: [w(STUMP)],
  decorations: [w(YELLOW_FLOWERS, 2), w(BUTTERCUP, 2), w(YELLOW_PETALS, 1), w(PEBBLES, 1), w(LITTLE_PEBBLES, 1)],
  shape: {
    patches: [3, 6],
    patchSize: [2, 7],
    smoothSteps: 1,
    birth: 5,
    longWallChance: 0.35,
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
    roomPlan: GOBLIN_FOREST_PLAN,
    wildcardChance: WILDCARD_CHANCE,
    mixedFactionChance: MIXED_FACTION_CHANCE,
    enemies: [
      { key: 'goblinArcher', weight: 6, tier: 'weak' },
      { key: 'goblinWarrior', weight: 1.5, tier: 'weak' },
      { key: 'bat', weight: 1, tier: 'weak' },
      { key: 'goblinMage', weight: 1, tier: 'mid' },
      { key: 'swordOrc', weight: 1, tier: 'strong', maxPerRoom: 2 },
      { key: 'bowOrc', weight: 0.7, tier: 'strong', maxPerRoom: 2 },
      { key: 'mageOrc', weight: 1, tier: 'strong', maxPerRoom: 1, producer: true },
    ],
    dwellings: [
      { key: 'goblinHut', weight: 1, tier: 'weak' },
      { key: 'goblinMageHut', weight: 1, tier: 'mid' },
      { key: 'batTree', weight: 0.6, tier: 'mid' },
      { key: 'orcHouse', weight: 1, tier: 'strong', maxPerRoom: 1 },
    ],
    bosses: [
      { label: 'orc camp', units: { orcHouse: 1, swordOrc: 1 }, boss: 'swordOrc' },
      { label: 'hydra trainer', units: { hydra1: 1, goblinHero: 1, goblinWarrior: 1 }, boss: 'hydra1' },
    ],
    potions: POTION_WEIGHTS,
    startRewards: startRewards(spellWeights([w('armySummon', 3), w('energyMines', 2), w('energyPulseSpell', 2), w('merlinSword', 2), w('healBlast', 1), w('arrowRain', 1), w('boltFan', 1), w('acidSplash', 1)], MERLIN4_OBJECTS)),
  },
}

// ---- the other floors (merlinOpen tilesets, which hold every ported actor) ----

/** merlinOpenObjects key indices (assets/tile-keys/merlinOpenObjects.txt, 10 per row). */
export const MERLIN_OPEN_OBJECTS: Record<string, number> = {
  player: 2,
  scarletInGame: 51,
  ochreInGame: 52,
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
  // the roguelite biomes' units
  hydra2: 122,
  iceRock: 108,
  shurikenNinja: 111,
  ninja: 112,
  mysteriousCloud: 113,
  speedyGuy: 115,
  fangBunnyBaby: 143,
  fangBunny: 144,
  fangBunnyPortal: 145,
  lavaGolem: 155,
  musicLastStand: 176,
  musicWoodsOfEvil: 177,
  scWarrior: 151,
  scArcher: 152,
  scMonk: 153,
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
  ...REMAKE_OBJECT_TILES['merlinOpenObjects'], // the volley spells' scrolls
}

export const MERLIN_OPEN_TILESETS: Record<LayerName, string> = {
  backgroundPassive: 'merlinOpenPassive',
  backgroundActive: 'merlinOpenActive',
  objects: 'merlinOpenObjects',
}

// merlinOpenActive tiles (10 per row). Solid: bricks, bars, rocks, trees, pots, skull, shrine.
// the grey castle wall (rows 1-3): towers 1 wide, top / middle / base, a left and a right variant
// (the original maps put the B variant at the right end of a wall), and the crenellated wall face
const TOWER_TOP = 2
const TOWER_TOP_B = 3
const TOWER = 12
const TOWER_B = 13
const TOWER_BASE = 22
const TOWER_BASE_B = 23
const CASTLE_WALL = 21
// the golden palace (rows 1-3): a column 1 wide with a dome on top, the column with a wall running
// off to its right or left, and the banded wall face between them
const GOLD_DOME = 4
const GOLD_COLUMN = 14
const GOLD_COLUMN_WALL_RIGHT = 24
const GOLD_WALL = 25
const GOLD_COLUMN_WALL_LEFT = 26
const GOLD_HEAP = 5
const GOLD_HEAP_B = 6
const GOLD_HEAP_C = 15
const GOLD_HEAP_D = 16
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
// greenery (rows 4 and 9-12): trees, pines, reeds and ferns
const GREEN_TREE = 35
const GREEN_BUSH_TREE = 38
const WHITE_REEDS = 84
const GRASSY_REEDS = 85
const TANGLED_TREE = 87
const LEAFY_GREEN_TREE = 91
const DENSE_REEDS = 94
const EYE_PLANT = 95
const TALL_REEDS = 96
const FERNS = 97
const GREEN_PINES = 101
const LOG = 107
// blue, white and icy rocks (rows 10-12)
const SNOW_ROCK = 100
const BLUE_ROCK = 108
const BLUE_ROCKS = 109
const ICE_CRYSTAL = 110
const WHITE_ROCK = 118
// walkable (#none)
const YELLOW_SPRIG = 81
const GOLD_COINS = 60
const LITTLE_PLANT = 70
const GREY_PEBBLES = 79
const PUDDLE = 120
const DARK_PEBBLES = 140
// merlinOpenPassive tiles (10 per row)
const GOLD_FLOOR = 17
const PALACE_FLOOR = 36
const MUD = 2
const MUD_STONES = 9
/** Remake tile: the cracked grey stone (25) re-coloured to a soft red sandstone (tools/derived-tiles.ts). */
const RED_SANDSTONE = 37
const BLUE_COBBLES = 35
const MOSS = 21
const DARK_GRASS = 22
const SWAMP = 23
const GREY_STONE = 25

/**
 * The forest's plan (regular enemies grow along x, generators along y; the tower mirrors this floor
 * in x). Owner: necromancers are midboss/boss tier here, so they only come in fixed groups.
 */
const UNDEAD_MARSH_PLAN: RoomPlan = [
  [
    midboss(
      [
        { label: 'lone necromancer', units: { necromancer: 1 }, faction: 'undead', alone: true },
        { label: 'haunted crypt', units: { skeletonDwelling: 1, greyGhost: 2 }, faction: 'undead' },
      ],
      { regulars: n(0, 2, WEAK) }
    ),
    normal({ producers: n(4, 6, WEAK), regulars: n(0, 2, WEAK) }),
    boss({ producers: n(0, 1, WEAK_MID), regulars: n(2, 3, WEAK_MID) }),
  ],
  [
    normal({ producers: n(2, 3, WEAK), regulars: n(0, 2, WEAK) }),
    normal({ producers: FEW_WEAK_OR_ONE_STRONG, regulars: n(1, 3, MOSTLY_STRONG), extras: n(1, 2, WEAK) }),
    normal({ regulars: n(4, 5, STRONG_MID), extras: WEAK_SPRINKLE }),
  ],
  [
    START,
    normal({ regulars: n(2, 3, WEAK) }),
    normal({
      groups: [
        { label: 'critter nest', units: { cocoon: 1, quadranid: 3 }, faction: 'critters' },
        { label: 'skeleton patrol', units: { skeletonWarrior: 3, skeletonThrower: 1 }, faction: 'undead' },
      ],
      regulars: NUMEROUS_WEAK,
    }),
  ],
]

export const UNDEAD_MARSH: FloorTheme = {
  id: 'undead-marsh',
  name: 'Undead Marsh',
  showcase: ['skeletonWarrior', 'greyGhost', 'skeletonGiant', 'quadranid'],
  level: 2,
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
  decorations: [w(PUDDLE, 3), w(GREY_PEBBLES, 1), w(DARK_PEBBLES, 1), w(LITTLE_PLANT, 1)],
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
    roomPlan: UNDEAD_MARSH_PLAN,
    wildcardChance: WILDCARD_CHANCE,
    mixedFactionChance: MIXED_FACTION_CHANCE,
    enemies: [
      { key: 'skeletonWarrior', weight: 6, tier: 'weak', faction: 'undead' },
      { key: 'skeletonThrower', weight: 2, tier: 'weak', faction: 'undead' },
      { key: 'skeletonArcher', weight: 2, tier: 'mid', faction: 'undead' },
      { key: 'greyGhost', weight: 1, tier: 'mid', faction: 'undead', producer: true },
      { key: 'skeletonComando', weight: 1, tier: 'mid', faction: 'undead' },
      { key: 'skeletonGiant', weight: 1, tier: 'strong', maxPerRoom: 2, faction: 'undead' },
      // the owner's "gun critter": monsters, which brawl with the undead, so they hold rooms of their own
      { key: 'quadranid', weight: 4, tier: 'weak', faction: 'critters' },
      { key: 'bat', weight: 1.5, tier: 'weak' },
    ],
    dwellings: [
      { key: 'skeletonDwelling', weight: 3, tier: 'weak', faction: 'undead' },
      { key: 'cocoon', weight: 2, tier: 'weak', faction: 'critters' },
      { key: 'batTree', weight: 1, tier: 'weak' },
    ],
    bosses: [
      { label: 'skeleton army', units: { skelitonLord: 1, skeletonWarrior: 3 }, faction: 'undead', boss: 'skelitonLord' },
      { label: 'necromancer trio', units: { necromancer: 3 }, faction: 'undead', boss: 'necromancer', alone: true },
      { label: 'necromancer and archers', units: { necromancer: 1, skeletonArcher: 12 }, faction: 'undead', boss: 'necromancer', alone: true },
    ],
    potions: POTION_WEIGHTS,
    startRewards: startRewards(
      spellWeights(
        [w('energyPulseSpell', 2), w('energyMines', 2), w('arcticBlast', 2), w('cBlast', 2), w('armySummon', 1), w('healBlast', 1), w('monsterSummon', 1), w('arrowRain', 1), w('skullToss', 1), w('laserVolley', 1)],
        MERLIN_OPEN_OBJECTS
      )
    ),
  },
}

/**
 * The forest's orientation: the sketch's golem quarry (a boulder cave, a producer) already led the
 * farY corner, so it stays the generator midboss there.
 */
const DRAGON_CANYON_PLAN: RoomPlan = [
  [
    midboss(
      [
        { label: 'golem quarry', units: { boulderCave: 1, boulderMonster: 1 } },
        { label: 'dark cave', units: { darkCave: 1, darkGolem: 1 } },
      ],
      { regulars: n(0, 2, WEAK) }
    ),
    normal({ producers: n(4, 6, WEAK), regulars: n(0, 2, WEAK) }),
    boss({ producers: n(0, 1, WEAK_MID), regulars: n(2, 3, WEAK_MID) }),
  ],
  [
    normal({ producers: n(2, 3, WEAK), regulars: n(0, 2, WEAK) }),
    normal({ producers: FEW_WEAK_OR_ONE_STRONG, regulars: n(1, 3, MOSTLY_STRONG), extras: n(1, 2, WEAK) }),
    normal({ regulars: n(4, 5, STRONG_MID), extras: WEAK_SPRINKLE }),
  ],
  [
    START,
    normal({ regulars: n(2, 3, WEAK) }),
    normal({
      groups: [
        { label: 'dojo class', units: { karateGuy: 3, kongFuChicken: 2 } },
        { label: 'lizard pack', units: { lizard: 4 } },
      ],
      regulars: NUMEROUS_WEAK,
    }),
  ],
]

export const DRAGON_CANYON: FloorTheme = {
  id: 'dragon-canyon',
  name: 'Dragon Canyon',
  showcase: ['karateGuy', 'lizard', 'dragon', 'darkGolem'],
  level: 3,
  floorSize: DEFAULT_FLOOR_SIZE,
  tileSets: MERLIN_OPEN_TILESETS,
  objectTiles: MERLIN_OPEN_OBJECTS,
  ground: [w(RED_SANDSTONE)],
  wall: [w(STONE_BOULDER, 6), w(GREY_CRAG, 1)],
  longWall: [w(STONE_BOULDER, 6), w(GREY_BOULDER, 1), w(GREY_CRAG, 1)],
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
    baffles: { chance: 0.7, count: [2, 3], reach: [0.5, 0.75], verticalChance: 0.6, thickness: [1, 1] },
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
    roomPlan: DRAGON_CANYON_PLAN,
    wildcardChance: WILDCARD_CHANCE,
    mixedFactionChance: MIXED_FACTION_CHANCE,
    // martial artists as the weak ones; dragons, hydras and dark golems as the strong ones
    enemies: [
      { key: 'karateGuy', weight: 4, tier: 'weak' },
      { key: 'kongFuChicken', weight: 2, tier: 'weak' },
      { key: 'lizard', weight: 2, tier: 'weak' },
      { key: 'plant', weight: 1.2, tier: 'mid' },
      { key: 'boulderMonster', weight: 1.5, tier: 'mid' },
      { key: 'lizardSoldier', weight: 1, tier: 'mid' },
      { key: 'hydra1', weight: 0.8, tier: 'mid' },
      { key: 'dragon', weight: 1.5, tier: 'strong', maxPerRoom: 2 },
      { key: 'darkGolem', weight: 0.8, tier: 'strong', maxPerRoom: 1 },
    ],
    dwellings: [
      { key: 'dojo', weight: 3, tier: 'weak' },
      { key: 'boulderCave', weight: 1, tier: 'mid' },
      { key: 'darkCave', weight: 1, tier: 'strong', maxPerRoom: 1 },
    ],
    bosses: [
      { label: 'dark golems', units: { fourArmGolem: 1, doubleDarkGolem: 1 }, boss: 'fourArmGolem' },
      { label: "dragon's lair", units: { dragon: 3, lizardSoldier: 2 }, boss: 'dragon' },
      { label: 'hydra den', units: { hydra3: 1, hydra1: 2, plant: 2 }, boss: 'hydra3' },
    ],
    potions: POTION_WEIGHTS,
    startRewards: startRewards(
      spellWeights([w('arcticBlast', 2), w('energyBeamSpell', 2), w('cBlast', 2), w('energyPunch', 2), w('armySummon', 1), w('monsterSummon', 1), w('dragonFire', 1), w('boulderLob', 1), w('darkRockBurst', 1), w('needleSpray', 1), w('acidSplash', 1)], MERLIN_OPEN_OBJECTS)
    ),
  },
}

/**
 * The castle walls as the original MR3 maps draw them (Scarlet_Castle, mr4Demo): vertical runs are
 * towers (top, middle, base), horizontal runs the wall face, a corner or junction the tower, and a
 * wall face ending in the open stops at a one-tile tower. Towers with a wall to their left only take
 * the B variant, as the right-hand towers do in the originals.
 */
const CASTLE_WALLS: WallAutotile = [
  { when: { up: false, down: false, left: false, right: false }, tiles: [w(TOWER_TOP)] },
  { when: { up: false, down: false, left: true, right: false }, tiles: [w(TOWER_TOP_B)] },
  { when: { up: false, down: false, left: false, right: true }, tiles: [w(TOWER_TOP)] },
  { when: { up: false, down: false }, tiles: [w(CASTLE_WALL)] },
  { when: { up: false, left: true, right: false }, tiles: [w(TOWER_TOP_B)] },
  { when: { up: false }, tiles: [w(TOWER_TOP)] },
  { when: { down: false, left: true, right: false }, tiles: [w(TOWER_BASE_B)] },
  { when: { down: false }, tiles: [w(TOWER_BASE)] },
  { when: { left: true, right: false }, tiles: [w(TOWER_B)] },
  { when: {}, tiles: [w(TOWER)] },
]

/**
 * Owner: necromancers should be a regular sight in the maze, so its generator rooms also draw mid
 * producers (necromancers, mid in the maze, in an undead room; other factions fall back to weak ones).
 */
const WEAK_SOME_MID: TierWeights = { weak: 2, mid: 1 }

/** A Magic Maze boss group: its leader and the minions it brings to the midboss corner. */
interface MazeBossGroup {
  label: string
  lead: string
  minions: Record<string, number>
  faction: string
  allies?: readonly string[]
}

/**
 * Owner (2026-10-24): the maze's midboss and boss rooms draw from the same groups, the midboss
 * corner alone with the minions below, the exit room with this many times the minions (rounded
 * up) and its usual draws on top.
 */
const BOSS_MINION_FACTOR = 1.5

const MAZE_BOSS_GROUPS: readonly MazeBossGroup[] = [
  // Ochre (team blackSorcerer hates only Aldevar and the monster summon) leads the magical alliance's casters
  { label: "Ochre's elementals", lead: 'ochreInGame', minions: { bombMage: 1, thunderMonk: 1, shrouder: 1, magicPortal: 1 }, faction: 'alliance' },
  // Scarlet summons undead and her team and theirs leave each other alone, so her red army may come too
  { label: "Scarlet's court", lead: 'scarletInGame', minions: { necromancer: 2, darkMage: 1 }, faction: 'undead', allies: ['scarlet'] },
  { label: "dark sorcerer's court", lead: 'darkMage', minions: { darkMage: 1, necromancer: 1, greyGhost: 1 }, faction: 'undead' },
  { label: "Scarlet's guard", lead: 'scMonk', minions: { scMonk: 1, scWarrior: 1, scArcher: 1 }, faction: 'scarlet' },
]

/** A group's units: its minions and its leader. */
const withLead = (lead: string, minions: Record<string, number>): Record<string, number> => ({ ...minions, [lead]: (minions[lead] ?? 0) + 1 })
const scaledMinions = (minions: Record<string, number>): Record<string, number> =>
  Object.fromEntries(Object.entries(minions).map(([key, count]) => [key, Math.ceil(count * BOSS_MINION_FACTOR)]))
const factionsOf = (g: MazeBossGroup) => ({ faction: g.faction, ...(g.allies ? { allies: g.allies } : {}) })

const mazeMidboss = (g: MazeBossGroup): UnitGroup =>
  ({ label: g.label, lead: g.lead, units: withLead(g.lead, g.minions), ...factionsOf(g), alone: true })
const mazeBoss = (g: MazeBossGroup): BossGroup =>
  ({ label: g.label, boss: g.lead, units: withLead(g.lead, scaledMinions(g.minions)), ...factionsOf(g) })

/** The forest's plan, as the marsh's (the tower mirrors this floor in x). */
const MAGIC_MAZE_PLAN: RoomPlan = [
  [
    midboss(MAZE_BOSS_GROUPS.map(mazeMidboss)),
    normal({ producers: n(4, 6, WEAK_SOME_MID), regulars: n(0, 2, WEAK) }),
    boss({ producers: n(0, 1, WEAK_MID), regulars: n(2, 3, WEAK_MID) }),
  ],
  [
    normal({ producers: n(2, 3, WEAK_SOME_MID), regulars: n(0, 2, WEAK) }),
    normal({ producers: FEW_WEAK_OR_ONE_STRONG, regulars: n(1, 3, MOSTLY_STRONG), extras: n(1, 2, WEAK) }),
    normal({ regulars: n(4, 5, STRONG_MID), extras: WEAK_SPRINKLE }),
  ],
  [
    START,
    normal({ regulars: n(2, 3, WEAK) }),
    normal({
      groups: [
        { label: 'alliance squad', units: { bombMage: 2, thunderMonk: 2 }, faction: 'alliance' },
        { label: 'Scarlet patrol', units: { scWarrior: 2, scArcher: 2 }, faction: 'scarlet' },
      ],
      regulars: NUMEROUS_WEAK,
    }),
  ],
]

export const MAGIC_MAZE: FloorTheme = {
  id: 'magic-maze',
  name: 'Magic Maze',
  showcase: ['bombMage', 'scWarrior', 'necromancer', 'darkMage'],
  level: 4,
  floorSize: DEFAULT_FLOOR_SIZE,
  tileSets: MERLIN_OPEN_TILESETS,
  objectTiles: MERLIN_OPEN_OBJECTS,
  ground: [w(BLUE_COBBLES)],
  wall: [w(TOWER), w(TOWER_B)],
  longWall: [w(TOWER), w(TOWER_B)],
  wallAutotile: CASTLE_WALLS,
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
    roomPlan: MAGIC_MAZE_PLAN,
    wildcardChance: WILDCARD_CHANCE,
    mixedFactionChance: MIXED_FACTION_CHANCE,
    // MR3's wizards are not ported: the magical alliance, the undead casters and Scarlet's army
    // (the chromatic sorcerers' troops) stand in, each faction in rooms of its own
    enemies: [
      { key: 'bombMage', weight: 3, tier: 'weak', faction: 'alliance' },
      { key: 'thunderMonk', weight: 3, tier: 'weak', faction: 'alliance' },
      { key: 'shrouder', weight: 2, tier: 'mid', faction: 'alliance' },
      { key: 'necromancer', weight: 5, tier: 'mid', faction: 'undead', producer: true },
      // owner: about 20 % fewer dark mages. They are the maze's only undead regular, so the court's
      // and the study's draws are all dark mages and their weight changes little; the cap does
      { key: 'darkMage', weight: 2, tier: 'strong', maxPerRoom: 3, faction: 'undead' },
      { key: 'greyGhost', weight: 1, tier: 'weak', faction: 'undead', producer: true },
      { key: 'scWarrior', weight: 2, tier: 'weak', faction: 'scarlet' },
      { key: 'scArcher', weight: 2, tier: 'weak', faction: 'scarlet' },
      { key: 'scMonk', weight: 1, tier: 'mid', faction: 'scarlet', producer: true },
      // giant orcs and vultures are monsters, who brawl with all of the above
      { key: 'blackOrc', weight: 1.5, tier: 'strong', maxPerRoom: 2, faction: 'monsters' },
      { key: 'vultureGuard', weight: 1, tier: 'strong', maxPerRoom: 2, faction: 'monsters' },
    ],
    dwellings: [
      { key: 'magicPortal', weight: 2, tier: 'weak', faction: 'alliance' },
      { key: 'skeletonDwelling', weight: 1, tier: 'weak', faction: 'undead' },
    ],
    // the midboss corner's groups with more minions (the Black Sorcerer is not in the engine's data)
    bosses: MAZE_BOSS_GROUPS.map(mazeBoss),
    potions: [w('manaCapacity', 3), w('manaBurst', 3), w('manaFlow', 2), w('walkSpeed', 1)],
    startRewards: startRewards(
      spellWeights([w('energyBeamSpell', 3), w('cBlast', 2), w('energyPunch', 2), w('monsterSummon', 2), w('arcticBlast', 1), w('bombVolley', 1), w('thunderBurst', 1), w('pinStorm', 1), w('poisonSmoke', 1), w('lightningFan', 1), w('longbow', 1), w('skullToss', 1), w('arrowRain', 1)], MERLIN_OPEN_OBJECTS),
      MAZE_GIVES_GOLDEN_MACHINE_GUN ? [GOLDEN_MACHINE_GUN] : []
    ),
  },
}

/** The Sorcerer's Tower's floors, from the bottom up. */
export const TOWER_THEMES: readonly FloorTheme[] = [GOBLIN_FOREST, UNDEAD_MARSH, DRAGON_CANYON, MAGIC_MAZE]

// ---- Golden Fort (merlinOpen tilesets; not part of the tower) ----

/** merlinOpenObjects' goblin and orc tiles (61-74), for the fort's goblins. */
const MERLIN_OPEN_GOBLIN_OBJECTS: Record<string, number> = {
  goblinArcher: 61,
  goblinWarrior: 62,
  goblinHero: 63,
  goblinMage: 64,
  goblinHut: 66,
  goblinMageHut: 67,
  bowOrc: 71,
  swordOrc: 72,
  mageOrc: 73,
  orcHouse: 74,
}

/**
 * Each unit's team in the actor data (`team`; floor.test.ts checks this). The fort mixes the
 * themes' units, so its factions are the engine's teams themselves.
 */
const TEAM_OF: Record<string, string> = {
  goblinArcher: 'goblins',
  goblinWarrior: 'goblins',
  goblinHero: 'goblins',
  goblinMage: 'goblins',
  goblinHut: 'goblins',
  goblinMageHut: 'goblins',
  orcHouse: 'goblins',
  bowOrc: 'orcs',
  swordOrc: 'orcs',
  mageOrc: 'orcs',
  bat: 'cave',
  batTree: 'cave',
  skeletonWarrior: 'undead',
  skeletonThrower: 'undead',
  skeletonArcher: 'undead',
  skeletonComando: 'undead',
  skeletonGiant: 'undead',
  skeletonDwelling: 'undead',
  skelitonLord: 'undead',
  greyGhost: 'undead',
  necromancer: 'undead',
  darkMage: 'undead',
  quadranid: 'monsters',
  cocoon: 'monsters',
  lizard: 'monsters',
  lizardSoldier: 'monsters',
  boulderMonster: 'monsters',
  boulderCave: 'monsters',
  dragon: 'monsters',
  darkGolem: 'monsters',
  darkCave: 'monsters',
  fourArmGolem: 'monsters',
  doubleDarkGolem: 'monsters',
  blackOrc: 'monsters',
  vultureGuard: 'monsters',
  plant: 'swamp',
  hydra1: 'swamp',
  hydra3: 'swamp',
  karateGuy: 'karate',
  kongFuChicken: 'karate',
  dojo: 'karate',
  bombMage: 'magicalAlliance',
  thunderMonk: 'magicalAlliance',
  shrouder: 'magicalAlliance',
  magicPortal: 'magicalAlliance',
  scWarrior: 'scarlet',
  scArcher: 'scarlet',
  scMonk: 'scarlet',
  scarletInGame: 'scarlet',
  ochreInGame: 'blackSorcerer',
}

const teamOf = (key: string): string => {
  const team = TEAM_OF[key]
  if (!team) throw new Error(`golden fort: no team for "${key}"`)
  return team
}

/**
 * Owner: the fort's enemies are very random, so its rooms draw from every theme's enemies and
 * dwellings, each at weight 1 and its own theme's tier, with its team as its faction.
 */
function everyThemesChoices(pick: (u: UnitTuning) => EnemyChoice[]): EnemyChoice[] {
  const byKey = new Map<string, EnemyChoice>()
  for (const theme of TOWER_THEMES) {
    for (const c of pick(theme.units)) if (!byKey.has(c.key)) byKey.set(c.key, { ...c, weight: 1, faction: teamOf(c.key) })
  }
  return [...byKey.values()]
}

/**
 * Teams that leave each other alone (no hate either way in assets/teams; floor.test.ts checks
 * this), so a fort room mixes several teams without them brawling at once. The magical alliance
 * hates every other enemy team, so it holds rooms of its own, with Ochre (blackSorcerer) when he leads.
 */
const FORT_ALLIANCES: Alliance[] = [
  { name: 'greenskins and beasts', factions: ['goblins', 'orcs', 'monsters', 'swamp', 'cave'], weight: 3 },
  { name: 'the dead and the red', factions: ['undead', 'scarlet', 'cave'], weight: 2 },
  { name: 'martial beasts', factions: ['karate', 'monsters', 'swamp'], weight: 2 },
  { name: 'dojo and Scarlet', factions: ['karate', 'scarlet'], weight: 1 },
  { name: 'magical alliance', factions: ['magicalAlliance', 'blackSorcerer'], weight: 1 },
]

/**
 * Owner: every room but the start holds units to an HP budget of 1500-2000, drawn per room, with
 * generators and summoners counting three times their energy (at least 100, so fragile huts and
 * portals still count 300). No unit cap but the room's free tiles; no unit that would take the
 * room past 2000 (so the dark cave, 3 x 1000, never comes).
 */
const FORT_BUDGET: TierDraw = {
  count: [0, Infinity],
  tiers: { weak: 1, mid: 1, strong: 1 },
  hpBudget: { base: 1500, perLevel: 0, spread: 500, producers: { factor: 3, least: 100 }, capped: true },
}
const FORT_ROOM = normal({ mixed: FORT_BUDGET })

/** No midboss: every room is a budget room; the exit adds one of every theme's bosses. */
const GOLDEN_FORT_PLAN: RoomPlan = [
  [FORT_ROOM, FORT_ROOM, boss({ mixed: FORT_BUDGET })],
  [FORT_ROOM, FORT_ROOM, FORT_ROOM],
  [START, FORT_ROOM, FORT_ROOM],
]

/**
 * The golden palace walls: horizontal runs are the banded wall face between columns, a run's ends
 * and corners the column with the wall running off it, vertical runs plain columns with a dome
 * where a column's top stands free.
 */
const GOLD_WALLS: WallAutotile = [
  { when: { up: false, down: false, left: false, right: false }, tiles: [w(GOLD_COLUMN)] },
  { when: { left: false, right: true }, tiles: [w(GOLD_COLUMN_WALL_RIGHT)] },
  { when: { left: true, right: false }, tiles: [w(GOLD_COLUMN_WALL_LEFT)] },
  { when: { left: true, right: true }, tiles: [w(GOLD_WALL)] },
  { when: { up: false }, tiles: [w(GOLD_DOME)] },
  { when: {}, tiles: [w(GOLD_COLUMN)] },
]

export const GOLDEN_FORT: FloorTheme = {
  id: 'golden-fort',
  name: 'Golden Fort',
  showcase: ['swordOrc', 'necromancer', 'dragon', 'bombMage'],
  level: 5,
  floorSize: DEFAULT_FLOOR_SIZE,
  tileSets: MERLIN_OPEN_TILESETS,
  objectTiles: { ...MERLIN_OPEN_OBJECTS, ...MERLIN_OPEN_GOBLIN_OBJECTS },
  ground: [w(PALACE_FLOOR, 40), w(GOLD_FLOOR, 1)],
  wall: [w(GOLD_COLUMN)],
  longWall: [w(GOLD_COLUMN)],
  wallAutotile: GOLD_WALLS,
  materials: [
    { name: 'treasure', weight: 3, tiles: [w(GOLD_HEAP, 2), w(GOLD_HEAP_B, 2), w(GOLD_HEAP_C, 1), w(GOLD_HEAP_D, 1)] },
    { name: 'urns', weight: 1, tiles: [w(WHITE_POT, 2), w(BEIGE_POT, 1)] },
  ],
  stumps: [w(GOLD_COLUMN, 2), w(GOLD_DOME, 1)],
  decorations: [w(GOLD_COINS, 3), w(GREY_PEBBLES, 1)],
  shape: {
    patches: [1, 3],
    patchSize: [1, 4],
    smoothSteps: 0,
    birth: 5,
    baffles: { chance: 0.65, count: [1, 2], reach: [0.5, 0.7], verticalChance: 0.6, thickness: [1, 1] },
    longWallChance: 0.25,
    longWallSide: [5, 8],
    longWallEnd: [2, 4],
    stumpChance: 0.008,
    decorationChance: 0.03,
    minOpenShare: 0.55,
  },
  edges: { extraOpenChance: 0.65, sideOpening: [3, 5], endOpening: [4, 7], openingDepth: 2 },
  units: {
    player: 'player',
    startMusic: 'musicElectronicMerlin',
    roomPlan: GOLDEN_FORT_PLAN,
    wildcardChance: 0,
    mixedFactionChance: 0, // its alliances already mix peaceful teams
    enemies: everyThemesChoices((u) => u.enemies),
    dwellings: everyThemesChoices((u) => u.dwellings),
    bosses: TOWER_THEMES.flatMap((t) => t.units.bosses).map((b) => ({ ...b, faction: teamOf(b.boss) })),
    alliances: FORT_ALLIANCES,
    potions: POTION_WEIGHTS,
    // owner: ten potions, two medikits and one spell scroll of any kind
    startRewards: { potions: POTION_WEIGHTS, potionCount: 10, medikits: 2, spellScrolls: spellWeights([], MERLIN_OPEN_OBJECTS), extras: [] },
  },
}

/** Every generated floor: the tower's four, then the Golden Fort (a floor of its own). */
export const THEMES: readonly FloorTheme[] = [...TOWER_THEMES, GOLDEN_FORT]

// ---- the roguelite biomes (docs/plans/2026-10-25-roguelite-mode-design.md, Biomes; merlinOpen tilesets) ----

/**
 * The tower floors' plan with a biome's own groups: generators toward the midboss corner (farY),
 * regular enemies toward the "numerous weak" corner (farX), the centre balancing the two.
 */
const biomePlan = (midbossGroups: UnitGroup[], weakCornerGroups: UnitGroup[]): RoomPlan => [
  [
    midboss(midbossGroups, { regulars: n(0, 2, WEAK) }),
    normal({ producers: n(4, 6, WEAK), regulars: n(0, 2, WEAK) }),
    boss({ producers: n(0, 1, WEAK_MID), regulars: n(2, 3, WEAK_MID) }),
  ],
  [
    normal({ producers: n(2, 3, WEAK), regulars: n(0, 2, WEAK) }),
    normal({ producers: FEW_WEAK_OR_ONE_STRONG, regulars: n(1, 3, MOSTLY_STRONG), extras: n(1, 2, WEAK) }),
    normal({ regulars: n(4, 5, STRONG_MID), extras: WEAK_SPRINKLE }),
  ],
  [START, normal({ regulars: n(2, 3, WEAK) }), normal({ groups: weakCornerGroups, regulars: NUMEROUS_WEAK })],
]

/** Every unit key the biomes place, besides the tower floors' (merlinOpen's goblins included). */
const BIOME_OBJECTS: Record<string, number> = { ...MERLIN_OPEN_OBJECTS, ...MERLIN_OPEN_GOBLIN_OBJECTS }

/**
 * Deep Forest's factions: the ninjas hate the goblins, bats, plants and fang bunnies (and they the
 * ninjas), so the ninjas hold rooms of their own.
 */
const WOODS = 'woods'
const NINJAS = 'ninjas'

export const DEEP_FOREST: FloorTheme = {
  id: 'deep-forest',
  name: 'Deep Forest',
  showcase: ['goblinHero', 'fangBunny', 'ninja', 'plant'],
  level: 1,
  floorSize: DEFAULT_FLOOR_SIZE,
  tileSets: MERLIN_OPEN_TILESETS,
  objectTiles: BIOME_OBJECTS,
  ground: [w(DARK_GRASS, 20), w(MOSS, 2)],
  wall: [w(GREEN_PINES, 5), w(EYED_TREE, 1), w(EYED_TREE_B, 1), w(GREEN_TREE, 1)],
  longWall: [w(GREEN_PINES, 4), w(EYED_TREE, 1)],
  materials: [
    { name: 'deep woods', weight: 7, tiles: [w(GREEN_PINES, 4), w(LEAFY_GREEN_TREE, 2), w(GREEN_TREE, 1), w(GREEN_BUSH_TREE, 1), w(TANGLED_TREE, 1)] },
    { name: 'undergrowth', weight: 2, tiles: [w(FERNS, 2), w(TALL_REEDS, 1), w(EYE_PLANT, 1), w(GRASSY_REEDS, 1)] },
    { name: 'haunted trees', weight: 2, tiles: [w(EYED_TREE, 2), w(EYED_TREE_B, 2), w(EYED_SHRUB, 1), w(EYED_SHRUB_B, 1)] },
  ],
  stumps: [w(LOG, 2), w(EYED_SHRUB, 1)],
  decorations: [w(LITTLE_PLANT, 3), w(DARK_PEBBLES, 1), w(YELLOW_SPRIG, 0.5)],
  // denser than the Goblin Forest: more and bigger thickets, and tree lines cutting in
  shape: {
    patches: [4, 7],
    patchSize: [3, 8],
    smoothSteps: 1,
    birth: 5,
    cuts: { chance: 0.4, extraChance: 0.2, turnChance: 0.5, gapChance: 0.6, gapWidth: [2, 3], wobbleChance: 0.3 },
    longWallChance: 0.3,
    longWallSide: [6, 9],
    longWallEnd: [3, 5],
    stumpChance: 0.015,
    decorationChance: 0.035,
    minOpenShare: 0.5,
  },
  edges: { extraOpenChance: 0.7, sideOpening: [3, 5], endOpening: [4, 7], openingDepth: 2 },
  units: {
    player: 'player',
    startMusic: 'musicWoodsOfEvil',
    roomPlan: biomePlan(
      [
        { label: 'ninja hideout', units: { mysteriousCloud: 1, ninja: 1, shurikenNinja: 1 }, faction: NINJAS },
        { label: 'bat roost', units: { batTree: 2, bat: 2 }, faction: WOODS },
      ],
      [
        { label: 'goblin raiders', units: { goblinWarrior: 3, goblinArcher: 2 }, faction: WOODS },
        { label: 'fang bunny litter', units: { fangBunnyBaby: 3 }, faction: WOODS },
      ]
    ),
    wildcardChance: WILDCARD_CHANCE,
    mixedFactionChance: MIXED_FACTION_CHANCE,
    enemies: [
      { key: 'goblinWarrior', weight: 4, tier: 'weak', faction: WOODS },
      { key: 'goblinArcher', weight: 3, tier: 'weak', faction: WOODS },
      { key: 'bat', weight: 2, tier: 'weak', faction: WOODS },
      { key: 'goblinHero', weight: 1.5, tier: 'mid', faction: WOODS },
      { key: 'goblinMage', weight: 1.5, tier: 'mid', faction: WOODS },
      { key: 'plant', weight: 1.5, tier: 'mid', faction: WOODS },
      { key: 'fangBunnyBaby', weight: 1, tier: 'mid', maxPerRoom: 2, faction: WOODS },
      { key: 'fangBunny', weight: 0.6, tier: 'mid', maxPerRoom: 1, faction: WOODS },
      // the shuriken ninjas are the ninjas' weak ones, so their rooms can fill a weak draw
      { key: 'shurikenNinja', weight: 0.5, tier: 'weak', maxPerRoom: 2, faction: NINJAS },
      { key: 'ninja', weight: 1, tier: 'strong', maxPerRoom: 2, faction: NINJAS },
    ],
    dwellings: [
      { key: 'goblinHut', weight: 2, tier: 'weak', faction: WOODS },
      { key: 'batTree', weight: 1, tier: 'strong', faction: WOODS },
      { key: 'goblinMageHut', weight: 1, tier: 'strong', faction: WOODS },
      { key: 'mysteriousCloud', weight: 0.5, tier: 'strong', maxPerRoom: 1, faction: NINJAS },
    ],
    bosses: [
      { label: 'fang bunny warren', units: { fangBunnyPortal: 1, fangBunny: 1 }, faction: WOODS, boss: 'fangBunny' },
      { label: 'goblin hero war band', units: { goblinHero: 3, goblinWarrior: 3, goblinMage: 1 }, faction: WOODS, boss: 'goblinHero' },
    ],
    potions: POTION_WEIGHTS,
    startRewards: startRewards(
      spellWeights([w('armySummon', 2), w('energyMines', 2), w('energyPulseSpell', 2), w('merlinSword', 2), w('healBlast', 1), w('arrowRain', 1), w('needleSpray', 1), w('bunnyLob', 1), w('shurikenFan', 1)], BIOME_OBJECTS)
    ),
  },
}

export const HYDRA_MARSH: FloorTheme = {
  id: 'hydra-marsh',
  name: 'Hydra Marsh',
  showcase: ['lizard', 'quadranid', 'plant', 'hydra3'],
  level: 2,
  floorSize: DEFAULT_FLOOR_SIZE,
  tileSets: MERLIN_OPEN_TILESETS,
  objectTiles: BIOME_OBJECTS,
  ground: [w(SWAMP, 10), w(MOSS, 1)],
  wall: [w(TALL_REEDS, 3), w(DENSE_REEDS, 2), w(GRASSY_REEDS, 2), w(TANGLED_TREE, 2), w(LEAFY_GREEN_TREE, 1)],
  longWall: [w(TALL_REEDS, 3), w(DENSE_REEDS, 2), w(GRASSY_REEDS, 1)],
  materials: [
    { name: 'reeds', weight: 5, tiles: [w(WHITE_REEDS, 1), w(GRASSY_REEDS, 2), w(DENSE_REEDS, 2), w(TALL_REEDS, 2)] },
    { name: 'swamp trees', weight: 3, tiles: [w(TANGLED_TREE, 2), w(LEAFY_GREEN_TREE, 1), w(GREEN_BUSH_TREE, 1)] },
    { name: 'ferns', weight: 2, tiles: [w(FERNS, 2), w(EYE_PLANT, 1)] },
    { name: 'wet rocks', weight: 1, tiles: [w(BLUE_ROCK, 1), w(BLUE_ROCKS, 1), w(STONE_BOULDER, 1)] },
  ],
  stumps: [w(LOG, 1), w(EYE_PLANT, 1)],
  // more water: puddles everywhere
  decorations: [w(PUDDLE, 6), w(LITTLE_PLANT, 1)],
  shape: {
    patches: [2, 4],
    patchSize: [2, 6],
    smoothSteps: 1,
    birth: 5,
    cuts: { chance: 0.6, extraChance: 0.3, turnChance: 0.5, gapChance: 0.65, gapWidth: [2, 3], wobbleChance: 0.3 },
    longWallChance: 0,
    longWallSide: [6, 9],
    longWallEnd: [3, 5],
    stumpChance: 0.012,
    decorationChance: 0.1,
    minOpenShare: 0.5,
  },
  edges: { extraOpenChance: 0.6, sideOpening: [3, 4], endOpening: [3, 6], openingDepth: 2 },
  units: {
    player: 'player',
    startMusic: 'musicLastStand',
    roomPlan: biomePlan(
      [
        { label: 'quadranid hive', units: { cocoon: 2, quadranid: 2 } },
        { label: 'bat roost', units: { batTree: 2, bat: 2 } },
      ],
      [
        { label: 'lizard pack', units: { lizard: 4 } },
        { label: 'plant bed', units: { plant: 3, lizard: 1 } },
      ]
    ),
    wildcardChance: WILDCARD_CHANCE,
    mixedFactionChance: MIXED_FACTION_CHANCE,
    // monsters, the swamp's hydras and plants, and the cave's bats leave each other alone: no factions
    enemies: [
      { key: 'lizard', weight: 4, tier: 'weak' },
      { key: 'bat', weight: 2, tier: 'weak' },
      { key: 'lizardSoldier', weight: 1.5, tier: 'mid' },
      { key: 'plant', weight: 2, tier: 'mid' },
      { key: 'quadranid', weight: 2, tier: 'mid' },
      { key: 'hydra1', weight: 2, tier: 'strong', maxPerRoom: 2 },
      { key: 'hydra2', weight: 1, tier: 'strong', maxPerRoom: 1 },
    ],
    dwellings: [
      { key: 'cocoon', weight: 2, tier: 'weak' },
      { key: 'batTree', weight: 1, tier: 'weak' },
    ],
    bosses: [
      { label: 'hydra nest', units: { hydra3: 1, hydra1: 1, plant: 2 }, boss: 'hydra3' },
      { label: 'lizard war party', units: { lizardSoldier: 3, lizard: 3 }, boss: 'lizardSoldier' },
    ],
    potions: POTION_WEIGHTS,
    startRewards: startRewards(
      spellWeights([w('energyMines', 2), w('arcticBlast', 2), w('cBlast', 2), w('energyPulseSpell', 1), w('healBlast', 1), w('monsterSummon', 1), w('acidSplash', 1), w('laserVolley', 1), w('needleSpray', 1)], BIOME_OBJECTS)
    ),
  },
}

/** Golem Mountain's factions: the lava golems are Scarlet's, who brawl with the monsters' golems; the ice rocks leave both alone. */
const GOLEMS = 'golems'
const LAVA = 'lava'

export const GOLEM_MOUNTAIN: FloorTheme = {
  id: 'golem-mountain',
  name: 'Golem Mountain',
  showcase: ['boulderMonster', 'iceRock', 'lavaGolem', 'fourArmGolem'],
  level: 3,
  floorSize: DEFAULT_FLOOR_SIZE,
  tileSets: MERLIN_OPEN_TILESETS,
  objectTiles: BIOME_OBJECTS,
  ground: [w(GREY_STONE)],
  wall: [w(STONE_BOULDER, 6), w(GREY_CRAG, 2), w(DARK_ROCK, 1)],
  longWall: [w(STONE_BOULDER, 5), w(GREY_BOULDER, 1), w(GREY_CRAG, 1)],
  materials: [
    { name: 'rocks', weight: 6, tiles: [w(GREY_BOULDER, 3), w(GREY_CRAG, 2), w(ROCK_SPIRE, 1), w(ROCK_HEAP, 1), w(STONE_BOULDER, 1)] },
    { name: 'dark rocks', weight: 3, tiles: [w(DARK_ROCK, 2), w(BLUE_ROCKS, 1)] },
    { name: 'ice', weight: 1.5, tiles: [w(ICE_CRYSTAL, 2), w(SNOW_ROCK, 1), w(WHITE_ROCK, 1)] },
    { name: 'blue rocks', weight: 1, tiles: [w(BLUE_ROCK, 1), w(BLUE_ROCKS, 1)] },
  ],
  stumps: [w(ROCK_SPIRE, 2), w(ROCK_HEAP, 1)],
  decorations: [w(GREY_PEBBLES, 2), w(DARK_PEBBLES, 2)],
  // rockier than the Dragon Canyon: more and bigger rock patches, long walls as well as baffles
  shape: {
    patches: [3, 5],
    patchSize: [3, 7],
    smoothSteps: 1,
    birth: 5,
    baffles: { chance: 0.5, count: [1, 2], reach: [0.5, 0.7], verticalChance: 0.5, thickness: [1, 2] },
    longWallChance: 0.3,
    longWallSide: [6, 9],
    longWallEnd: [3, 5],
    stumpChance: 0.015,
    decorationChance: 0.04,
    minOpenShare: 0.5,
  },
  edges: { extraOpenChance: 0.7, sideOpening: [3, 5], endOpening: [4, 7], openingDepth: 2 },
  units: {
    player: 'player',
    startMusic: 'musicBaroqueRockTechno',
    roomPlan: biomePlan(
      [
        { label: 'golem quarry', units: { boulderCave: 1, boulderMonster: 2 }, faction: GOLEMS },
        { label: 'fire and ice', units: { lavaGolem: 2, iceRock: 2 }, faction: LAVA },
      ],
      [
        { label: 'boulder rollers', units: { boulderMonster: 4 }, faction: GOLEMS },
        { label: 'ice field', units: { iceRock: 4 } },
      ]
    ),
    wildcardChance: WILDCARD_CHANCE,
    mixedFactionChance: MIXED_FACTION_CHANCE,
    enemies: [
      { key: 'boulderMonster', weight: 4, tier: 'weak', faction: GOLEMS },
      // the ice rock (350) is about a boulder monster's match (300), so it joins the weak ones
      { key: 'iceRock', weight: 2, tier: 'weak' },
      { key: 'darkGolem', weight: 1.5, tier: 'mid', maxPerRoom: 2, faction: GOLEMS },
      { key: 'vultureGuard', weight: 1, tier: 'mid', maxPerRoom: 2, faction: GOLEMS },
      { key: 'lavaGolem', weight: 1, tier: 'mid', maxPerRoom: 2, faction: LAVA },
      { key: 'doubleDarkGolem', weight: 1, tier: 'strong', maxPerRoom: 1, faction: GOLEMS },
      { key: 'fourArmGolem', weight: 1, tier: 'strong', maxPerRoom: 1, faction: GOLEMS },
    ],
    dwellings: [
      { key: 'boulderCave', weight: 1, tier: 'weak', faction: GOLEMS },
      { key: 'darkCave', weight: 1, tier: 'strong', maxPerRoom: 1, faction: GOLEMS },
    ],
    bosses: [
      { label: 'golem forge', units: { fourArmGolem: 1, darkCave: 1, boulderMonster: 2 }, faction: GOLEMS, boss: 'fourArmGolem' },
      { label: 'vulture eyrie', units: { vultureGuard: 3, boulderMonster: 2 }, faction: GOLEMS, boss: 'vultureGuard' },
    ],
    potions: POTION_WEIGHTS,
    startRewards: startRewards(
      spellWeights([w('energyBeamSpell', 2), w('energyPunch', 2), w('arcticBlast', 2), w('cBlast', 1), w('merlinSword', 1), w('boulderLob', 1), w('darkRockBurst', 1), w('lavaLob', 1), w('iceBoulderLob', 1), w('lightningFan', 1)], BIOME_OBJECTS)
    ),
  },
}

/** The palace guards' factions, each in rooms of its own (they hate each other, but for Scarlet's and the dojo's). */
const SCARLET = 'scarlet'
const DOJO = 'dojo'
const MAGES = 'mages'

/**
 * The Golden Fort's palace on floor 4: its tiles and room shapes, but the rooms of a tower floor
 * (midboss, boss, the floor-4 budgets) held by hostile palace guards instead of the fort's peaceful
 * alliances of every floor's enemies.
 */
export const GOLDEN_PALACE: FloorTheme = {
  ...GOLDEN_FORT,
  id: 'golden-palace',
  name: 'Golden Palace',
  showcase: ['scArcher', 'karateGuy', 'shrouder', 'lavaGolem'],
  level: 4,
  objectTiles: BIOME_OBJECTS,
  units: {
    player: 'player',
    startMusic: 'musicElectronicMerlin',
    roomPlan: biomePlan(
      [
        { label: 'golem guard', units: { lavaGolem: 2, scMonk: 1 }, faction: SCARLET },
        { label: 'ninja ambush', units: { mysteriousCloud: 1, ninja: 2, shurikenNinja: 2 }, faction: NINJAS },
      ],
      [
        { label: 'palace guard', units: { scWarrior: 2, scArcher: 2 }, faction: SCARLET },
        { label: 'dojo students', units: { karateGuy: 3, kongFuChicken: 2 }, faction: DOJO },
      ]
    ),
    wildcardChance: WILDCARD_CHANCE,
    mixedFactionChance: MIXED_FACTION_CHANCE,
    enemies: [
      { key: 'scWarrior', weight: 3, tier: 'weak', faction: SCARLET },
      { key: 'scArcher', weight: 3, tier: 'weak', faction: SCARLET },
      { key: 'scMonk', weight: 1, tier: 'mid', faction: SCARLET, producer: true },
      { key: 'lavaGolem', weight: 1.5, tier: 'strong', maxPerRoom: 2, faction: SCARLET },
      { key: 'karateGuy', weight: 3, tier: 'weak', faction: DOJO },
      { key: 'kongFuChicken', weight: 2, tier: 'weak', faction: DOJO },
      { key: 'speedyGuy', weight: 2, tier: 'mid', faction: DOJO },
      { key: 'shurikenNinja', weight: 1.5, tier: 'weak', faction: NINJAS },
      { key: 'ninja', weight: 1.5, tier: 'mid', faction: NINJAS },
      { key: 'bombMage', weight: 2, tier: 'weak', faction: MAGES },
      { key: 'thunderMonk', weight: 2, tier: 'weak', faction: MAGES },
      { key: 'shrouder', weight: 2, tier: 'mid', faction: MAGES },
    ],
    dwellings: [
      { key: 'dojo', weight: 1, tier: 'weak', faction: DOJO },
      { key: 'magicPortal', weight: 1, tier: 'weak', faction: MAGES },
      { key: 'mysteriousCloud', weight: 1, tier: 'mid', maxPerRoom: 1, faction: NINJAS },
    ],
    bosses: [
      { label: "Scarlet's throne", units: { scarletInGame: 1, scWarrior: 2, scArcher: 2, lavaGolem: 1 }, faction: SCARLET, boss: 'scarletInGame' },
      { label: 'dojo masters', units: { speedyGuy: 3, karateGuy: 2, dojo: 1 }, faction: DOJO, boss: 'speedyGuy' },
      { label: 'court mages', units: { shrouder: 2, bombMage: 2, thunderMonk: 2, magicPortal: 1 }, faction: MAGES, boss: 'shrouder' },
    ],
    potions: [w('manaCapacity', 3), w('manaBurst', 3), w('manaFlow', 2), w('walkSpeed', 1)],
    startRewards: startRewards(
      spellWeights([w('energyBeamSpell', 2), w('energyPunch', 2), w('monsterSummon', 2), w('cBlast', 1), w('armySummon', 1), w('longbow', 1), w('bombVolley', 1), w('thunderBurst', 1), w('pinStorm', 1), w('poisonSmoke', 1), w('shurikenFan', 1), w('lavaLob', 1)], BIOME_OBJECTS)
    ),
  },
}

/** The roguelite run's own biomes (not generated maps of their own), one per floor from the bottom. */
export const ROGUELITE_THEMES: readonly FloorTheme[] = [DEEP_FOREST, HYDRA_MARSH, GOLEM_MOUNTAIN, GOLDEN_PALACE]
