// The play view the camera shows, as pure data shared by the renderer (where to draw) and the sim
// (Merlin's nearest-enemy shot only aims at what is on screen). The camera follows the world mode:
// the room camera for rooms, the follow camera for the continuous world. The view is one of the
// map's rooms, so its size comes from the map (engine notes walking-and-rooms §8).
import { TILE_PX, type Rect, type Vec } from '../mr-open/mr-geometry'
import type { MapDefinition } from '../mr-open/mr-map-format'
import type { SimState, WorldMode } from './state'

export type CameraMode = 'room' | 'follow'
export interface Size { w: number; h: number }

/** The original's standard room, 18x9 tiles (43 of the archive's 52 maps). */
export const STANDARD_ROOM: Vec = { x: 18, y: 9 }
/** The play view of a standard room, 576x288 px. */
export const PLAY_VIEW: Size = { w: STANDARD_ROOM.x * TILE_PX, h: STANDARD_ROOM.y * TILE_PX }
/**
 * Remake: a room this many times the standard room's width or height is a picture to walk around
 * rather than a screen (the merlinart maps' single rooms, 35x18 to 64x64 tiles); the archive's
 * other rooms are 16 or 18 tiles wide and 9 or 12 high.
 */
const HUGE_ROOM_FACTOR = 2

/** Remake: a map of huge rooms is played in the open world only; the room camera is not offered. */
export const openWorldOnly = (map: MapDefinition): boolean =>
  map.roomSize.x >= HUGE_ROOM_FACTOR * STANDARD_ROOM.x || map.roomSize.y >= HUGE_ROOM_FACTOR * STANDARD_ROOM.y

/**
 * The play view for a map: one room at 32 px tiles, as the original drew it (objRoom.getImageSize
 * at roomPlayScale 1), so a 16x9 room is narrower than the standard view and a 16x12 one taller.
 * A map played in the open world only shows the standard view.
 */
export function playViewFor(map: MapDefinition): Size {
  if (openWorldOnly(map)) return PLAY_VIEW
  return { w: map.roomSize.x * TILE_PX, h: map.roomSize.y * TILE_PX }
}

/** The camera a map is played with when the player asks for `wanted`: the follow camera on an open-world-only map. */
export const cameraFor = (map: MapDefinition, wanted: CameraMode): CameraMode => (openWorldOnly(map) ? 'follow' : wanted)

export const cameraForWorld = (mode: WorldMode): CameraMode => (mode === 'continuous' ? 'follow' : 'room')

/** Top-left world pixel shown at the top-left of the play view. */
export function cameraOrigin(mode: CameraMode, roomRect: Rect, player: Vec, view: Size, world: Size): Vec {
  if (mode === 'room') return { x: roomRect.left, y: roomRect.top }
  const x = Math.round(player.x - view.w / 2)
  const y = Math.round(player.y - view.h / 2)
  return {
    x: Math.max(0, Math.min(world.w - view.w, x)),
    y: Math.max(0, Math.min(world.h - view.h, y)),
  }
}

/** The world rect the camera of `s`'s world mode shows with Merlin at `player`. */
export function viewRect(s: SimState, player: Vec, view: Size): Rect {
  const world = { w: s.grid.widthTiles * TILE_PX, h: s.grid.heightTiles * TILE_PX }
  const o = cameraOrigin(cameraForWorld(s.worldMode), s.grid.roomRectPx(s.room), player, view, world)
  return { left: o.x, top: o.y, right: o.x + view.w, bottom: o.y + view.h }
}

export const insideRect = (p: Vec, r: Rect): boolean => p.x >= r.left && p.x < r.right && p.y >= r.top && p.y < r.bottom
