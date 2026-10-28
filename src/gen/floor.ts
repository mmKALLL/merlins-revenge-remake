// The random floor generator (docs/plans/2026-09-28-random-floor-design.md): a floor of rooms
// as a plain MapDefinition. Edges between rooms are decided once for both rooms (a random spanning
// tree is always open), each room is laid out to connect its openings, and units are placed by the
// theme's room plan, drawing by tier from its tables. The result is checked with a flood fill over the whole floor.
import type { Vec } from '../mr-open/mr-geometry'
import { roomXYToNum, type LayerName, type LocationSign, type MapDefinition, type RoomDefinition, type TileGrid } from '../mr-open/mr-map-format'
import type { Edge } from '../mr-open/mr-screen-exits'
import { GenRandom } from './random'
import { Cell, floodOpen } from './grid'
import { signSpot, signTiles } from './location-sign'
import { decorate, generateRoomShape, patchComponents, type Opening, type RoomEdges, type RoomShape } from './room-shape'
import { runSteps, type Steps } from './steps'
import { autotileChoices, isWallCell, wallNeighbours } from './wall-autotile'
import { TIERS, type Alliance, type Corner, type RivalPair, type DrawSpec, type EnemyChoice, type FloorTheme, type HpBudget, type RoomPlan, type RoomPlanCell, type TierDraw, type BossGroup, type UnitGroup, type UnitTuning, type Weighted } from './themes'

export const ROOM_SIZE: Vec = { x: 18, y: 9 }
/** Engine rooms count y down: the start is the bottom-left corner, the exit the top-right one. */
export const startRoom = (floorSize: Vec): Vec => ({ x: 1, y: floorSize.y })
export const exitRoom = (floorSize: Vec): Vec => ({ x: floorSize.x, y: 1 })

const sameVec = (a: Vec, b: Vec): boolean => a.x === b.x && a.y === b.y

/** The sketch's corner names (it counts y up from the start) as engine rooms. */
export function cornerRoom(floorSize: Vec, corner: Corner): Vec {
  switch (corner) {
    case 'exit': return exitRoom(floorSize)
    case 'farX': return { x: floorSize.x, y: floorSize.y }
    case 'farY': return { x: 1, y: 1 }
  }
}
/** Units keep this many tiles from every room edge. */
const UNIT_EDGE_MARGIN = 2
/** The boss stands this many tiles in from the floor's far corner (the exit room's top-right corner). */
const BOSS_CORNER_INSET = 2
/** The exit room tile for the boss, kept open and reachable when the room is laid out. */
export const BOSS_TILE: Vec = { x: ROOM_SIZE.x - 1 - BOSS_CORNER_INSET, y: BOSS_CORNER_INSET }
/** The side corner rooms' potions stand this many tiles in from the floor's outer corner, out of reach on entering. */
const POTION_CORNER_INSET = 2
/** Potions per side corner room, side by side along the floor's outer edge. */
const POTIONS_PER_CORNER = 2
const SIDE_CORNERS = ['farX', 'farY'] as const

/**
 * The potion tiles of a side corner room (none elsewhere): next to the floor's outer corner in
 * that room, POTION_CORNER_INSET tiles in, the next ones stepping along x away from the corner.
 */
export function potionTiles(floorSize: Vec, room: Vec): Vec[] {
  const isSideCorner = SIDE_CORNERS.some((c) => sameVec(cornerRoom(floorSize, c), room))
  if (!isSideCorner || sameVec(room, startRoom(floorSize)) || sameVec(room, exitRoom(floorSize))) return []
  const atRight = room.x === floorSize.x
  const atBottom = room.y === floorSize.y
  const x = atRight ? ROOM_SIZE.x - 1 - POTION_CORNER_INSET : POTION_CORNER_INSET
  const y = atBottom ? ROOM_SIZE.y - 1 - POTION_CORNER_INSET : POTION_CORNER_INSET
  const away = atRight ? -1 : 1
  return Array.from({ length: POTIONS_PER_CORNER }, (_, i) => ({ x: x + away * i, y }))
}

/** Tiles a room keeps open and reachable for its fixed placements: the boss's, or the corner potions'. */
const reservedTiles = (floorSize: Vec, room: Vec): Vec[] => (sameVec(room, exitRoom(floorSize)) ? [BOSS_TILE] : potionTiles(floorSize, room))
/** Whole-floor attempts (each from a derived seed) before giving up. */
const FLOOR_ATTEMPTS = 8
const RETRY_SEED_STEP = 0x9e3779b9

/** A unit's starting energy (ActorDef.energy, tuning applied), or what it counts towards an HP budget. */
export type EnergyOf = (key: string) => number

/**
 * What the generator knows of the units from the actor data (tuning applied): its one input
 * besides the theme and seed, so the same seed and actor data always give the same floor.
 */
export interface UnitFacts {
  energyOf: EnergyOf
  /** whether the unit's installed attack is a melee one (ActorDef.attack.type) */
  isMelee: (key: string) => boolean
}

/** The unit facts over resolved actor definitions; each lookup throws for a key without one. */
export function unitFacts(defs: Readonly<Record<string, { energy: number; attack: { type: string } }>>): UnitFacts {
  const defOf = (key: string) => {
    const def = defs[key]
    if (!def) throw new Error(`random floor: no actor definition for "${key}" (its energy and attack decide how it is drawn)`)
    return def
  }
  return { energyOf: (key) => defOf(key).energy, isMelee: (key) => defOf(key).attack.type === 'melee' }
}

/**
 * Owner (2026-10-28): melee units are easy prey for projectiles when they charge, so rooms of
 * them come in larger numbers: a room's draws count a melee unit (not a producer) as this share
 * of a unit, in fixed counts (drawToSlots) and in HP budgets alike. 1 = every unit counts the same.
 */
export const MELEE_UNIT_SHARE = 0.75

