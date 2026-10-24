// The mini-map: modMiniMap (an objMap module) with its cast images miniClear, miniCurrent,
// miniFriendly, miniInfested and miniSpecial (docs/notes/engine-mechanics-minimap.md). One cell per
// room, coloured by the room's minimap status; the current room is solid yellow.
import type { Vec } from './mr-geometry'
import type { MiniMapStatus } from './mr-map-clear'

/**
 * A cell of the map: a room's status, or #cur for the current room (modMiniMap.getMiniMapData);
 * remake: 'exit' for a roguelite floor's exit room.
 */
export type MiniMapCell = MiniMapStatus | 'cur' | 'exit'

export interface MiniMapBorder { left: number; top: number; right: number; bottom: number }

/** modMiniMap.addModParams. */
export interface MiniMapParams {
  /** #blendDistances: px from the map's corner to the mouse or Merlin (the nearer), mapped onto blendLevels */
  blendDistances: [near: number, far: number]
  /** #blendLevels: sprite blend in percent at those distances (clamped beyond them) */
  blendLevels: [near: number, far: number]
  /** #border: black margin around the cells, in map image px */
  border: MiniMapBorder
  /** #scale: screen px per map image px */
  scale: number
  /** width and height of the status images (miniClear.rect), in map image px */
  cellPx: number
}

export const MINI_MAP: MiniMapParams = {
  blendDistances: [60, 200],
  blendLevels: [10, 90],
  border: { left: 1, top: 1, right: 2, bottom: 2 },
  scale: 2,
  cellPx: 4,
}

/** Colour of every pixel of a status image, row by row (cellPx x cellPx). */
export type CellImage = number[][]

const BLACK = 0x000000

/**
 * miniClear, miniInfested, miniFriendly, miniSpecial: black top row and left column (the grid
 * lines between rooms), a light 2x2 centre, a dark right column and bottom row.
 */
function bevelledCell(light: number, dark: number): CellImage {
  const last = MINI_MAP.cellPx - 1
  return Array.from({ length: MINI_MAP.cellPx }, (_, y) =>
    Array.from({ length: MINI_MAP.cellPx }, (_, x) => (x === 0 || y === 0 ? BLACK : x === last || y === last ? dark : light)))
}

/** miniCurrent's colour. */
export const CURRENT_COLOUR = 0xffff00

/** miniCurrent: solid yellow. */
const solidCell = (colour: number): CellImage =>
  Array.from({ length: MINI_MAP.cellPx }, () => Array<number>(MINI_MAP.cellPx).fill(colour))

/** modMiniMap pStatusImages, with the colours of the archive's gfx/miniMap images. */
export const CELL_IMAGES: Record<MiniMapCell, CellImage> = {
  clr: bevelledCell(0x00ff00, 0x009a00),
  inf: bevelledCell(0xff0000, 0x9a0000),
  fre: bevelledCell(0x3c3bff, 0x1e1e80),
  spe: bevelledCell(0xffff00, 0xff9a00),
  cur: solidCell(CURRENT_COLOUR),
  // remake (roguelite): the exit room in miniSpecial's yellow bevel
  exit: bevelledCell(0xffff00, 0xff9a00),
}

/** modMiniMap.drawMap: the map image's size, cells plus border, in map image px. */
export function miniMapImageSize(mapSize: Vec, p: MiniMapParams = MINI_MAP): Vec {
  return {
    x: mapSize.x * p.cellPx + p.border.left + p.border.right,
    y: mapSize.y * p.cellPx + p.border.top + p.border.bottom,
  }
}

/** modMiniMap.drawMap: top-left of a room's cell (1-based room) in map image px. */
export function cellOrigin(room: Vec, p: MiniMapParams = MINI_MAP): Vec {
  return { x: p.border.left + (room.x - 1) * p.cellPx, y: p.border.top + (room.y - 1) * p.cellPx }
}

/** GeomPixelDist: the larger of the horizontal and vertical distances. */
export const pixelDistance = (a: Vec, b: Vec): number => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))

/** VarMapRange: `value` in `from` mapped linearly onto `to`, clamped to its ends. */
export function mapRange(value: number, from: [number, number], to: [number, number]): number {
  const t = (value - from[0]) / (from[1] - from[0])
  if (t <= 0) return to[0]
  if (t >= 1) return to[1]
  return to[0] + t * (to[1] - to[0])
}

/**
 * modMiniMap.setBlendForMouseOrPlayer: the sprite's blend (percent) from the nearer of the mouse
 * and Merlin to the map's registration point, its bottom-right corner. No mouse: Merlin alone.
 */
export function miniMapBlend(corner: Vec, player: Vec, mouse: Vec | null, p: MiniMapParams = MINI_MAP): number {
  const dist = Math.min(pixelDistance(player, corner), mouse ? pixelDistance(mouse, corner) : Infinity)
  return mapRange(dist, p.blendDistances, p.blendLevels)
}

/**
 * Remake: the screen px per map image px. The engine's #scale when the map fits the play view at it,
 * else the largest whole scale that fits (at least 1). At scale 2 the view's 288 px hold 34 rooms
 * down, so only maps far taller than the 3x12 tower would shrink.
 */
export function fitScale(imageSize: Vec, view: { w: number; h: number }, p: MiniMapParams = MINI_MAP): number {
  const fits = Math.floor(Math.min(view.w / imageSize.x, view.h / imageSize.y))
  return Math.max(1, Math.min(p.scale, fits))
}
