// The roguelite floors' location sign (docs/plans/2026-10-25-roguelite-mode-design.md, Arrival): the
// biome's original painted sign (merlinOpenActive's sign rows, keyed solid; the theme's
// `locationSign`) stood in the start room where it blocks no opening's band, no placement and no path.
import type { Vec } from '../mr-open/mr-geometry'
import type { LocationSign } from '../mr-open/mr-map-format'
import { Cell, floodOpen } from './grid'
import type { RoomEdges, RoomShape } from './room-shape'

/** The sign stands this many rows above Merlin's start tile when it can, so he sees it on arriving. */
const ROWS_ABOVE_ARRIVAL = 2

/** The tiles a sign covers, from its left tile. */
export const signTiles = (sign: Pick<LocationSign, 'tile' | 'width'>): Vec[] =>
  Array.from({ length: sign.width }, (_, i) => ({ x: sign.tile.x + i, y: sign.tile.y }))

/** Open ground or a walkable decoration, which the sign replaces. */
const isFloor = (c: Cell): boolean => c === Cell.Open || c === Cell.Decoration

/** Whether a room tile is in the column band of a top or bottom opening, or the row band of a side one. */
export function inOpeningBand(edges: RoomEdges, tile: Vec): boolean {
  const within = (o: RoomEdges[keyof RoomEdges], v: number) => o !== null && v >= o.from && v <= o.to
  return within(edges.top, tile.x) || within(edges.bottom, tile.x) || within(edges.left, tile.y) || within(edges.right, tile.y)
}

/**
 * The left tile of the spot for a sign `width` tiles across in a room: a row of open (or decorated)
 * tiles off the room's edges, none in an opening's band or under a placement, whose wall leaves every
 * other reachable tile reachable. Nearest to ROWS_ABOVE_ARRIVAL rows above the arrival tile; null
 * when no spot fits.
 */
export function signSpot(shape: RoomShape, edges: RoomEdges, taken: readonly Vec[], arrival: Vec, width: number): Vec | null {
  const { size } = shape
  const want = { x: arrival.x - (width - 1) / 2, y: arrival.y - ROWS_ABOVE_ARRIVAL }
  const fits = (t: Vec) => {
    const i = t.y * size.x + t.x
    return isFloor(shape.cells[i]!) && shape.reachable[i] && !inOpeningBand(edges, t) && !taken.some((p) => p.x === t.x && p.y === t.y)
  }
  const spots: Vec[] = []
  for (let y = 1; y < size.y - 1; y++) {
    for (let x = 1; x + width < size.x; x++) {
      if (signTiles({ tile: { x, y }, width }).every(fits)) spots.push({ x, y })
    }
  }
  spots.sort((a, b) => Math.hypot(a.x - want.x, a.y - want.y) - Math.hypot(b.x - want.x, b.y - want.y))
  return spots.find((s) => keepsRoomConnected(shape, signTiles({ tile: s, width }), arrival)) ?? null
}

/** Whether every reachable open tile but the sign's is still reached from `from` once the sign stands. */
function keepsRoomConnected(shape: RoomShape, sign: readonly Vec[], from: Vec): boolean {
  const cells = [...shape.cells]
  for (const t of sign) cells[t.y * shape.size.x + t.x] = Cell.Wall
  const reach = floodOpen(cells, shape.size, [from])
  return cells.every((c, i) => c === Cell.Wall || !shape.reachable[i] || reach[i])
}
