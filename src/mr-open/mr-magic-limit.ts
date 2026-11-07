// Port of objMagicLimit and magicLimitMaster (docs/notes/engine-mechanics-spells.md, "Magic
// limiters"): a limiter placed on the map caps the charge of the #limitMagic spells
// (modAttack.calcAttackChargeMax, modAttack.txt:94-98) while it is in play.

/** objMagicLimit: a map object (ancestor objGameObject, drawn by modAnimSet) that sets the magic limit. */
export const MAGIC_LIMIT_OBJ_TYPE = 'objMagicLimit'

/** magicLimitMaster's default, the movie's gMagicLimit (set outside the exported casts): no limit. */
export const DEFAULT_MAGIC_LIMIT = 100

/**
 * The magic limit after limiters leave and enter play: any one finishing resets it to the default
 * (objMagicLimit.finish -> setMagicLimitToDefault), then each one created sets its own percentage
 * (objMagicLimit.init -> setMagicLimit), so the last created wins.
 */
export function magicLimitAfter(limit: number, finished: readonly number[], started: readonly number[]): number {
  const reset = finished.length > 0 ? DEFAULT_MAGIC_LIMIT : limit
  return started.length > 0 ? started[started.length - 1]! : reset
}