/** How much of a unit a key counts as when a room draws it (MELEE_UNIT_SHARE). */
export const unitShare = (facts: UnitFacts, producers: ReadonlySet<string>) => (key: string): number =>
  !producers.has(key) && facts.isMelee(key) ? MELEE_UNIT_SHARE : 1

/** A placed unit: an objects-layer key at a room tile (0-based). */
export interface Placement {
  key: string
  room: Vec
  tile: Vec
  /** in a brawl room, which of its two rival factions (UnitTuning.rivals) the unit fights for */
  side?: Side
}

/** An opening on the floor's boundary, into a neighbouring floor (the tower's stairs). */
export interface BoundaryOpening { room: Vec; edge: Edge; opening: Opening }

export interface FloorOptions {
  /** false for the tower's later floors: their start room only plays the start music */
  placePlayer?: boolean
  boundaryOpenings?: readonly BoundaryOpening[]
  /** the start room's spell scroll; drawn from the theme's list when unset */
  spellScroll?: string
  /**
   * Remake (roguelite floors): no unit or dwelling within this many tiles (taxicab) of where Merlin
   * appears. The start room is then laid out first, so the other rooms know his tile.
   */
  safeArrivalTiles?: number
  /** Remake (roguelite floors): the theme's location sign stands in the start room (location-sign.ts) */
  locationSign?: boolean
  /**
   * Remake (roguelite floors): the start room holds these pickups (object keys) instead of the
   * theme's start rewards, laid out in front of Merlin (startPickupTiles)
   */
  startPickups?: readonly string[]
}

export interface GeneratedFloor {
  map: MapDefinition
  /** per room key "x,y": its openings */
  edges: Record<string, RoomEdges>
  placements: Placement[]
}

export const roomKey = (r: Vec): string => `${r.x},${r.y}`

/** A seed for the next attempt after `attempt` failed ones. */
export const retrySeed = (seed: number, attempt: number): number => (seed + attempt * RETRY_SEED_STEP) >>> 0

/** A seeded floor for a theme; the same theme, seed, actor energies and options always give the same floor. */
export function generateFloor(theme: FloorTheme, seed: number, facts: UnitFacts, options: FloorOptions = {}): GeneratedFloor {
  return runSteps(floorSteps(theme, seed, facts, options))
}

/** generateFloor in steps: yields its progress after each room (a retry starts the count again). */
export function* floorSteps(theme: FloorTheme, seed: number, facts: UnitFacts, options: FloorOptions = {}): Steps<GeneratedFloor> {
  checkRoomPlan(theme)
  for (let attempt = 0; attempt < FLOOR_ATTEMPTS; attempt++) {
    const floor = yield* buildFloor(theme, retrySeed(seed, attempt), facts, options)
    if (floorIsConnected(floor, themeIsSolid(theme)) && hasAskedSign(floor, options)) return floor
  }
  throw new Error(`random floor ${theme.id}: no connected floor${options.locationSign ? ' with its sign' : ''} for seed ${seed} after ${FLOOR_ATTEMPTS} attempts`)
}

/** A start room without a spot for the asked-for location sign fails the attempt, as a broken floor does. */
const hasAskedSign = (floor: GeneratedFloor, options: FloorOptions): boolean =>
  !options.locationSign || floor.map.locationSign !== undefined

function* buildFloor(theme: FloorTheme, seed: number, facts: UnitFacts, options: FloorOptions): Steps<GeneratedFloor> {
  const rng = new GenRandom(seed)
  const size = theme.floorSize
  const edges = decideEdges(rng, theme)
  for (const b of options.boundaryOpenings ?? []) edges[roomKey(b.room)]![b.edge] = b.opening
  const rooms: RoomDefinition[] = []
  const placements: Placement[] = []
  const takenLeaders = new Set<string>()
  const start = startRoom(size)
  let arrival: Vec | null = null
  let locationSign: LocationSign | undefined
  for (const room of roomOrder(size, options.safeArrivalTiles !== undefined)) {
    const keepOpen = reservedTiles(size, room)
    const roomEdges = edges[roomKey(room)]!
    const shape = generateRoomShape(rng, ROOM_SIZE, roomEdges, theme.shape, theme.edges.openingDepth, keepOpen)
    decorate(rng, shape, theme.shape.decorationChance)
    const units = placeUnits(rng, theme, room, shape, roomEdges, facts, options, takenLeaders, safeFromArrival(room, arrival, options.safeArrivalTiles))
    placements.push(...units)
    const def = roomDefinition(rng, theme, room, shape, units)
    if (sameVec(room, start) && (options.safeArrivalTiles !== undefined || options.locationSign)) {
      const tile = arrivalTile(room, options, units.find((p) => p.key === theme.units.player)?.tile)
      arrival = worldTileOf(room, tile)
      if (options.locationSign) locationSign = standSign(theme, room, def, shape, roomEdges, units, tile)
    }
    rooms.push(def)
    yield rooms.length / (size.x * size.y)
  }
  rooms.sort((a, b) => a.num - b.num)
  const map: MapDefinition = {
    mapSize: size,
    roomSize: ROOM_SIZE,
    startRoom: start,
    endRoom: exitRoom(size),
    layers: (['backgroundPassive', 'backgroundActive', 'objects'] as const).map((name) => ({ name, tileSet: theme.tileSets[name] })),
    rooms,
    ...(locationSign ? { locationSign } : {}),
  }
  return { map, edges, placements }
}

/** Every room row by row from the top; with `startFirst`, the start room comes first. */
function roomOrder(size: Vec, startFirst: boolean): Vec[] {
  const rooms: Vec[] = []
  for (let y = 1; y <= size.y; y++) for (let x = 1; x <= size.x; x++) rooms.push({ x, y })
  if (!startFirst) return rooms
  const start = startRoom(size)
  return [start, ...rooms.filter((r) => !sameVec(r, start))]
}

