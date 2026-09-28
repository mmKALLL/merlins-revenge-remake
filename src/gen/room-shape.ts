// One room's layout for the random floor: where the walls, obstacle patches, stumps and
// decorations go, with every opening reachable from every other (flood fill; retry, then carve).
// Coordinates are 0-based room tiles, index = row * width + col.
import type { Vec } from '../mr-open/mr-geometry'
import type { Edge } from '../mr-open/mr-screen-exits'
import type { GenRandom } from './random'
import type { RoomShapeTuning } from './themes'

export const Cell = {
  Open: 0,
  /** walkable decoration on the active layer */
  Decoration: 1,
  /** boundary or closed edge */
  Wall: 2,
  LongWall: 3,
  Patch: 4,
  Stump: 5,
} as const
export type Cell = (typeof Cell)[keyof typeof Cell]

export const isSolidCell = (c: Cell): boolean => c >= Cell.Wall

/** An open edge's opening: tiles [from, to] along the edge (rows on left/right, columns on top/bottom). */
export interface Opening { from: number; to: number }

/** Per edge: an opening, or null for a wall (map boundary or closed edge). */
export type RoomEdges = Record<Edge, Opening | null>

export interface RoomShape {
  size: Vec
  cells: Cell[]
  /** open tiles reachable from the openings (all of them after generation) */
  reachable: boolean[]
}

/** Attempts at a room before carving corridors instead. */
const ROOM_ATTEMPTS = 12
const NEIGHBOURS_8: readonly Vec[] = [
  { x: -1, y: -1 }, { x: 0, y: -1 }, { x: 1, y: -1 }, { x: -1, y: 0 },
  { x: 1, y: 0 }, { x: -1, y: 1 }, { x: 0, y: 1 }, { x: 1, y: 1 },
]
const NEIGHBOURS_4: readonly Vec[] = [{ x: 0, y: -1 }, { x: -1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }]

/** The tiles of an opening, `depth` tiles inward from its edge. */
export function openingTiles(edge: Edge, o: Opening, size: Vec, depth: number): Vec[] {
  const out: Vec[] = []
  for (let along = o.from; along <= o.to; along++) {
    for (let d = 0; d < depth; d++) {
      switch (edge) {
        case 'left': out.push({ x: d, y: along }); break
        case 'right': out.push({ x: size.x - 1 - d, y: along }); break
        case 'top': out.push({ x: along, y: d }); break
        case 'bottom': out.push({ x: along, y: size.y - 1 - d }); break
      }
    }
  }
  return out
}

function edgeTiles(edge: Edge, size: Vec): Vec[] {
  const n = edge === 'left' || edge === 'right' ? size.y : size.x
  return openingTiles(edge, { from: 0, to: n - 1 }, size, 1)
}

const EDGE_LIST: readonly Edge[] = ['left', 'top', 'right', 'bottom']

class Grid {
  readonly cells: Cell[]
  constructor(readonly size: Vec, fill: Cell) {
    this.cells = new Array<Cell>(size.x * size.y).fill(fill)
  }
  inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.size.x && y < this.size.y
  }
  get(x: number, y: number): Cell {
    return this.cells[y * this.size.x + x]!
  }
  set(x: number, y: number, c: Cell): void {
    this.cells[y * this.size.x + x] = c
  }
  solidNeighbours(x: number, y: number): number {
    let n = 0
    for (const d of NEIGHBOURS_8) {
      const nx = x + d.x
      const ny = y + d.y
      if (this.inside(nx, ny) && isSolidCell(this.get(nx, ny))) n++
    }
    return n
  }
}

/** Open tiles 4-connected to any of `from`. */
export function floodOpen(cells: readonly Cell[], size: Vec, from: readonly Vec[]): boolean[] {
  const seen = new Array<boolean>(cells.length).fill(false)
  const stack: number[] = []
  for (const p of from) {
    const i = p.y * size.x + p.x
    if (!isSolidCell(cells[i]!) && !seen[i]) {
      seen[i] = true
      stack.push(i)
    }
  }
  while (stack.length > 0) {
    const i = stack.pop()!
    const x = i % size.x
    const y = (i - x) / size.x
    for (const d of NEIGHBOURS_4) {
      const nx = x + d.x
      const ny = y + d.y
      if (nx < 0 || ny < 0 || nx >= size.x || ny >= size.y) continue
      const j = ny * size.x + nx
      if (!seen[j] && !isSolidCell(cells[j]!)) {
        seen[j] = true
        stack.push(j)
      }
    }
  }
  return seen
}

