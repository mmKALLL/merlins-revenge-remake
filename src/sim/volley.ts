// Remake volley spells (docs/notes/engine-mechanics-spells.md, Volley spells): a spell that fires a
// fan of an enemy's projectiles when released, one more for every chargePerShot of charge. The rules
// here are pure; tick-spell.ts fires the shots and tick-combat.ts lets them hit the first hostile.
import type { AttackDef, VolleyDef } from '../mr-open/mr-actor-data'
import { bulletStalled } from '../mr-open/mr-bullet'
import type { Vec } from '../mr-open/mr-geometry'
import { stepVelocity } from '../mr-open/mr-movement'

/** Keeps a charge sitting exactly on a threshold (the charge max) from rounding down a projectile. */
const THRESHOLD_EPSILON = 1e-9

/** Projectiles a volley released at `charge` fires: one per chargePerShot (none below the first), at most maxShots. */
export function volleyShots(charge: number, v: VolleyDef): number {
  const levels = Math.floor(Math.max(0, charge) / v.chargePerShot + THRESHOLD_EPSILON)
  return Math.min(v.maxShots, levels)
}

/**
 * The charge at which the volley is full, so the charge max stops there: where it reaches maxShots, or
 * its own fullCharge when the charge does more (a fireball's blast grows on past its one projectile).
 */
export const volleyFullCharge = (v: VolleyDef): number => (v.fullCharge > 0 ? v.fullCharge : v.maxShots * v.chargePerShot)

/** Remake (blastFromCharge): a projectile's explodeCharge for the spell's charge as it fires; null keeps the bullet's own. */
export function blastCharge(charge: number, v: VolleyDef): number | null {
  const b = v.blastFromCharge
  return b ? b.base + Math.max(0, charge) * b.perCharge : null
}