const taxicab = (a: Vec, b: Vec): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y)

/** Remake (safe arrival): whether a room tile may take a unit, kept more than `tiles` from Merlin's arrival. */
function safeFromArrival(room: Vec, arrival: Vec | null, tiles: number | undefined): (tile: Vec) => boolean {
  if (arrival === null || tiles === undefined) return () => true
  return (tile) => taxicab(worldTileOf(room, tile), arrival) > tiles
}

/**
 * Remake (roguelite floors): the theme's location sign laid on the room's active layer at its spot
 * (signSpot); none when the room has no spot for it.
 */
function standSign(theme: FloorTheme, room: Vec, def: RoomDefinition, shape: RoomShape, edges: RoomEdges, units: readonly Placement[], arrival: Vec): LocationSign | undefined {
  const sign = theme.locationSign
  if (!sign) throw new Error(`theme ${theme.id}: no location sign`)
  if (sign.tileSet !== theme.tileSets.backgroundActive) throw new Error(`theme ${theme.id}: its sign is in ${sign.tileSet}, not its active tileset ${theme.tileSets.backgroundActive}`)
  const width = sign.tiles.length
  const tile = signSpot(shape, edges, units.map((p) => p.tile), arrival, width)
  if (!tile) return undefined
  const spot = { room, tile, width }
  signTiles(spot).forEach((t, i) => { def.layers.backgroundActive![t.y]![t.x] = sign.tiles[i]! })
  return spot
}

// ---- edges ----

interface SharedEdge { a: Vec; b: Vec; vertical: boolean }

/** Every edge between neighbouring rooms; vertical edges join a room to the one on its right. */
function sharedEdges(size: Vec): SharedEdge[] {
  const out: SharedEdge[] = []
  for (let y = 1; y <= size.y; y++) {
    for (let x = 1; x <= size.x; x++) {
      if (x < size.x) out.push({ a: { x, y }, b: { x: x + 1, y }, vertical: true })
      if (y < size.y) out.push({ a: { x, y }, b: { x, y: y + 1 }, vertical: false })
    }
  }
  return out
}

/** An opening of a width in `[lo, hi]` along an edge `length` tiles long, off the corner tiles. */
export function randomOpening(rng: GenRandom, length: number, [lo, hi]: readonly [number, number]): Opening {
  const width = rng.int(lo, hi)
  const from = rng.int(1, length - 1 - width)
  return { from, to: from + width - 1 }
}

/** Opens a random spanning tree (Kruskal) plus extra edges by chance; gives each open edge its opening. */
function decideEdges(rng: GenRandom, theme: FloorTheme): Record<string, RoomEdges> {
  const size = theme.floorSize
  const edges: Record<string, RoomEdges> = {}
  for (let y = 1; y <= size.y; y++) {
    for (let x = 1; x <= size.x; x++) edges[roomKey({ x, y })] = { left: null, top: null, right: null, bottom: null }
  }
  const parent = new Map<string, string>()
  const find = (k: string): string => {
    const p = parent.get(k) ?? k
    if (p === k) return k
    const root = find(p)
    parent.set(k, root)
    return root
  }
  for (const e of rng.shuffle(sharedEdges(size))) {
    const ra = find(roomKey(e.a))
    const rb = find(roomKey(e.b))
    const inTree = ra !== rb
    if (inTree) parent.set(ra, rb)
    if (!inTree && !rng.chance(theme.edges.extraOpenChance)) continue
    const opening = randomOpening(rng, e.vertical ? ROOM_SIZE.y : ROOM_SIZE.x, e.vertical ? theme.edges.sideOpening : theme.edges.endOpening)
    const [sideA, sideB]: [Edge, Edge] = e.vertical ? ['right', 'left'] : ['bottom', 'top']
    edges[roomKey(e.a)]![sideA] = opening
    edges[roomKey(e.b)]![sideB] = opening
  }
  return edges
}

// ---- units ----

/** The plan's cell for a room: the plan's first row is engine row 1, as on screen. */
export function planCell(plan: RoomPlan, room: Vec): RoomPlanCell {
  const cell = plan[room.y - 1]?.[room.x - 1]
  if (!cell) throw new Error(`room plan: no cell for room ${roomKey(room)}`)
  return cell
}

/** Throws unless the plan covers the floor with the start, boss and midboss cells where they belong. */
export function checkRoomPlan(theme: FloorTheme): void {
  const { roomPlan: plan } = theme.units
  const size = theme.floorSize
  const fail = (why: string) => { throw new Error(`theme ${theme.id}: room plan ${why}`) }
  if (plan.length !== size.y || plan.some((row) => row.length !== size.x)) fail(`is not ${size.x}x${size.y}`)
  const sideCorners = SIDE_CORNERS.map((c) => cornerRoom(size, c))
  plan.forEach((row, r) => row.forEach((cell, c) => {
    const room = { x: c + 1, y: r + 1 }
    if ((cell.kind === 'start') !== sameVec(room, startRoom(size))) fail(`has its start cell off the start room (${roomKey(room)})`)
    if ((cell.kind === 'boss') !== sameVec(room, exitRoom(size))) fail(`has its boss cell off the exit room (${roomKey(room)})`)
    if (cell.kind === 'midboss' && !sideCorners.some((s) => sameVec(s, room))) fail(`has a midboss off the side corners (${roomKey(room)})`)
    if (cell.kind === 'midboss' && !cell.groups?.length) fail(`has a midboss without groups (${roomKey(room)})`)
  }))
}

/** Reachable open tiles away from the edges, in random order. */
function unitTiles(rng: GenRandom, shape: RoomShape): Vec[] {
  const out: Vec[] = []
  for (let y = UNIT_EDGE_MARGIN; y < shape.size.y - UNIT_EDGE_MARGIN; y++) {
    for (let x = UNIT_EDGE_MARGIN; x < shape.size.x - UNIT_EDGE_MARGIN; x++) {
      const i = y * shape.size.x + x
      if (shape.cells[i] === Cell.Open && shape.reachable[i]) out.push({ x, y })
    }
  }
  return rng.shuffle(out)
}

