// Port of objMine (energy mines) and modSpellMultistage.depositMines, and of modFireBullets'
// timing (docs/notes/engine-mechanics-spells.md §5).
import type { AttackDef } from './mr-actor-data'

/** objMine.new defaults (no mine data overrides them). */
export const MINE = {
  timeToPrime: 30, // ticks in #stand before it is #primed
  timeToCheck: 3, // ticks between trigger checks while #primed
  triggerRadius: 20, // px: the nearest hated unit closer than this sets it off
} as const

export const MINE_OBJ_TYPE = 'objMine'
/** The mine actor depositMines creates. */
export const ENERGY_MINE = 'energyMine'

/** depositMines: charge / chargePerUnit mines (a Lingo repeat up to a non-integer bound). */
export const mineCount = (charge: number, a: AttackDef): number => Math.floor(charge / a.chargePerUnit)

/** depositMines: each mine lands within VarRoughly(loc, charge / 2) of the spell on each axis. */
export const mineSpread = (charge: number): number => charge / 2

/**
 * modFireBullets: the fire delay counter (Counter over [1, fireDelay], reset after each bullet)
 * fires every ceil(fireDelay) ticks, the first that long after the release. Remake
 * (fireRateScale): that period / the scale, fractional, never under a tick.
 */
export const fireBulletsPeriod = (a: AttackDef): number => Math.max(1, Math.ceil(a.fireDelay) / a.fireRateScale)

/** modFireBullets.fireBullet: the charge after one more bullet, and whether that was the last. */
export function chargeAfterBullet(charge: number, a: AttackDef): { charge: number; last: boolean } {
  const left = charge - a.chargePerUnit
  return left < 0 ? { charge, last: true } : { charge: left, last: false }
}

/** performBeamAttack: the beam lands random(20) - 10 px off the target on each axis, in [-9, 10]. */
export const BEAM_JITTER = 20
