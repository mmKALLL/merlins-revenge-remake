// The random floor generator (docs/plans/2026-09-28-random-floor-design.md): a 4x4 floor of rooms
// as a plain MapDefinition. Edges between rooms are decided once for both rooms (a random spanning
// tree is always open), each room is laid out to connect its openings, and units are placed by the
// theme's tables. The result is checked with a flood fill over the whole floor.
import type { Vec } from '../mr-open/mr-geometry'
import { roomXYToNum, type LayerName, type MapDefinition, type RoomDefinition, type TileGrid } from '../mr-open/mr-map-format'
import type { Edge } from '../mr-open/mr-screen-exits'
import { GenRandom } from './random'
import { Cell, decorate, floodOpen, generateRoomShape, patchComponents, type Opening, type RoomEdges, type RoomShape } from './room-shape'
import type { EnemyChoice, FloorTheme, Weighted } from './themes'

export const FLOOR_SIZE: Vec = { x: 4, y: 4 }
export const ROOM_SIZE: Vec = { x: 18, y: 9 }
/** Engine rooms count y down: the start is the bottom-left corner, the exit the top-right one. */
export const START_ROOM: Vec = { x: 1, y: FLOOR_SIZE.y }
export const EXIT_ROOM: Vec = { x: FLOOR_SIZE.x, y: 1 }
/** Units keep this many tiles from every room edge. */
const UNIT_EDGE_MARGIN = 2
/** Whole-floor attempts (each from a derived seed) before giving up. */
const FLOOR_ATTEMPTS = 8
const RETRY_SEED_STEP = 0x9e3779b9

/** A placed unit: an objects-layer key at a room tile (0-based). */
export interface Placement { key: string; room: Vec; tile: Vec }

export interface GeneratedFloor {
  map: MapDefinition
  /** per room key "x,y": its openings */
  edges: Record<string, RoomEdges>
  placements: Placement[]
}

export const roomKey = (r: Vec): string => `${r.x},${r.y}`

/** A seeded floor for a theme; the same theme and seed always give the same floor. */
export function generateFloor(theme: FloorTheme, seed: number): GeneratedFloor {
  for (let attempt = 0; attempt < FLOOR_ATTEMPTS; attempt++) {
    const floor = buildFloor(theme, (seed + attempt * RETRY_SEED_STEP) >>> 0)
    if (floorIsConnected(floor, themeIsSolid(theme))) return floor
  }
  throw new Error(`random floor ${theme.id}: no connected floor for seed ${seed} after ${FLOOR_ATTEMPTS} attempts`)
}

function buildFloor(theme: FloorTheme, seed: number): GeneratedFloor {
  const rng = new GenRandom(seed)
  const edges = decideEdges(rng, theme)
  const rooms: RoomDefinition[] = []
  const placements: Placement[] = []
  for (let y = 1; y <= FLOOR_SIZE.y; y++) {
    for (let x = 1; x <= FLOOR_SIZE.x; x++) {
      const room = { x, y }
      const shape = generateRoomShape(rng, ROOM_SIZE, edges[roomKey(room)]!, theme.shape, theme.edges.openingDepth)
      decorate(rng, shape, theme.shape.decorationChance)
      const units = placeUnits(rng, theme, room, shape)
      placements.push(...units)
      rooms.push(roomDefinition(rng, theme, room, shape, units))
    }
  }
  rooms.sort((a, b) => a.num - b.num)
  const map: MapDefinition = {
    mapSize: FLOOR_SIZE,
    roomSize: ROOM_SIZE,
    startRoom: START_ROOM,
    endRoom: EXIT_ROOM,
    layers: (['backgroundPassive', 'backgroundActive', 'objects'] as const).map((name) => ({ name, tileSet: theme.tileSets[name] })),
    rooms,
  }
  return { map, edges, placements }
}

// ---- edges ----

interface SharedEdge { a: Vec; b: Vec; vertical: boolean }

/** Every edge between neighbouring rooms; vertical edges join a room to the one on its right. */
function sharedEdges(): SharedEdge[] {
  const out: SharedEdge[] = []
  for (let y = 1; y <= FLOOR_SIZE.y; y++) {
    for (let x = 1; x <= FLOOR_SIZE.x; x++) {
      if (x < FLOOR_SIZE.x) out.push({ a: { x, y }, b: { x: x + 1, y }, vertical: true })
      if (y < FLOOR_SIZE.y) out.push({ a: { x, y }, b: { x, y: y + 1 }, vertical: false })
    }
  }
  return out
}