/** One of a room's draws: the table it draws from and what the plan asks of it (null: nothing). */
interface TableDraw { table: readonly EnemyChoice[]; draw: TierDraw | null }

const resolveDraw = (rng: GenRandom, spec: DrawSpec | undefined): TierDraw | null =>
  spec === undefined ? null : Array.isArray(spec) ? rng.weighted(spec) : spec

/** The cell's producer, regular and mixed draws, or by the wildcard chance another normal cell's. */
function roomDraws(rng: GenRandom, theme: FloorTheme, cell: RoomPlanCell): TableDraw[] {
  const u = theme.units
  let source = cell
  if (cell.kind === 'normal' && rng.chance(u.wildcardChance)) {
    const others = u.roomPlan.flat().filter((c) => c.kind === 'normal' && c !== cell)
    if (others.length > 0) source = rng.pick(others)
  }
  const regulars = u.enemies.filter((c) => !c.producer)
  return [
    { table: [...u.dwellings, ...u.enemies.filter((c) => c.producer)], draw: resolveDraw(rng, source.producers) },
    { table: regulars, draw: resolveDraw(rng, source.regulars) },
    { table: regulars, draw: resolveDraw(rng, source.extras) },
    { table: [...u.dwellings, ...u.enemies], draw: resolveDraw(rng, source.mixed) },
  ]
}

/** The factions a room takes choices of, besides the factionless ones (null: any). */
type RoomFactions = ReadonlySet<string> | null

const inFactions = (c: EnemyChoice, factions: RoomFactions): boolean => c.faction === undefined || factions === null || factions.has(c.faction)

/** Which choices a draw may take. */
type Admits = (c: EnemyChoice) => boolean
/** A room of one faction (or alliance): its factions' choices and the factionless ones, never a brawl-only one. */
const ofFactions = (factions: RoomFactions): Admits => (c) => !c.brawlOnly && inFactions(c, factions)
/** One side of a brawl: that faction's choices only, brawl-only ones included. */
const ofSide = (faction: string): Admits => (c) => c.faction === faction

/** The choices a draw can take. */
const choicesFor = ({ table, draw }: TableDraw, admits: Admits): EnemyChoice[] =>
  draw ? table.filter((c) => admits(c) && (draw.tiers[c.tier] ?? 0) > 0) : []

/** Whether the choices fill every draw that asks for at least one unit. */
const fillsDraws = (draws: readonly TableDraw[], admits: Admits): boolean =>
  draws.every((d) => !d.draw || d.draw.count[0] === 0 || choicesFor(d, admits).length > 0)

/** A room's factions: its group's, or one drawn for it; with alliances, one alliance's. */
function roomFactions(rng: GenRandom, u: UnitTuning, draws: readonly TableDraw[], group: UnitGroup | null): RoomFactions {
  if (u.alliances) return pickAlliance(rng, u, u.alliances, draws, group)
  if (group?.faction) return new Set([group.faction, ...(group.allies ?? [])])
  const faction = pickFaction(rng, draws)
  return faction === null ? null : new Set([faction])
}

/**
 * One faction for the room, weighted by its own choices the room's draws can take, among the
 * factions with choices for every draw that asks for at least one unit (all factions should none
 * have). Null when no faction's choice fits the draws, so they only take factionless choices.
 */
function pickFaction(rng: GenRandom, draws: readonly TableDraw[]): string | null {
  const factions = new Set(draws.flatMap((d) => choicesFor(d, ofFactions(null))).flatMap((c) => (c.faction ? [c.faction] : [])))
  const only = (f: string) => ofFactions(new Set([f]))
  const weightOf = (f: string) => draws.flatMap((d) => choicesFor(d, only(f))).filter((c) => c.faction === f).reduce((s, c) => s + c.weight, 0)
  const all = [...factions].map((value) => ({ value, weight: weightOf(value) }))
  const filling = all.filter((o) => fillsDraws(draws, only(o.value)))
  const options = filling.length > 0 ? filling : all
  return options.length > 0 ? rng.weighted(options) : null
}

/** A brawl room's two rival factions (sides 0 and 1); side 0 is its group's faction when it has a group. */
type Brawl = RivalPair
/** A brawl side. */
type Side = 0 | 1

/**
 * Owner: a normal room now and then (`mixedFactionChance`, its own roll beside the wildcard's) is a
 * brawl of two rival factions (`rivals`): a pair at random among those whose factions both have
 * choices for some draw of the room, with its group's faction when it has a group (a group without
 * a faction keeps its room out of brawls). Never a midboss, boss or alliance room; with no such
 * pair, the room is a normal one.
 */
function rollBrawl(rng: GenRandom, u: UnitTuning, cell: RoomPlanCell, draws: readonly TableDraw[], group: UnitGroup | null): Brawl | null {
  if (cell.kind !== 'normal' || u.alliances || !rng.chance(u.mixedFactionChance)) return null
  if (group && !group.faction) return null
  const drawsFor = (f: string) => draws.some((d) => d.draw && d.draw.count[1] > 0 && choicesFor(d, ofSide(f)).length > 0)
  const withGroupFirst = ([a, b]: Brawl): Brawl[] => (!group ? [[a, b]] : a === group.faction ? [[a, b]] : b === group.faction ? [[b, a]] : [])
  const pairs = (u.rivals ?? []).flatMap(withGroupFirst).filter((pair) => pair.every(drawsFor))
  return pairs.length > 0 ? rng.pick(pairs) : null
}

