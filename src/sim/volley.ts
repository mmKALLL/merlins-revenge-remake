// Remake volley spells (docs/notes/engine-mechanics-spells.md, Volley spells): a spell that fires a
// fan of an enemy's projectiles when released, one more for every chargePerShot of charge. The rules
// here are pure; tick-spell.ts fires the shots and tick-combat.ts lets them hit the first hostile.
import type { VolleyDef } from '../mr-open/mr-actor-data'
import { bulletStalled } from '../mr-open/mr-bullet'
import type { Vec } from '../mr-open/mr-geometry'
import { stepVelocity } from '../mr-open/mr-movement'

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
 * The angle (degrees off the aim) of projectile `index` of `count`. An #even fan spaces them equally
 * from one side to the other (one alone flies at the aim). A #random one sends the first straight at
 * the aim and every other one at a random angle inside the fan (`u` in [0, 1)).
 */
export function shotAngleDeg(index: number, count: number, v: VolleyDef, u: number): number {
  const spread = volleySpreadDeg(count, v)
  if (v.spread === 'even') return count === 1 ? 0 : -spread / 2 + (spread * index) / (count - 1)
  return index === 0 ? 0 : (u - 0.5) * spread
}

/** Whether projectile `index` flies exactly at the aim: the first of a #random fan, which keeps its speed too. */
const fliesTrue = (index: number, v: VolleyDef): boolean => v.spread === 'random' && index === 0

/** A projectile's speed factor, 1 +- speedJitter (`u` in [0, 1)); 1 for one that flies true. */
export const shotSpeedFactor = (index: number, v: VolleyDef, u: number): number => (fliesTrue(index, v) ? 1 : 1 + (u * 2 - 1) * v.speedJitter)

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

/** Bisection steps when solving for a landing speed (far below a pixel). */
const LANDING_SEARCH_STEPS = 40
/** A flight longer than this counts as never landing (a bullet without friction). */
const MAX_FLIGHT_TICKS = 1000

/**
 * How far a bullet launched at `vel` flies before it lands: objMoveXY's friction each tick, then
 * the move, until objBullet.checkStalled (skipped on its first frame) finds both axes slow;
 * Infinity when it never does.
 */
export function landingTravel(vel: Vec, friction: Vec): number {
  let v = vel
  let x = 0
  let y = 0
  for (let tick = 0; tick < MAX_FLIGHT_TICKS; tick++) {
    v = stepVelocity(v, { x: 0, y: 0 }, 0, friction)
    x += v.x
    y += v.y
    if (tick > 0 && bulletStalled(v)) return Math.hypot(x, y)
  }
  return Infinity
}

/**
 * Remake: a launch that explodes on landing is slowed so it lands on `aim` (the largest speed along
 * `launch` whose landing travel is not past the aim), never faster than `launch` itself (the spell's range).
 */
export function launchToLand(from: Vec, aim: Vec, launch: Vec, friction: Vec): Vec {
  const dist = Math.hypot(aim.x - from.x, aim.y - from.y)
  if (landingTravel(launch, friction) <= dist) return launch
  let lo = 0
  let hi = 1
  for (let i = 0; i < LANDING_SEARCH_STEPS; i++) {
    const mid = (lo + hi) / 2
    if (landingTravel({ x: launch.x * mid, y: launch.y * mid }, friction) <= dist) lo = mid
    else hi = mid
  }
  return { x: launch.x * lo, y: launch.y * lo }
}

/** `vel` turned by `deg` degrees and scaled by `factor`. */
export function turnAndScale(vel: Vec, deg: number, factor: number): Vec {
  const a = (deg * Math.PI) / 180
  const c = Math.cos(a)
  const s = Math.sin(a)
  return { x: (vel.x * c - vel.y * s) * factor, y: (vel.x * s + vel.y * c) * factor }
}

/** The most mini projectiles stacked over a charging volley; more show as a "+" beside the stack. */
export const ICON_STACK_MAX = 5
/** The longest side of a mini projectile, in game px. */
export const ICON_PX = 8
/** Each stacked icon sits this many px left of and below the one before (drawn over it). */
export const ICON_STEP = 2
/** Room around the stack inside the spell's ball. */
const BALL_MARGIN = 2

/** The stacked icons for `count` projectiles (at most ICON_STACK_MAX) and whether a "+" stands for the rest. */
export function volleyIconStack(count: number): { icons: number; more: boolean } {
  return { icons: Math.min(count, ICON_STACK_MAX), more: count > ICON_STACK_MAX }
}

/** The side of the square the stacked icons for `count` projectiles cover (0 for none). */
export function iconStackPx(count: number): number {
  const { icons } = volleyIconStack(count)
  return icons === 0 ? 0 : ICON_PX + ICON_STEP * (icons - 1)
}

/**
 * Remake: a volley spell's ball is at least as wide as its icon stack, so the icons sit inside it.
 * `stackCount` may be fractional (the projectiles the charge is growing toward), so the ball grows
 * smoothly while the icons themselves appear one by one.
 */
export function volleyBallPx(ballPx: number, stackCount: number): number {
  if (stackCount <= 0) return ballPx
  const icons = Math.min(stackCount, ICON_STACK_MAX)
  return Math.max(ballPx, ICON_PX + ICON_STEP * (icons - 1) + BALL_MARGIN)
}

/** The projectile count a charge is growing toward, unrounded (1 at no charge, capped at maxShots). */
export const smoothShots = (charge: number, v: VolleyDef): number => Math.min(v.maxShots, 1 + Math.max(0, charge) / v.chargePerShot)

/** Projectiles a volley spell stands for: what its charge would fire, or once released what is left to fire; 0 for any other spell. */
export function volleyShotsShown(mode: string, charge: number, v: VolleyDef | null, volley: { total: number; fired: number } | null): number {
  if (!v) return 0
  if (mode === 'charge') return volleyShots(charge, v)
  if (mode === 'volley' && volley) return volley.total - volley.fired
  return 0
}
