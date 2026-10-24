// The roguelite floors' location sign (docs/plans/2026-10-25-roguelite-mode-design.md, Arrival): a
// wooden board in the start room with the floor's name on it. The board is the original Black
// Fortress sign (merlinOpenActive 164-166) with its writing wiped by the converter
// (tools/derived-tiles.ts) into empty slots of the same sheet, keyed solid like the originals; the
// renderer writes the name over it (src/render/location-sign.ts). The board stands where it blocks
// no opening's band, no placement and no path.
import type { Vec } from '../mr-open/mr-geometry'
import type { LocationSign } from '../mr-open/mr-map-format'
import { Cell, floodOpen } from './grid'
import type { RoomEdges, RoomShape } from './room-shape'
import { TOWER_TILESETS, TOWER_TILESET_PARTS } from './tower-tilesets'

/** The blank board's tiles: merlinOpenActive's slots for its left end, a middle piece and its right end. */
export const BLANK_SIGN_TILES = { left: 197, middle: 198, right: 199 } as const
/** The sign whose board the blank one is cut from: merlinOpenActive's Black Fortress, left to right. */
export const BLANK_SIGN_SOURCE = [164, 165, 166] as const
export const BLANK_SIGN_TILESET = 'merlinOpenActive'

/** Tiles across: the ends and two middle pieces hold a biome's name in the game's small font. */
export const SIGN_WIDTH_TILES = 4
/** The board stands this many rows above Merlin's start tile when it can, so he sees it on arriving. */
const ROWS_ABOVE_ARRIVAL = 2

/** The board's tile indices from left to right (in the board's own tileset), `width` tiles across. */
export function signTileRow(width: number): number[] {
  return Array.from({ length: width }, (_, i) => (i === 0 ? BLANK_SIGN_TILES.left : i === width - 1 ? BLANK_SIGN_TILES.right : BLANK_SIGN_TILES.middle))
}

/** A board tile (an index in BLANK_SIGN_TILESET) in an active tileset: that one, or the tower's. */
export function signTileIn(tileSet: string, index: number): number {
  if (tileSet === BLANK_SIGN_TILESET) return index
  const part = TOWER_TILESET_PARTS.find((p) => p.tileSets.backgroundActive === BLANK_SIGN_TILESET)
  if (tileSet === TOWER_TILESETS.backgroundActive && part) return part.offset + index
  throw new Error(`location sign: the active tileset ${tileSet} has no sign board`)
}

/** The tiles a sign covers, from its left tile. */
export const signTiles = (sign: Pick<LocationSign, 'tile' | 'width'>): Vec[] =>
  Array.from({ length: sign.width }, (_, i) => ({ x: sign.tile.x + i, y: sign.tile.y }))

/** Open ground or a walkable decoration, which the board replaces. */
const isFloor = (c: Cell): boolean => c === Cell.Open || c === Cell.Decoration

/** Whether a room tile is in the column band of a top or bottom opening, or the row band of a side one. */
export function inOpeningBand(edges: RoomEdges, tile: Vec): boolean {
  const within = (o: RoomEdges[keyof RoomEdges], v: number) => o !== null && v >= o.from && v <= o.to
  return within(edges.top, tile.x) || within(edges.bottom, tile.x) || within(edges.left, tile.y) || within(edges.right, tile.y)
}

/**
 * The left tile of the sign's spot in a room: a row of open (or decorated) tiles off the room's edges, none in an
 * opening's band or under a placement, whose wall leaves every other reachable tile reachable.
 * Nearest to ROWS_ABOVE_ARRIVAL rows above the arrival tile; null when no spot fits.
 */
export function signSpot(shape: RoomShape, edges: RoomEdges, taken: readonly Vec[], arrival: Vec, width = SIGN_WIDTH_TILES): Vec | null {
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