/** The factions a group needs in its room: its own, and those of its units in the theme's tables. */
function groupFactions(u: UnitTuning, group: UnitGroup | null): string[] {
  if (!group) return []
  const choices = [...u.enemies, ...u.dwellings]
  const ofUnits = Object.keys(group.units).flatMap((key) => choices.find((c) => c.key === key)?.faction ?? [])
  return [...(group.faction ? [group.faction] : []), ...ofUnits]
}

/**
 * One alliance for the room by weight, among those holding every faction its group needs, and of
 * those, the ones with choices for every draw that asks for at least one unit.
 */
function pickAlliance(rng: GenRandom, u: UnitTuning, alliances: readonly Alliance[], draws: readonly TableDraw[], group: UnitGroup | null): RoomFactions {
  const needed = groupFactions(u, group)
  const holding = alliances.filter((a) => needed.every((f) => a.factions.includes(f)))
  if (holding.length === 0) throw new Error(`no alliance holds the factions of "${group?.label}" (${needed.join(', ')})`)
  const filling = holding.filter((a) => fillsDraws(draws, ofFactions(new Set(a.factions))))
  const options = filling.length > 0 ? filling : holding
  return new Set(rng.weighted(options.map((a) => ({ value: a, weight: a.weight }))).factions)
}

/**
 * Owner: a room with many enemies should mix a few kinds, so each copy of a kind already in the room
 * divides that kind's weight by one more (1, 1/2, 1/3, ...). Boss rooms draw without it.
 */
const varietyWeight = (c: EnemyChoice, counts: ReadonlyMap<string, number>, variety: boolean): number =>
  variety ? c.weight / (1 + (counts.get(c.key) ?? 0)) : c.weight

/**
 * One unit for a draw: a tier by the draw's weights among those still open (and that `fits`), then
 * a choice by weight.
 */
function pickUnit(rng: GenRandom, d: TableDraw, admits: Admits, counts: Map<string, number>, variety: boolean, fits: (key: string) => boolean): string | null {
  const open = choicesFor(d, admits).filter((c) => (counts.get(c.key) ?? 0) < (c.maxPerRoom ?? Infinity) && fits(c.key))
  if (open.length === 0) return null
  const tiers = TIERS.filter((t) => open.some((c) => c.tier === t)).map((t) => ({ value: t, weight: d.draw!.tiers[t]! }))
  const tier = rng.weighted(tiers)
  return rng.weighted(open.filter((c) => c.tier === tier).map((c) => ({ value: c.key, weight: varietyWeight(c, counts, variety) })))
}

/** The least energy a budget allows on a floor of this level (a room may draw up to `spread` more). */
export const budgetEnergy = (budget: HpBudget, level: number): number => budget.base + budget.perLevel * level

/** The most energy a budget allows on a floor of this level. */
const budgetCeiling = (budget: HpBudget, level: number): number => budgetEnergy(budget, level) + (budget.spread ?? 0)

/** One room's budget: the least, plus a uniform draw up to the budget's spread. */
const roomBudget = (rng: GenRandom, budget: HpBudget, level: number): number =>
  budgetEnergy(budget, level) + (budget.spread ? rng.int(0, budget.spread) : 0)

/** What a unit counts towards a budget: its energy, or by the budget's producer rule for a producer. */
export function budgetCost(budget: HpBudget, producers: ReadonlySet<string>, energyOf: EnergyOf): EnergyOf {
  const rule = budget.producers
  return (key) => (rule && producers.has(key) ? Math.max(energyOf(key), rule.least) * rule.factor : energyOf(key))
}

/** A theme's producers: its dwellings and summoners. */
export const producerKeys = (u: UnitTuning): ReadonlySet<string> => new Set([...u.dwellings, ...u.enemies.filter((c) => c.producer)].map((c) => c.key))

/** What a room holds before a budget draw: its group's units. */
export interface BudgetStart { units: number; energy: number }

/**
 * The units of a budget draw, each taken by `next` (null: nothing left to take), while the room,
 * `start` included, has fewer than `count[0]` units or less than `energy` in all, never past `count[1]`.
 * `next` is told how much the room may still take before it passes `ceiling`.
 */
export function drawToBudget(count: readonly [number, number], energy: number, start: BudgetStart, next: (allowance: number) => string | null, costOf: EnergyOf, ceiling = Infinity): string[] {
  const [least, most] = count
  const out: string[] = []
  let units = start.units
  let total = start.energy
  while (units < most && (units < least || total < energy)) {
    const key = next(ceiling - total)
    if (!key) break
    out.push(key)
    units++
    total += costOf(key)
  }
  return out
}

/**
 * The units of a fixed-count draw of `slots` unit slots, each proposed by `next` (null: nothing
 * left to take) and then taken by `take`, a unit filling `shareOf(unit)` of a slot. A unit that
 * would overfill the slots is taken by the chance that the share still free is of its own
 * (`keepPart`), so a draw of units of share s gives slots / s units on average.
 */
export function drawToSlots<T>(slots: number, next: () => T | null, shareOf: (unit: T) => number, keepPart: (fraction: number) => boolean, take: (unit: T) => void): T[] {
  const out: T[] = []
  let filled = 0
  while (slots - filled > SLOT_EPSILON) {
    const unit = next()
    if (unit === null) break
    const share = shareOf(unit)
    const free = slots - filled
    if (share - free > SLOT_EPSILON && !keepPart(free / share)) break
    take(unit)
    out.push(unit)
    filled += share
  }
  return out
}

/** Rounding slack when summing unit shares. */
const SLOT_EPSILON = 1e-9

/** A group's units and what they count, for the budget of the room it leads. */
function groupStart(group: UnitGroup | null, costOf: EnergyOf): BudgetStart {
  const units = Object.entries(group?.units ?? {})
  return {
    units: units.reduce((sum, [, n]) => sum + n, 0),
    energy: units.reduce((sum, [key, n]) => sum + n * costOf(key), 0),
  }
}