/** Connected groups of `Patch` cells (8-connected), as tile index lists. */
export function patchComponents(cells: readonly Cell[], size: Vec): number[][] {
  const seen = new Array<boolean>(cells.length).fill(false)
  const out: number[][] = []
  for (let start = 0; start < cells.length; start++) {
    if (seen[start] || cells[start] !== Cell.Patch) continue
    const group: number[] = []
    const stack = [start]
    seen[start] = true
    while (stack.length > 0) {
      const i = stack.pop()!
      group.push(i)
      const x = i % size.x
      const y = (i - x) / size.x
      for (const d of NEIGHBOURS_8) {
        const nx = x + d.x
        const ny = y + d.y
        if (nx < 0 || ny < 0 || nx >= size.x || ny >= size.y) continue
        const j = ny * size.x + nx
        if (!seen[j] && cells[j] === Cell.Patch) {
          seen[j] = true
          stack.push(j)
        }
      }
    }
    out.push(group)
  }
  return out
}

/**
 * A room whose openings all connect. Tries `ROOM_ATTEMPTS` random layouts, then falls back to the
 * last one with corridors carved from every opening to the centre.
 */
export function generateRoomShape(rng: GenRandom, size: Vec, edges: RoomEdges, t: RoomShapeTuning, openingDepth: number): RoomShape {
  const reserved = reservedTiles(size, edges, openingDepth)
  let grid = new Grid(size, Cell.Open)
  for (let attempt = 0; attempt < ROOM_ATTEMPTS; attempt++) {
    grid = layout(rng, size, edges, t, reserved)
    const shape = finish(grid, edges, t, false)
    if (shape) return shape
  }
  carveCorridors(grid, edges)
  const shape = finish(grid, edges, t, true)
  if (!shape) throw new Error('room generation: carved room is still disconnected')
  return shape
}

function reservedTiles(size: Vec, edges: RoomEdges, depth: number): boolean[] {
  const reserved = new Array<boolean>(size.x * size.y).fill(false)
  for (const edge of EDGE_LIST) {
    const o = edges[edge]
    if (o) for (const p of openingTiles(edge, o, size, depth)) reserved[p.y * size.x + p.x] = true
  }
  return reserved
}

function layout(rng: GenRandom, size: Vec, edges: RoomEdges, t: RoomShapeTuning, reserved: readonly boolean[]): Grid {
  const g = new Grid(size, Cell.Open)
  const free = (x: number, y: number) => !reserved[y * size.x + x] && g.get(x, y) !== Cell.Wall
  for (const edge of EDGE_LIST) {
    if (!edges[edge]) for (const p of edgeTiles(edge, size)) g.set(p.x, p.y, Cell.Wall)
  }
  const patches = rng.int(t.patches[0], t.patches[1])
  for (let i = 0; i < patches; i++) growPatch(rng, g, rng.int(t.patchSize[0], t.patchSize[1]), free)
  // cellular automata smoothing: fill notches, so patches read as clumps rather than lines
  for (let step = 0; step < t.smoothSteps; step++) {
    const next = g.cells.slice()
    for (let y = 0; y < size.y; y++) {
      for (let x = 0; x < size.x; x++) {
        if (free(x, y) && g.get(x, y) === Cell.Open && g.solidNeighbours(x, y) >= t.birth) next[y * size.x + x] = Cell.Patch
      }
    }
    g.cells.splice(0, g.cells.length, ...next)
  }
  if (rng.chance(t.longWallChance)) addLongWall(rng, g, edges, t, reserved)
  for (let y = 0; y < size.y; y++) {
    for (let x = 0; x < size.x; x++) {
      if (!free(x, y) || g.get(x, y) !== Cell.Open) continue
      if (rng.chance(t.stumpChance)) g.set(x, y, Cell.Stump)
    }
  }
  return g
}