/** Opens a random spanning tree (Kruskal) plus extra edges by chance; gives each open edge its opening. */
function decideEdges(rng: GenRandom, theme: FloorTheme): Record<string, RoomEdges> {
  const edges: Record<string, RoomEdges> = {}
  for (let y = 1; y <= FLOOR_SIZE.y; y++) {
    for (let x = 1; x <= FLOOR_SIZE.x; x++) edges[roomKey({ x, y })] = { left: null, top: null, right: null, bottom: null }
  }
  const parent = new Map<string, string>()
  const find = (k: string): string => {
    const p = parent.get(k) ?? k
    if (p === k) return k
    const root = find(p)
    parent.set(k, root)
    return root
  }
  for (const e of rng.shuffle(sharedEdges())) {
    const ra = find(roomKey(e.a))
    const rb = find(roomKey(e.b))
    const inTree = ra !== rb
    if (inTree) parent.set(ra, rb)
    if (!inTree && !rng.chance(theme.edges.extraOpenChance)) continue
    const length = e.vertical ? ROOM_SIZE.y : ROOM_SIZE.x
    const [lo, hi] = e.vertical ? theme.edges.sideOpening : theme.edges.endOpening
    const width = rng.int(lo, hi)
    // openings stay off the corner tiles
    const from = rng.int(1, length - 1 - width)
    const opening: Opening = { from, to: from + width - 1 }
    const [sideA, sideB]: [Edge, Edge] = e.vertical ? ['right', 'left'] : ['bottom', 'top']
    edges[roomKey(e.a)]![sideA] = opening
    edges[roomKey(e.b)]![sideB] = opening
  }
  return edges
}

// ---- units ----

/** 0 at the start, 1 at the exit: x and y steps away from the start corner. */
function progress(room: Vec): { px: number; py: number } {
  return { px: Math.abs(room.x - START_ROOM.x), py: Math.abs(room.y - START_ROOM.y) }
}

function difficultyOf(theme: FloorTheme, room: Vec): number {
  const { px, py } = progress(room)
  const maxSteps = FLOOR_SIZE.x - 1 + FLOOR_SIZE.y - 1
  const [d0, d1] = theme.units.difficulty
  return d0 + ((d1 - d0) * (px + py)) / maxSteps
}

const sameRoom = (a: Vec, b: Vec): boolean => a.x === b.x && a.y === b.y

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

function pickUnit(rng: GenRandom, table: readonly EnemyChoice[], difficulty: number, counts: Map<string, number>): string | null {
  const eligible = table.filter((c) => (c.minDifficulty ?? 0) <= difficulty && (counts.get(c.key) ?? 0) < (c.maxPerRoom ?? Infinity))
  if (eligible.length === 0) return null
  return rng.weighted(eligible.map((c) => ({ value: c.key, weight: c.weight })))
}

function placeUnits(rng: GenRandom, theme: FloorTheme, room: Vec, shape: RoomShape): Placement[] {
  const u = theme.units
  const tiles = unitTiles(rng, shape)
  const keys: string[] = []
  if (sameRoom(room, START_ROOM)) {
    const centre = { x: (shape.size.x - 1) / 2, y: (shape.size.y - 1) / 2 }
    tiles.sort((a, b) => Math.hypot(a.x - centre.x, a.y - centre.y) - Math.hypot(b.x - centre.x, b.y - centre.y))
    keys.push(u.player, u.startMusic)
  } else {
    const { px, py } = progress(room)
    const difficulty = difficultyOf(theme, room)
    const counts = new Map<string, number>()
    const add = (key: string | null) => {
      if (!key) return
      keys.push(key)
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    for (const special of u.specialRooms) {
      if (!sameRoom(special.room, room)) continue
      for (const [key, n] of Object.entries(special.units)) for (let i = 0; i < n; i++) add(key)
    }
    const enemies = Math.round(u.enemiesBase + u.enemiesPerX * px + rng.int(0, u.enemiesRandom))
    for (let i = 0; i < enemies; i++) add(pickUnit(rng, u.enemies, difficulty, counts))
    const dwellings = Math.floor(u.dwellingsPerY * py + rng.next())
    for (let i = 0; i < dwellings; i++) add(pickUnit(rng, u.dwellings, difficulty, counts))
    if (sameRoom(room, EXIT_ROOM)) keys.push(u.exitMusic)
  }
  return keys.slice(0, tiles.length).map((key, i) => ({ key, room, tile: tiles[i]! }))
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
  return { num: roomXYToNum(room, FLOOR_SIZE), layers }
}

// ---- whole-floor check ----

/** Solid cells of the whole floor, world tile index = wy * width + wx (0-based). */
export function floorCells(floor: GeneratedFloor, isSolid: (active: number) => boolean): { cells: Cell[]; size: Vec } {
  const size = { x: FLOOR_SIZE.x * ROOM_SIZE.x, y: FLOOR_SIZE.y * ROOM_SIZE.y }
  const cells = new Array<Cell>(size.x * size.y).fill(Cell.Open)
  for (const room of floor.map.rooms) {
    const rx = (room.num - 1) % FLOOR_SIZE.x
    const ry = Math.floor((room.num - 1) / FLOOR_SIZE.x)
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

/** The player reaches every unit and some tile of the exit room. */
export function floorIsConnected(floor: GeneratedFloor, isSolid: (active: number) => boolean): boolean {
  const { cells, size } = floorCells(floor, isSolid)
  const player = floor.placements.find((p) => sameRoom(p.room, START_ROOM) && p.key === 'player')
  if (!player) return false
  const reach = floodOpen(cells, size, [worldTile(player)])
  const at = (v: Vec) => reach[v.y * size.x + v.x]!
  if (!floor.placements.every((p) => at(worldTile(p)))) return false
  const exit = { x: (EXIT_ROOM.x - 1) * ROOM_SIZE.x, y: (EXIT_ROOM.y - 1) * ROOM_SIZE.y }
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