// ---- the start room ----

/** Start rewards keep at least this many tiles (along x or y) from Merlin's start or arrival tile. */
const REWARD_MIN_DISTANCE = 2
const MEDIKIT = 'medikit'

/** The floor-start rewards, in the order they take the tiles nearest Merlin. */
export function startRewardKeys(rng: GenRandom, theme: FloorTheme, spellScroll?: string): string[] {
  const r = theme.units.startRewards
  return [
    ...Array.from({ length: r.potionCount }, () => rng.weighted(r.potions)),
    ...Array.from({ length: r.medikits }, () => MEDIKIT),
    spellScroll ?? rng.weighted(r.spellScrolls),
    ...r.extras,
  ]
}

const byDistanceTo = (to: Vec) => (a: Vec, b: Vec): number => Math.hypot(a.x - to.x, a.y - to.y) - Math.hypot(b.x - to.x, b.y - to.y)

/**
 * Where Merlin comes into the start room: the player's tile, or on the tower's later floors the
 * inside end of the stair from below (the middle of the room's bottom boundary opening).
 */
function arrivalTile(room: Vec, options: FloorOptions, playerTile: Vec | undefined): Vec {
  if (playerTile) return playerTile
  const stair = options.boundaryOpenings?.find((b) => sameVec(b.room, room) && b.edge === 'bottom')
  if (!stair) throw new Error('a start room without the player needs a stair from below')
  return { x: (stair.opening.from + stair.opening.to) / 2, y: ROOM_SIZE.y - 1 }
}

/** Remake (roguelite floors): the start pickups stand this many rows in front of (below) Merlin, then in the row between. */
const PICKUP_ROWS_AHEAD = 2
/** ...and at most this many tiles to either side of him while those rows have room. */
const PICKUP_ROW_REACH = 2
/** A doorway: an opening's band (inOpeningBand) within this many tiles of its edge. */
const DOORWAY_DEPTH = 4

/** Whether a room tile is in a doorway: the band of an opening, near the opening's edge. */
export function inDoorway(edges: RoomEdges, t: Vec): boolean {
  const within = (o: Opening | null, v: number) => o !== null && v >= o.from && v <= o.to
  return (within(edges.top, t.x) && t.y < DOORWAY_DEPTH)
    || (within(edges.bottom, t.x) && t.y >= ROOM_SIZE.y - DOORWAY_DEPTH)
    || (within(edges.left, t.y) && t.x < DOORWAY_DEPTH)
    || (within(edges.right, t.y) && t.x >= ROOM_SIZE.x - DOORWAY_DEPTH)
}

/**
 * Remake (roguelite floors): the start pickups' tiles, in the order they are laid: the free tiles of
 * the row PICKUP_ROWS_AHEAD below Merlin from the middle outwards (left first), then the row
 * between, within PICKUP_ROW_REACH tiles to either side; past those, the free tiles nearest him.
 * Doorways come last, so a pickup stands in one only when the room has no other free tile; the
 * sign stands above Merlin, clear of them.
 */
export function startPickupTiles(free: readonly Vec[], arrival: Vec, edges: RoomEdges): Vec[] {
  const inFront = (t: Vec) => t.y > arrival.y && t.y - arrival.y <= PICKUP_ROWS_AHEAD && Math.abs(t.x - arrival.x) <= PICKUP_ROW_REACH
  const distance = (t: Vec) => Math.hypot(t.x - arrival.x, t.y - arrival.y)
  const sideways = (t: Vec) => Math.abs(t.x - arrival.x)
  const byLayout = (a: Vec, b: Vec): number =>
    Number(inDoorway(edges, a)) - Number(inDoorway(edges, b))
    || Number(!inFront(a)) - Number(!inFront(b))
    || (inFront(a) ? b.y - a.y : distance(a) - distance(b))
    || sideways(a) - sideways(b)
    || a.x - b.x
  return [...free].sort(byLayout)
}

/**
 * The start room: the player (unless the floor is not the first in the tower) and the start music
 * on the tiles nearest the room's centre, then the rewards on the free tiles nearest where Merlin
 * starts or arrives, at least REWARD_MIN_DISTANCE away from it; on a roguelite floor its start
 * pickups instead, in front of him.
 */
function placeStartRoom(rng: GenRandom, theme: FloorTheme, room: Vec, tiles: Vec[], edges: RoomEdges, options: FloorOptions): Placement[] {
  const u = theme.units
  const centre = { x: (ROOM_SIZE.x - 1) / 2, y: (ROOM_SIZE.y - 1) / 2 }
  const free = [...tiles].sort(byDistanceTo(centre))
  const take = (key: string, tile: Vec): Placement => {
    free.splice(free.indexOf(tile), 1)
    return { key, room, tile }
  }
  const player = (options.placePlayer ?? true) ? take(u.player, free[0]!) : undefined
  const music = take(u.startMusic, free[0]!)
  const arrival = arrivalTile(room, options, player?.tile)
  const farEnough = (t: Vec) => Math.max(Math.abs(t.x - arrival.x), Math.abs(t.y - arrival.y)) >= REWARD_MIN_DISTANCE
  const keys = options.startPickups ?? startRewardKeys(rng, theme, options.spellScroll)
  const rewardTiles = options.startPickups ? startPickupTiles(free, arrival, edges) : free.filter(farEnough).sort(byDistanceTo(arrival))
  const rewards = keys.slice(0, rewardTiles.length).map((key, i) => ({ key, room, tile: rewardTiles[i]! }))
  return [...(player ? [player] : []), music, ...rewards]
}

/** A group's leader: a boss group's boss, or its `lead`. */
const leaderOf = (g: UnitGroup | BossGroup): string | undefined => ('boss' in g ? g.boss : g.lead)

/**
 * One of a room's groups, at random among those whose leader no other room of the floor has
 * taken (all of them when every leader is taken); its leader is then taken.
 */
