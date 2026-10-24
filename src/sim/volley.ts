// Remake volley spells (docs/notes/engine-mechanics-spells.md, Volley spells): a spell that fires a
// fan of an enemy's projectiles when released, one more for every chargePerShot of charge. The rules
// here are pure; tick-spell.ts fires the shots and tick-combat.ts lets them hit the first hostile.
import type { VolleyDef } from '../mr-open/mr-actor-data'
import type { Vec } from '../mr-open/mr-geometry'

/** Keeps a charge sitting exactly on a threshold (the charge max) from rounding down a projectile. */
const THRESHOLD_EPSILON = 1e-9

/** Projectiles a volley released at `charge` fires: 1, +1 per chargePerShot, at most maxShots. */
export function volleyShots(charge: number, v: VolleyDef): number {
  const levels = Math.floor(Math.max(0, charge) / v.chargePerShot + THRESHOLD_EPSILON)
  return Math.min(v.maxShots, 1 + levels)
}

/** The charge at which the volley reaches maxShots; charging further adds nothing, so the charge max stops there. */
export const volleyFullCharge = (v: VolleyDef): number => (v.maxShots - 1) * v.chargePerShot

/** Below this many projectiles the fan keeps its narrowest width. */
const NARROW_SHOTS = 2

/** Total fan width in degrees for `count` projectiles: spreadMinDeg up to 2, growing linearly to spreadMaxDeg at maxShots. */
export function volleySpreadDeg(count: number, v: VolleyDef): number {
  if (count <= NARROW_SHOTS || v.maxShots <= NARROW_SHOTS) return v.spreadMinDeg
  const share = Math.min(1, (count - NARROW_SHOTS) / (v.maxShots - NARROW_SHOTS))
  return v.spreadMinDeg + (v.spreadMaxDeg - v.spreadMinDeg) * share
}

/**
 * The angle (degrees off the aim) of projectile `index` of `count`: the fan is cut into `count`
 * equal slots swept from one side to the other, and the projectile takes a random point of its own
 * slot (`u` in [0, 1)), so the fan stays even and inside +-spread / 2.
 */
export function shotAngleDeg(index: number, count: number, v: VolleyDef, u: number): number {
  const spread = volleySpreadDeg(count, v)
  const slot = spread / count
  return -spread / 2 + slot * (index + u)
}

/** A projectile's speed factor, 1 +- speedJitter (`u` in [0, 1)). */
export const shotSpeedFactor = (v: VolleyDef, u: number): number => 1 + (u * 2 - 1) * v.speedJitter

/** Whether projectile number `fired` (0-based) is due `age` ticks after the release: one every staggerTicks, the first at once. */
export const shotDue = (age: number, fired: number, v: VolleyDef): boolean => age >= fired * v.staggerTicks

/**
 * The launch velocity toward `aim`, before the fan angle and the jitter: performRangedAttack's
 * #fullstrength (a vector of length `strength`) or #proportional (distance / 10), times rangeFactor.
 */
export function volleyLaunch(from: Vec, aim: Vec, strength: number, firingType: 'proportional' | 'fullstrength', v: VolleyDef): Vec {
  const dx = aim.x - from.x
  const dy = aim.y - from.y
  if (firingType === 'proportional') return { x: (dx / 10) * v.rangeFactor, y: (dy / 10) * v.rangeFactor }
  const d = Math.hypot(dx, dy) || 1
  const speed = strength * v.rangeFactor
  return { x: (dx / d) * speed, y: (dy / d) * speed }
}

/** `vel` turned by `deg` degrees and scaled by `factor`. */
export function turnAndScale(vel: Vec, deg: number, factor: number): Vec {
  const a = (deg * Math.PI) / 180
  const c = Math.cos(a)
  const s = Math.sin(a)
  return { x: (vel.x * c - vel.y * s) * factor, y: (vel.x * s + vel.y * c) * factor }
}
