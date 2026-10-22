// Port of modFreeze (docs/notes/engine-mechanics-spells.md §5, Freeze): the #takeFreeze payload.
import type { Vec } from './mr-geometry'

/** takeFreeze: freezeTime = (|vx| + |vy|) * freezeMultiplier * 4. */
const FROZEN_TICKS_PER_PUSH = 4
/** takeFreeze halves the walk speed (or Merlin's acceleration); defrost restores it. */
export const FROZEN_SPEED_FACTOR = 0.5

/**
 * The frozen ticks left after a freeze with this push. The first freeze resets pFreezeCounter and
 * sets it to 999 of 1000 before taking the freeze time off, so it lasts 1 + freezeTime ticks; a
 * freeze while frozen only takes more off (lengthens it).
 */
export function freezeTicksAfter(ticksLeft: number, push: Vec, freezeMultiplier: number): number {
  const freezeTime = (Math.abs(push.x) + Math.abs(push.y)) * freezeMultiplier * FROZEN_TICKS_PER_PUSH
  return (ticksLeft > 0 ? ticksLeft : 1) + freezeTime
}

/** A walk speed (or acceleration) while frozen or not. */
export const speedWhileFrozen = (speed: number, frozen: boolean): number => (frozen ? speed * FROZEN_SPEED_FACTOR : speed)
