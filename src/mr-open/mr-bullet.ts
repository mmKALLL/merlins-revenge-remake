// Port of objBullet.updateFly pieces: checkStalled (stallSpeed point(2,2)) and
// checkCollisionWithTarget via the general function CollisionCheck (target reg point inside the
// bullet's collision rect grown by the target's collision rect offsets). Flight itself is the normal
// objMoveXY friction path (friction point(5,5) percent); tile collision stops the arrow (the tick
// uses resolveTileCollision and zeroes the velocity on any push).
import type { Rect, Vec } from './mr-geometry'

/** objBullet stallSpeed: both axes under 2 px/tick -> #bulletLanded. */
export const BULLET_STALL_SPEED = 2
/** Ticks a landed arrow stays visible before removal (not in the export; the engine plays its `land` strip once). */
export const LANDED_TICKS = 30

/**
 * CollisionCheck(bullet, target): `bulletRect` is the bullet's collision rect in world px,
 * `targetCr` the target's collision rect *offsets* relative to its reg point (e.g. -16..16).
 */
export function bulletHits(bulletRect: Rect, targetPos: Vec, targetCr: Rect): boolean {
  const grown = {
    left: bulletRect.left + targetCr.left,
    top: bulletRect.top + targetCr.top,
    right: bulletRect.right + targetCr.right,
    bottom: bulletRect.bottom + targetCr.bottom,
  }
  return targetPos.x >= grown.left && targetPos.x < grown.right && targetPos.y >= grown.top && targetPos.y < grown.bottom
}

/** checkStalled: both axes below 2 px/tick -> landed. */
export const bulletStalled = (vel: Vec): boolean => Math.abs(vel.x) < BULLET_STALL_SPEED && Math.abs(vel.y) < BULLET_STALL_SPEED