function pickGroup<G extends UnitGroup>(rng: GenRandom, groups: readonly G[], takenLeaders: Set<string>): G {
  const fresh = groups.filter((g) => !takenLeaders.has(leaderOf(g) ?? ''))
  const group = rng.pick(fresh.length > 0 ? fresh : groups)
  const leader = leaderOf(group)
  if (leader) takenLeaders.add(leader)
  return group
}

/** A unit drawn for a room: its key and its brawl side (0 outside brawls). */
interface Drawn { key: string; side: Side }

/** A budget cost scaled by each unit's share (MELEE_UNIT_SHARE), so a melee unit takes less of an HP budget too. */
const sharedCost = (costOf: EnergyOf, shareOf: (key: string) => number): EnergyOf => (key) => costOf(key) * shareOf(key)

/**
 * A room's units by its plan cell: the start room's own placements, or the corner potions, the
 * boss (exit room) or one of the cell's groups, then unless that group is `alone` the cell's
 * producers, regulars and mixed units (a budget draw counting the group in), all of the room's
 * one faction or alliance; in a brawl, each unit for the side with fewer so far by unit shares (the group's
 * units on side 0), or the other side when it has nothing for the draw.
 */
function placeUnits(rng: GenRandom, theme: FloorTheme, room: Vec, shape: RoomShape, edges: RoomEdges, facts: UnitFacts, options: FloorOptions, takenLeaders: Set<string>, isSafe: (tile: Vec) => boolean): Placement[] {
  const u = theme.units
  const cell = planCell(u.roomPlan, room)
  const reserved = reservedTiles(theme.floorSize, room)
  const tiles = unitTiles(rng, shape).filter((t) => !reserved.some((r) => sameVec(r, t)) && isSafe(t))
  if (cell.kind === 'start') return placeStartRoom(rng, theme, room, tiles, edges, options)
  const units: Drawn[] = []
  const fixed: Placement[] = potionTiles(theme.floorSize, room).map((tile) => ({ key: rng.weighted(u.potions), room, tile }))
  const boss = cell.kind === 'boss' ? pickGroup(rng, u.bosses, takenLeaders) : null
  const group = boss ?? (cell.groups?.length ? pickGroup(rng, cell.groups, takenLeaders) : null)
  const draws = group?.alone ? [] : roomDraws(rng, theme, cell)
  const brawl = rollBrawl(rng, u, cell, draws, group)
  const sides: readonly Admits[] = brawl ? brawl.map(ofSide) : [ofFactions(roomFactions(rng, u, draws, group))]
  const counts = new Map<string, number>()
  const count = (key: string) => counts.set(key, (counts.get(key) ?? 0) + 1)
  const add = (key: string, side: Side) => {
    units.push({ key, side })
    count(key)
  }
  const shareOf = unitShare(facts, producerKeys(u))
  /** a side's units by their shares, so a side of melee units brawls in larger numbers too */
  const sideShare = (side: Side) => units.reduce((sum, p) => sum + (p.side === side ? shareOf(p.key) : 0), 0)
  const sideSize = (side: Side) => units.filter((p) => p.side === side).length
  if (boss) {
    fixed.push({ key: boss.boss, room, tile: BOSS_TILE })
    count(boss.boss)
  }
  for (const [key, n] of Object.entries(group?.units ?? {})) {
    for (let i = key === boss?.boss ? 1 : 0; i < n; i++) add(key, 0)
  }
  for (const d of draws) {
    const { draw } = d
    if (!draw) continue
    const costOf = draw.hpBudget ? sharedCost(budgetCost(draw.hpBudget, producerKeys(u), facts.energyOf), shareOf) : facts.energyOf
    const propose = (allowance = Infinity): Drawn | null => {
      const fits = (k: string) => allowance === Infinity || costOf(k) <= allowance
      const order: Side[] = sideShare(0) <= sideShare(1) ? [0, 1] : [1, 0]
      for (const side of order.filter((s) => s < sides.length)) {
        const key = pickUnit(rng, d, sides[side]!, counts, !boss, fits)
        if (key) return { key, side }
      }
      return null
    }
    const take = (unit: Drawn) => add(unit.key, unit.side)
    if (draw.hpBudget) {
      const b = draw.hpBudget
      const takeKey = (allowance: number) => {
        const unit = propose(allowance)
        if (unit) take(unit)
        return unit?.key ?? null
      }
      drawToBudget(draw.count, roomBudget(rng, b, theme.level), groupStart(group, costOf), takeKey, costOf, b.capped ? budgetCeiling(b, theme.level) : Infinity)
    } else {
      drawToSlots(rng.int(draw.count[0], draw.count[1]), propose, (unit) => shareOf(unit.key), (p) => rng.chance(p), take)
    }
  }
  const placed = units.slice(0, tiles.length)
  const isBrawl = brawl !== null && sideSize(0) > 0 && sideSize(1) > 0
  if (!isBrawl) return [...fixed, ...placed.map(({ key }, i) => ({ key, room, tile: tiles[i]! }))]
  const sideTiles = brawlTiles(rng, tiles, placed.map((p) => p.side))
  return [...fixed, ...placed.map(({ key, side }, i) => ({ key, room, tile: sideTiles[i]!, side }))]
}

/** Remake (brawl rooms): side 0 or 1 gathers around this share of the room's width, the other side around one minus it. */
const BRAWL_SIDE_AT = 0.25
/** ...taking the tiles nearest that point, each tile's distance blurred by up to this many tiles, so a side stands loosely grouped. */
const BRAWL_SPREAD = 3

/**
 * Remake (owner): a brawl's tiles, one per unit of the given sides: each side grouped around its
 * point on the room's long axis (BRAWL_SIDE_AT, the sides to the left and right at random), so
 * the two start on opposite sides but close enough to fight each other, not only Merlin.
 */
