// Port of the exit arrows: objRoom.drawExitArrows (objRoom.txt:232-258), ListCombineExitTiles,
// modScreenExits (convertExitTilesToRangesEdge, convertExitRangesToArrowRectsEdge,
// drawExitArrowsOnImage) and ImageDrawRepeated, plus objRoom.getHostile / objTileMap.getMiniMapStatus
// for the arrow colour. Positions are in room-image pixels (the room's top-left is 0,0).
import type { Rect, Vec } from './mr-geometry'

/** structScreenExits key order; drawExitArrows walks the edges in this order. */
export type Edge = 'left' | 'top' | 'right' | 'bottom'
export const EDGES: readonly Edge[] = ['left', 'top', 'right', 'bottom']

/** One list per edge (structScreenExits); an empty list is a map edge (objMap.getSurroundingInfo). */
export type EdgeLists<T> = Record<Edge, T[]>

/** The collision symbol of an edge tile; the active tile keys only hold #solid and #none. */
export type ExitTile = 'solid' | 'none'

export interface Size { w: number; h: number }

/** GameInitGlobals (merlin_engine_76_speed.dir movie script): `gExitArrows = true`. */
export const EXIT_ARROWS_ON = true
/** GameInitGlobals: `gExitArrowThickness = 16`, the depth of the arrow strip inside the room edge. */
export const EXIT_ARROW_THICKNESS = 16
/** Size of the arrow_{green,red}_{up,down,left,right} bitmaps (gfx/background, 16x16). */
export const EXIT_ARROW_ART: Size = { w: 16, h: 16 }

/** structExitArrowMembers: #grn / #rdd. */
export type ArrowColour = 'grn' | 'rdd'

export interface ExitArrow {
  edge: Edge
  colour: ArrowColour
  /** top-left of one arrow copy in room-image pixels */
  pos: Vec
}

/**
 * ListCombineExitTiles: `#solid` where either list is, else `#none`; `[]` if either list is empty
 * (the map edge). The Lingo's `list1 = list2` shortcut returns list1 unchanged, which is the same
 * result while the only symbols are #solid and #none.
 */
export function combineExitTiles(a: readonly ExitTile[], b: readonly ExitTile[]): ExitTile[] {
  if (a.length === 0 || b.length === 0) return []
  return a.map((t, i) => (t === 'solid' || b[i] === 'solid' ? 'solid' : 'none'))
}

/**
 * modScreenExits.convertExitTilesToRangesEdge (modScreenExits.txt:149-204): each run of `match`
 * tiles becomes [start, end) in pixels along the edge, `(tileNo - 1) * tileLength` to the end of the
 * run's last tile. tileLength is the tile width on the top/bottom edges, its height on the sides.
 */
export function exitTilesToRanges(tiles: readonly ExitTile[], edge: Edge, tileSize: Vec, match: ExitTile = 'none'): [number, number][] {
  const tileLength = edge === 'top' || edge === 'bottom' ? tileSize.x : tileSize.y
  const ranges: [number, number][] = []
  let start: number | null = null
  tiles.forEach((t, i) => {
    if (t === match && start === null) start = i * tileLength
    const last = i === tiles.length - 1
    if (start !== null && (t !== match || last)) {
      const endTile = last && t === match ? i + 1 : i
      ranges.push([start, endTile * tileLength])
      start = null
    }
  })
  return ranges
}

/**
 * modScreenExits.convertExitRangesToArrowRectsEdge (modScreenExits.txt:58-89): a strip
 * gExitArrowThickness deep along the inside of the edge, spanning the range.
 */
export function exitArrowRectsForEdge(ranges: readonly [number, number][], edge: Edge, image: Size, thickness = EXIT_ARROW_THICKNESS): Rect[] {
  return ranges.map(([from, to]) => {
    switch (edge) {
      case 'left': return { left: 0, top: from, right: thickness, bottom: to }
      case 'top': return { left: from, top: 0, right: to, bottom: thickness }
      case 'right': return { left: image.w - thickness, top: from, right: image.w, bottom: to }
      case 'bottom': return { left: from, top: image.h - thickness, right: to, bottom: image.h }
    }
  })
}

/**
 * ImageDrawRepeated: `repeats = destSize / sourceSize` (integer point division), then whole copies
 * row by row from the rect's top-left; a remainder smaller than the source is left blank.
 */
export function imageDrawRepeatedPositions(source: Size, dest: Rect): Vec[] {
  const across = Math.trunc((dest.right - dest.left) / source.w)
  const down = Math.trunc((dest.bottom - dest.top) / source.h)
  const out: Vec[] = []
  for (let y = 0; y < down; y++) {
    for (let x = 0; x < across; x++) out.push({ x: dest.left + x * source.w, y: dest.top + y * source.h })
  }
  return out
}

/**
 * objTileLayer.getHostile / objRoom.getHostileInState: the highest status on
 * structExitArrowsStatusProgression `[#clr, #inf]` among the room's actors is #inf. Statuses not on
 * that list (#fre, #spe) rank below #clr and never count.
 */
export function isHostileForExitArrows(miniMapStatuses: Iterable<string | undefined>): boolean {
  for (const status of miniMapStatuses) if (status === 'inf') return true
  return false
}

/**
 * drawExitArrowsOnImage: `true` -> #rdd, `false` or `[]` (no room there) -> #grn. getHostileInState
 * returns VOID rather than false for a visited clear room; taken as green.
 */
export function arrowColour(hostile: boolean): ArrowColour {
  return hostile ? 'rdd' : 'grn'
}

/**
 * objRoom.drawExitArrows: combine this room's edge tiles with the neighbours' facing edges, turn
 * the open runs into arrow strips and tile the arrow art along each, coloured by the neighbour.
 */
export function exitArrowsForRoom(
  myTiles: EdgeLists<ExitTile>,
  surroundingTiles: EdgeLists<ExitTile>,
  surroundingHostiles: Record<Edge, boolean>,
  tileSize: Vec,
  image: Size,
  art: Size = EXIT_ARROW_ART,
): ExitArrow[] {
  const arrows: ExitArrow[] = []
  for (const edge of EDGES) {
    const combined = combineExitTiles(surroundingTiles[edge], myTiles[edge])
    const colour = arrowColour(surroundingHostiles[edge])
    for (const rect of exitArrowRectsForEdge(exitTilesToRanges(combined, edge, tileSize), edge, image)) {
      for (const pos of imageDrawRepeatedPositions(art, rect)) arrows.push({ edge, colour, pos })
    }
  }
  return arrows
}