/** Remake (blastFromCharge): a projectile's damage factor for the spell's charge as it fires; 1 without a grown blast. */
export function blastDamageFactor(charge: number, v: VolleyDef): number {
  const b = v.blastFromCharge
  return b ? b.damageBase + Math.max(0, charge) * b.damagePerCharge : 1
}

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
 * `launch` whose landing travel is not past the aim), never faster than `launch` itself (the spell's range)
 * and never slower than `minShare` of it (a close aim is overshot).
 */
export function launchToLand(from: Vec, aim: Vec, launch: Vec, friction: Vec, minShare: number): Vec {
  const dist = Math.hypot(aim.x - from.x, aim.y - from.y)
  if (landingTravel(launch, friction) <= dist) return launch
  let lo = minShare
  let hi = 1
  for (let i = 0; i < LANDING_SEARCH_STEPS; i++) {
    const mid = (lo + hi) / 2
    if (landingTravel({ x: launch.x * mid, y: launch.y * mid }, friction) <= dist) lo = mid
    else hi = mid
  }
  return { x: launch.x * lo, y: launch.y * lo }
}

/** modFreeze's payload function, which a chilling volley adds before its projectile's own. */
const FREEZE_PAYLOAD = 'takeFreeze'

/**
 * The attack a volley projectile fired at `charge` carries: its bullet's own (push, payload,
 * explosion), with the spell's hit roles and the volley's damageMultiplier on top of the bullet's,
 * and a blastFromCharge volley's explodeCharge; a chilling volley (remake, `chill` > 0) also
 * freezes what it hits, as the arctic blast does, glowing teal.
 */
export function volleyProjectileAttack(bullet: AttackDef, hits: string[], v: VolleyDef, charge: number): AttackDef {
  const explodeCharge = blastCharge(charge, v) ?? bullet.explodeCharge
  const blastFalloff = v.blastFromCharge?.falloff ?? bullet.blastFalloff
  const attack = { ...bullet, hits, damageMultiplier: bullet.damageMultiplier * v.damageMultiplier * blastDamageFactor(charge, v), explodeCharge, blastFalloff }
  if (v.chill <= 0) return attack
  const others = bullet.payloadFunction.filter((fn) => fn !== FREEZE_PAYLOAD)
  return { ...attack, payloadFunction: [FREEZE_PAYLOAD, ...others], freezeMultiplier: v.chill, glowTeal: true }
}

/** `vel` turned by `deg` degrees and scaled by `factor`. */
export function turnAndScale(vel: Vec, deg: number, factor: number): Vec {
  const a = (deg * Math.PI) / 180
  const c = Math.cos(a)
  const s = Math.sin(a)
  return { x: (vel.x * c - vel.y * s) * factor, y: (vel.x * s + vel.y * c) * factor }
}

/** Mini projectiles in one diagonal row over a charging volley; more start another row (owner). */
export const ICONS_PER_ROW = 5
/** The longest side of a mini projectile, in game px. */
export const ICON_PX = 8
/** Each stacked icon sits this many px left of and below the one before (drawn over it). */
export const ICON_STEP = 2
/** Each next row of icons starts over at the first icon's place, shifted this much (owner: +2 x, +1 y). */
export const ICON_ROW_SHIFT = { x: 2, y: 1 } as const
/** Room around the stack inside the spell's ball. */
const BALL_MARGIN = 4

/** The rows the icons for `count` projectiles take, one icon each (0 for none). */
export const iconRows = (count: number): number => Math.ceil(Math.max(0, count) / ICONS_PER_ROW)

/** The side of the square one row's diagonal covers: the first row's, as the later rows sit beside it. */
export const iconRowPx = (count: number): number => ICON_PX + ICON_STEP * (Math.min(count, ICONS_PER_ROW) - 1)

/** The width and height the stacked icons for `count` projectiles cover (0 for none). */
export function iconStackSize(count: number): { w: number; h: number } {
  const rows = iconRows(count)
  if (rows === 0) return { w: 0, h: 0 }
  const side = iconRowPx(count)
  return { w: side + ICON_ROW_SHIFT.x * (rows - 1), h: side + ICON_ROW_SHIFT.y * (rows - 1) }
}

/** The longer side the stacked icons for `count` projectiles cover (0 for none): what the ball must hold. */
export function iconStackPx(count: number): number {
  const { w, h } = iconStackSize(count)
  return Math.max(w, h)
}

/**
 * Remake (growingIconPx): a single-projectile volley's icon width, growing from ICON_PX at no charge
 * to growingIconPx at the full charge; ICON_PX for the others.
 */
export function volleyIconPx(charge: number, v: VolleyDef): number {
  if (v.growingIconPx <= 0) return ICON_PX
  const share = Math.min(1, Math.max(0, charge) / volleyFullCharge(v))
  return ICON_PX + (v.growingIconPx - ICON_PX) * share
}

/** The ball's diameter at no charge: room for one icon. */
const MIN_BALL_PX = ICON_PX + BALL_MARGIN

/**
 * The ball's diameter at full charge: charge x chargeSize, but at least big enough that the linear
 * growth from MIN_BALL_PX holds every icon stack by the time its projectile is charged.
 */
function fullBallPx(chargeSize: number, v: VolleyDef): number {
  let px = volleyFullCharge(v) * chargeSize
  for (let n = 1; n <= v.maxShots; n++) {
    const needed = iconStackPx(n) + BALL_MARGIN
    px = Math.max(px, MIN_BALL_PX + ((needed - MIN_BALL_PX) * v.maxShots) / n)
  }
  return px
}

/**
 * Remake: a volley spell's ball grows linearly with the charge, as the energy blast's does, from room
 * for one icon to its full size, so the icons (which appear one by one) always sit inside it.
 */
export function volleyBallPx(charge: number, chargeSize: number, v: VolleyDef): number {
  const share = Math.min(1, Math.max(0, charge) / volleyFullCharge(v))
  return MIN_BALL_PX + (fullBallPx(chargeSize, v) - MIN_BALL_PX) * share
}

/** Projectiles a volley spell stands for: what its charge would fire, or once released what is left to fire; 0 for any other spell. */
export function volleyShotsShown(mode: string, charge: number, v: VolleyDef | null, volley: { total: number; fired: number } | null): number {
  if (!v) return 0
  if (mode === 'charge') return volleyShots(charge, v)
  if (mode === 'volley' && volley) return volley.total - volley.fired
  return 0
}