function brawlTiles(rng: GenRandom, tiles: readonly Vec[], sides: readonly Side[]): Vec[] {
  const leftSide = rng.int(0, 1)
  const centreOf = (side: Side): Vec => ({ x: (ROOM_SIZE.x - 1) * (side === leftSide ? BRAWL_SIDE_AT : 1 - BRAWL_SIDE_AT), y: (ROOM_SIZE.y - 1) / 2 })
  const byNearness = (side: Side): Vec[] => {
    const c = centreOf(side)
    return tiles.map((t) => ({ t, d: Math.hypot(t.x - c.x, t.y - c.y) + rng.next() * BRAWL_SPREAD })).sort((a, b) => a.d - b.d).map((o) => o.t)
  }
  const ranked = [byNearness(0), byNearness(1)]
  const taken = new Set<Vec>()
  return sides.map((side) => {
    const tile = ranked[side]!.find((t) => !taken.has(t))!
    taken.add(tile)
    return tile
  })
}

// ---- tiles ----

const pickTile = (rng: GenRandom, choices: readonly Weighted<number>[]): number => rng.weighted(choices)

function roomDefinition(rng: GenRandom, theme: FloorTheme, room: Vec, shape: RoomShape, units: readonly Placement[]): RoomDefinition {
  const { x: w, y: h } = shape.size
  const grid = (): TileGrid => Array.from({ length: h }, () => new Array<number>(w).fill(0))
  const passive = grid()
  const active = grid()
  const objects = grid()
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) passive[y]![x] = pickTile(rng, theme.ground)
  // each obstacle patch is one material: a copse of trees or a rock outcrop
  const patchTiles = new Map<number, readonly Weighted<number>[]>()
  for (const group of patchComponents(shape.cells, shape.size)) {
    const material = rng.weighted(theme.materials.map((m) => ({ value: m, weight: m.weight })))
    for (const i of group) patchTiles.set(i, material.tiles)
  }
  shape.cells.forEach((c, i) => {
    const x = i % w
    const y = (i - x) / w
    const choices = theme.wallAutotile && isWallCell(c) ? autotileChoices(theme.wallAutotile, wallNeighbours(shape.cells, shape.size, x, y))
      : c === Cell.Wall ? theme.wall
        : c === Cell.LongWall ? theme.longWall
          : c === Cell.Patch ? patchTiles.get(i)!
            : c === Cell.Stump ? theme.stumps
              : c === Cell.Decoration ? theme.decorations
                : null
    if (choices) active[y]![x] = pickTile(rng, choices)
  })
  for (const p of units) {
    const index = theme.objectTiles[p.key]
    if (index === undefined) throw new Error(`theme ${theme.id}: no objects tile for "${p.key}"`)
    objects[p.tile.y]![p.tile.x] = index
  }
  const layers: Record<LayerName, TileGrid> = { backgroundPassive: passive, backgroundActive: active, objects }
  return { num: roomXYToNum(room, theme.floorSize), layers }
}

// ---- whole-floor check ----

/** Solid cells of the whole floor, world tile index = wy * width + wx (0-based). */
export function floorCells(floor: GeneratedFloor, isSolid: (active: number) => boolean): { cells: Cell[]; size: Vec } {
  const floorSize = floor.map.mapSize
  const size = { x: floorSize.x * ROOM_SIZE.x, y: floorSize.y * ROOM_SIZE.y }
  const cells = new Array<Cell>(size.x * size.y).fill(Cell.Open)
  for (const room of floor.map.rooms) {
    const rx = (room.num - 1) % floorSize.x
    const ry = Math.floor((room.num - 1) / floorSize.x)
    const active = room.layers.backgroundActive!
    for (let y = 0; y < ROOM_SIZE.y; y++) {
      for (let x = 0; x < ROOM_SIZE.x; x++) {
        if (isSolid(active[y]![x]!)) cells[(ry * ROOM_SIZE.y + y) * size.x + rx * ROOM_SIZE.x + x] = Cell.Wall
      }
    }
  }
  return { cells, size }
}

/** A room tile (0-based) as a world tile (0-based). */
const worldTileOf = (room: Vec, tile: Vec): Vec => ({ x: (room.x - 1) * ROOM_SIZE.x + tile.x, y: (room.y - 1) * ROOM_SIZE.y + tile.y })
export const worldTile = (p: Placement): Vec => worldTileOf(p.room, p.tile)

/**
 * The start room reaches every unit and some tile of the end room. The flood starts from the start
 * room's first unit: the player, or on a floor without one its start music (also on a tile the
 * room's openings reach).
 */
export function floorIsConnected(floor: GeneratedFloor, isSolid: (active: number) => boolean): boolean {
  const { cells, size } = floorCells(floor, isSolid)
  const { startRoom: start, endRoom: end = exitRoom(floor.map.mapSize) } = floor.map
  const anchor = floor.placements.find((p) => sameVec(p.room, start))
  if (!anchor) return false
  const reach = floodOpen(cells, size, [worldTile(anchor)])
  const at = (v: Vec) => reach[v.y * size.x + v.x]!
  if (!floor.placements.every((p) => at(worldTile(p)))) return false
  const exit = { x: (end.x - 1) * ROOM_SIZE.x, y: (end.y - 1) * ROOM_SIZE.y }
  for (let y = 0; y < ROOM_SIZE.y; y++) for (let x = 0; x < ROOM_SIZE.x; x++) if (at({ x: exit.x + x, y: exit.y + y })) return true
  return false
}

/**
 * Solidity as the generator lays tiles: every active tile except the theme's walkable decorations
 * is an obstacle (themes.test.ts checks this against the tile key).
 */
export function themeIsSolid(theme: FloorTheme): (active: number) => boolean {
  const walkable = new Set(theme.decorations.map((d) => d.value))
  return (active) => active !== 0 && !walkable.has(active)
}
