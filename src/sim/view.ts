// The play view the camera shows, as pure data shared by the renderer (where to draw) and the sim
// (Merlin's nearest-enemy shot only aims at what is on screen). The camera follows the world mode:
// the room camera for rooms, the follow camera for the continuous world.
import { TILE_PX, type Rect, type Vec } from '../mr-open/mr-geometry'
import type { SimState, WorldMode } from './state'

export type CameraMode = 'room' | 'follow'
export interface Size { w: number; h: number }

/** The play view in px (one room of the original's 18x9 tiles). */
export const PLAY_VIEW: Size = { w: 576, h: 288 }

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
