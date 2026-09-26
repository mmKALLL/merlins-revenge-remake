// Port of modMoveToLoc.moveHoriz/moveVert (acceleration) and objMoveXY.update
// (friction, clamp). Friction is a percentage of current speed per axis.
import type { Vec } from './mr-geometry'

/** act_player.txt: #walkAcceleration: 2 */
export const PLAYER_WALK_ACCELERATION = 2
/** objGameObject.txt: friction = point(50, 50) (percent) */
export const FRICTION_PERCENT: Vec = { x: 50, y: 50 }
/** modCollisionDetection.setMoveSpeedLimit: rect(-32,-32,32,32).inflate(-1,-1) */
export const MOVE_SPEED_LIMIT = 31

/**
 * One tick of velocity update. dir components are -1, 0 or 1.
 * Order matches objMoveXY.update: input, friction, clamp.
 *
 * Clamping differs slightly from the original: there `setMoveSpeedLimit` clamps only the
 * per-tick displacement and leaves the stored velocity unclamped, whereas this port clamps the
 * stored velocity itself. Under walking friction (steady state 2 px/tick, limit 31) the velocity
 * never reaches the limit. Once a hit has left the player on frictionReel (10 %), nav mode's
 * acceleration 6 would settle at 54 px/tick unclamped: the displacement is 31 px/tick either way,
 * only the slow-down after releasing the keys starts from 31 here instead of 54.
 */
export function stepVelocity(v: Vec, dir: Vec, accel: number, friction: Vec = FRICTION_PERCENT): Vec {
  let x = v.x + accel * dir.x
  let y = v.y + accel * dir.y
  // lostSpeed = PointValRange(pFriction, [0, speed]); pVect = PointTowardZero(pVect, lostSpeed)
  x = towardZero(x, Math.abs(x) * (friction.x / 100))
  y = towardZero(y, Math.abs(y) * (friction.y / 100))
  return { x: clamp(x, -MOVE_SPEED_LIMIT, MOVE_SPEED_LIMIT), y: clamp(y, -MOVE_SPEED_LIMIT, MOVE_SPEED_LIMIT) }
}

function towardZero(n: number, amount: number): number {
  if (n > 0) return Math.max(0, n - amount)
  if (n < 0) return Math.min(0, n + amount)
  return 0
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}