/** Grows one patch from a random free tile by adding random free 4-neighbours of the patch. */
function growPatch(rng: GenRandom, g: Grid, size: number, free: (x: number, y: number) => boolean): void {
  const start = { x: rng.int(0, g.size.x - 1), y: rng.int(0, g.size.y - 1) }
  if (!free(start.x, start.y)) return
  const patch: Vec[] = [start]
  g.set(start.x, start.y, Cell.Patch)
  while (patch.length < size) {
    const frontier = patch.flatMap((p) => NEIGHBOURS_4.map((d) => ({ x: p.x + d.x, y: p.y + d.y })))
      .filter((p) => g.inside(p.x, p.y) && free(p.x, p.y) && g.get(p.x, p.y) === Cell.Open)
    if (frontier.length === 0) return
    const next = rng.pick(frontier)
    g.set(next.x, next.y, Cell.Patch)
    patch.push(next)
  }
}

/** A straight wall from a walled edge toward the centre, clear of openings (rooms become U-shaped). */
function addLongWall(rng: GenRandom, g: Grid, edges: RoomEdges, t: RoomShapeTuning, reserved: readonly boolean[]): void {
  const walled = EDGE_LIST.filter((e) => !edges[e])
  const edge = walled.length > 0 ? rng.pick(walled) : rng.pick(EDGE_LIST)
  const { x: w, y: h } = g.size
  const fromSide = edge === 'left' || edge === 'right'
  const [lo, hi] = fromSide ? t.longWallSide : t.longWallEnd
  const length = rng.int(lo, hi)
  // keep one tile of margin from the corners so the wall does not seal a corner off
  const along = fromSide ? rng.int(2, h - 3) : rng.int(3, w - 4)
  for (let d = 0; d < length; d++) {
    const x = edge === 'left' ? d : edge === 'right' ? w - 1 - d : along
    const y = edge === 'top' ? d : edge === 'bottom' ? h - 1 - d : along
    if (reserved[y * w + x]) break
    if (g.get(x, y) !== Cell.Wall) g.set(x, y, Cell.LongWall)
  }
}

/** Clears straight corridors from the middle of every opening to the room centre. */
function carveCorridors(g: Grid, edges: RoomEdges): void {
  const centre = { x: Math.floor(g.size.x / 2), y: Math.floor(g.size.y / 2) }
  for (const edge of EDGE_LIST) {
    const o = edges[edge]
    if (!o) continue
    const mid = Math.floor((o.from + o.to) / 2)
    const start = openingTiles(edge, { from: mid, to: mid }, g.size, 1)[0]!
    let { x, y } = start
    const clear = () => { if (g.get(x, y) !== Cell.Wall) g.set(x, y, Cell.Open) }
    clear()
    while (x !== centre.x) { x += Math.sign(centre.x - x); clear() }
    while (y !== centre.y) { y += Math.sign(centre.y - y); clear() }
  }
}

/**
 * Checks the openings connect and enough of the room is reachable; fills unreachable pockets and
 * scatters decoration. Returns null when the room should be retried (unless `force`).
 */
function finish(g: Grid, edges: RoomEdges, t: RoomShapeTuning, force: boolean): RoomShape | null {
  const openings = EDGE_LIST.flatMap((e) => {
    const o = edges[e]
    return o ? [openingTiles(e, o, g.size, 1)] : []
  })
  if (openings.length === 0) throw new Error('room generation: a room needs at least one opening')
  const reachable = floodOpen(g.cells, g.size, openings[0]!)
  const allConnected = openings.every((tiles) => tiles.every((p) => reachable[p.y * g.size.x + p.x]))
  const openCount = reachable.filter(Boolean).length
  if (!force && (!allConnected || openCount < t.minOpenShare * g.cells.length)) return null
  if (!allConnected) return null
  for (let i = 0; i < g.cells.length; i++) {
    if (!reachable[i] && !isSolidCell(g.cells[i]!)) g.cells[i] = Cell.Patch
  }
  return { size: g.size, cells: g.cells, reachable }
}

/** Marks some reachable open tiles as walkable decoration. */
export function decorate(rng: GenRandom, shape: RoomShape, chance: number): void {
  shape.cells.forEach((c, i) => {
    if (c === Cell.Open && rng.chance(chance)) shape.cells[i] = Cell.Decoration
  })
}
