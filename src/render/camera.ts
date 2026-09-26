import type { Vec } from '../mr-open/mr-map-format'

export type CameraMode = 'room' | 'follow'
export interface Size { w: number; h: number }
export interface RectPx { left: number; top: number; right: number; bottom: number }

/** Top-left world pixel shown at the top-left of the play view. */
export function cameraOrigin(mode: CameraMode, roomRect: RectPx, player: Vec, view: Size, world: Size): Vec {
  if (mode === 'room') return { x: roomRect.left, y: roomRect.top }
  const x = Math.round(player.x - view.w / 2)
  const y = Math.round(player.y - view.h / 2)
  return {
    x: Math.max(0, Math.min(world.w - view.w, x)),
    y: Math.max(0, Math.min(world.h - view.h, y)),
  }
}

/** Largest integer zoom at which the logical screen fits the window (never below 1). */
export function chooseZoom(logical: Size, window: Size): number {
  return Math.max(1, Math.floor(Math.min(window.w / logical.w, window.h / logical.h)))
}
