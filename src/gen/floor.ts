// The random floor generator (docs/plans/2026-09-28-random-floor-design.md): a floor of rooms
// as a plain MapDefinition. Edges between rooms are decided once for both rooms (a random spanning
// tree is always open), each room is laid out to connect its openings, and units are placed by the
// theme's tables. The result is checked with a flood fill over the whole floor.
import type { Vec } from '../mr-open/mr-geometry'
import { roomXYToNum, type LayerName, type MapDefinition, type RoomDefinition, type TileGrid } from '../mr-open/mr-map-format'
import type { Edge } from '../mr-open/mr-screen-exits'
import { GenRandom } from './random'
import { Cell, floodOpen } from './grid'
import { decorate, generateRoomShape, patchComponents, type Opening, type RoomEdges, type RoomShape } from './room-shape'
import type { Amount, Corner, EnemyChoice, FloorTheme, QuantityTuning, UnitGroup, Weighted } from './themes'

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

/** A placed unit: an objects-layer key at a room tile (0-based). */
export interface Placement { key: string; room: Vec; tile: Vec }

/** An opening on the floor's boundary, into a neighbouring floor (the tower's stairs). */
export interface BoundaryOpening { room: Vec; edge: Edge; opening: Opening }

export interface FloorOptions {
  /** false for the tower's later floors: their start room only plays the start music */
  placePlayer?: boolean
  boundaryOpenings?: readonly BoundaryOpening[]
  /** the start room's spell scroll; drawn from the theme's list when unset */
  spellScroll?: string
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

/** A seeded floor for a theme; the same theme, seed and options always give the same floor. */
export function generateFloor(theme: FloorTheme, seed: number, options: FloorOptions = {}): GeneratedFloor {
  for (let attempt = 0; attempt < FLOOR_ATTEMPTS; attempt++) {
    const floor = buildFloor(theme, retrySeed(seed, attempt), options)
    if (floorIsConnected(floor, themeIsSolid(theme))) return floor
  }
  throw new Error(`random floor ${theme.id}: no connected floor for seed ${seed} after ${FLOOR_ATTEMPTS} attempts`)
}

function buildFloor(theme: FloorTheme, seed: number, options: FloorOptions): GeneratedFloor {
  const rng = new GenRandom(seed)
  const size = theme.floorSize
  const edges = decideEdges(rng, theme)
  for (const b of options.boundaryOpenings ?? []) edges[roomKey(b.room)]![b.edge] = b.opening
  const rooms: RoomDefinition[] = []
  const placements: Placement[] = []
  for (let y = 1; y <= size.y; y++) {
    for (let x = 1; x <= size.x; x++) {
      const room = { x, y }
      const keepOpen = reservedTiles(size, room)
      const shape = generateRoomShape(rng, ROOM_SIZE, edges[roomKey(room)]!, theme.shape, theme.edges.openingDepth, keepOpen)
      decorate(rng, shape, theme.shape.decorationChance)
      const units = placeUnits(rng, theme, room, shape, options)
      placements.push(...units)
      rooms.push(roomDefinition(rng, theme, room, shape, units))
    }
  }
  rooms.sort((a, b) => a.num - b.num)
  const map: MapDefinition = {
    mapSize: size,
    roomSize: ROOM_SIZE,
    startRoom: startRoom(size),
    endRoom: exitRoom(size),
    layers: (['backgroundPassive', 'backgroundActive', 'objects'] as const).map((name) => ({ name, tileSet: theme.tileSets[name] })),
    rooms,
  }
  return { map, edges, placements }
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

/** Steps from the start corner along x and y as a share of the floor (0 at the start, 1 at the far side). */
function progress(floorSize: Vec, room: Vec): { fx: number; fy: number } {
  const start = startRoom(floorSize)
  const share = (steps: number, rooms: number) => (rooms > 1 ? steps / (rooms - 1) : 0)
  return { fx: share(Math.abs(room.x - start.x), floorSize.x), fy: share(Math.abs(room.y - start.y), floorSize.y) }
}

/** Enemy quality ramps over y (the theme's start value in the start row, its exit value in the far row). */
function difficultyOf(theme: FloorTheme, fy: number): number {
  const [d0, d1] = theme.units.difficulty
  return d0 + (d1 - d0) * fy
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

/** What a room draws its enemies from: its difficulty, progress and faction. */
interface RoomDraw { difficulty: number; fx: number; fy: number; faction: string | null }

const weightIn = (c: EnemyChoice, draw: RoomDraw): number => c.weight + (c.weightFarX ?? 0) * draw.fx + (c.weightFarY ?? 0) * draw.fy

function eligible(table: readonly EnemyChoice[], draw: RoomDraw): EnemyChoice[] {
  return table.filter((c) => (c.minDifficulty ?? 0) <= draw.difficulty && weightIn(c, draw) > 0
    && (c.faction === undefined || draw.faction === null || c.faction === draw.faction))
}

/** One faction for the room, weighted by its eligible enemies; null when the theme has none. */
function pickFaction(rng: GenRandom, table: readonly EnemyChoice[], draw: RoomDraw): string | null {
  const totals = new Map<string, number>()
  for (const c of eligible(table, draw)) if (c.faction) totals.set(c.faction, (totals.get(c.faction) ?? 0) + weightIn(c, draw))
  if (totals.size === 0) return null
  return rng.weighted([...totals].map(([value, weight]) => ({ value, weight })))
}

function pickUnit(rng: GenRandom, table: readonly EnemyChoice[], draw: RoomDraw, counts: Map<string, number>): string | null {
  const choices = eligible(table, draw).filter((c) => (counts.get(c.key) ?? 0) < (c.maxPerRoom ?? Infinity))
  if (choices.length === 0) return null
  return rng.weighted(choices.map((c) => ({ value: c.key, weight: weightIn(c, draw) })))
}

/** The side corner room's fixed group, if it is one. */
function specialGroup(rng: GenRandom, theme: FloorTheme, room: Vec): UnitGroup | null {
  const special = theme.units.specialRooms.find((s) => sameVec(cornerRoom(theme.floorSize, s.corner), room))
  return special ? rng.pick(special.groups) : null
}

/** How a room brings its numbers; the exit room has both. */
type RoomForm = 'swarm' | 'producers' | 'both'

/** Swarm or producers by the theme's weights; a swarm when no producer fits the room. */
function pickForm(rng: GenRandom, q: QuantityTuning, canProduce: boolean): RoomForm {
  const form = rng.weighted<RoomForm>([{ value: 'swarm', weight: q.swarmWeight }, { value: 'producers', weight: q.producerWeight }])
  return form === 'producers' && !canProduce ? 'swarm' : form
}

const amountAt = (rng: GenRandom, a: Amount, fx: number): number => Math.floor(a.base + a.farX * fx + rng.next())

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

/**
 * The start room: the player (unless the floor is not the first in the tower) and the start music
 * on the tiles nearest the room's centre, then the rewards on the free tiles nearest where Merlin
 * starts or arrives, at least REWARD_MIN_DISTANCE away from it.
 */
function placeStartRoom(rng: GenRandom, theme: FloorTheme, room: Vec, tiles: Vec[], options: FloorOptions): Placement[] {
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
  const rewardTiles = free.filter(farEnough).sort(byDistanceTo(arrival))
  const rewards = startRewardKeys(rng, theme, options.spellScroll).slice(0, rewardTiles.length)
    .map((key, i) => ({ key, room, tile: rewardTiles[i]! }))
  return [...(player ? [player] : []), music, ...rewards]
}

function placeUnits(rng: GenRandom, theme: FloorTheme, room: Vec, shape: RoomShape, options: FloorOptions): Placement[] {
  const u = theme.units
  const isExit = sameVec(room, exitRoom(theme.floorSize))
  const reserved = reservedTiles(theme.floorSize, room)
  const tiles = unitTiles(rng, shape).filter((t) => !reserved.some((r) => sameVec(r, t)))
  if (sameVec(room, startRoom(theme.floorSize))) return placeStartRoom(rng, theme, room, tiles, options)
  const keys: string[] = []
  const fixed: Placement[] = potionTiles(theme.floorSize, room).map((tile) => ({ key: rng.weighted(u.potions), room, tile }))
  const { fx, fy } = progress(theme.floorSize, room)
  const draw: RoomDraw = { difficulty: difficultyOf(theme, fy), fx, fy, faction: null }
  const boss = isExit ? rng.pick(u.bosses) : null
  const group = boss ?? specialGroup(rng, theme, room)
  draw.faction = group?.faction ?? pickFaction(rng, u.enemies, draw)
  const counts = new Map<string, number>()
  const count = (key: string) => counts.set(key, (counts.get(key) ?? 0) + 1)
  const add = (key: string | null) => {
    if (!key) return
    keys.push(key)
    count(key)
  }
  if (boss) {
    fixed.push({ key: boss.boss, room, tile: BOSS_TILE })
    count(boss.boss)
  }
  for (const [key, n] of Object.entries(group?.units ?? {})) {
    for (let i = key === boss?.boss ? 1 : 0; i < n; i++) add(key)
  }
  const regulars = u.enemies.filter((c) => !c.producer)
  const producers = [...u.dwellings, ...u.enemies.filter((c) => c.producer)]
  const q = u.quantity
  const form: RoomForm | null = group?.alone ? null : isExit ? 'both' : pickForm(rng, q, eligible(producers, draw).length > 0)
  const addFrom = (table: readonly EnemyChoice[], n: number) => { for (let i = 0; i < n; i++) add(pickUnit(rng, table, draw, counts)) }
  if (form === 'swarm' || form === 'both') addFrom(regulars, amountAt(rng, q.swarm, fx))
  if (form === 'producers' || form === 'both') addFrom(producers, amountAt(rng, q.producers, fx))
  if (form === 'producers') addFrom(regulars, rng.int(q.escorts[0], q.escorts[1]))
  if (isExit) keys.push(u.exitMusic)
  return [...fixed, ...keys.slice(0, tiles.length).map((key, i) => ({ key, room, tile: tiles[i]! }))]
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
    const choices = c === Cell.Wall ? theme.wall
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

export const worldTile = (p: Placement): Vec => ({ x: (p.room.x - 1) * ROOM_SIZE.x + p.tile.x, y: (p.room.y - 1) * ROOM_SIZE.y + p.tile.y })

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
