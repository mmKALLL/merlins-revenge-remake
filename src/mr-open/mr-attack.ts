// Port of modWeaponManager cooldown counters (addCooldownCounter / updateCooldowns / resetCooldown /
// getCooldownFin), modAttack.calcAttackPowerMelee / calcCollisionVectMelee / calcAttackHitMelee /
// calcAttackLoc, objAiAttack.modifyLocWithEyestrain, the performRangedAttack firing vector,
// calcAttackPowerBullet and modSplashDamage.calcCollisionVectSplash.
import type { Rect, Vec } from './mr-geometry'
import type { ActorDef, AttackDef } from './mr-actor-data'
import { roughly, type Rng } from '../sim/rng'

/**
 * Cooldown representation: the engine keeps a counter that advances from 1 toward `attack.cooldown`
 * by `agility` (melee), `dexterity` (ranged) or `mana_regeneration` (magic) each tick and is "fin"
 * when it reaches the end. This port stores the *remaining* units instead: reset to `cooldown`,
 * subtract the increment each tick, ready when <= 0. Ticks to ready = ceil(cooldown / increment),
 * e.g. bow 200 / dexterity 10 = 20 ticks; sword cooldown 0 is ready at once.
 * Lingo counters start at 1 and finish when the count reaches the length, so the engine is ready one
 * step earlier, after ceil((cooldown - 1) / inc) ticks (the bow: 20 as well; cooldown 30 / 30: 1 vs 1,
 * but e.g. 30 / 1: 29 vs 30). This port keeps the simpler N-tick model deliberately.
 */
export function cooldownIncrement(def: ActorDef): number {
  const t = def.attack.type
  return t === 'melee' ? def.agility : t === 'ranged' ? def.dexterity : t === 'magic' ? def.mana_regeneration : 1
}
export const tickCooldown = (remaining: number, inc: number): number => Math.max(0, remaining - inc)
export const resetCooldown = (a: AttackDef): number => a.cooldown
export const cooldownReady = (remaining: number): boolean => remaining <= 0

const faceDir = (facingLeft: boolean): 1 | -1 => (facingLeft ? -1 : 1)

/** calcAttackLoc: strike point / bullet spawn = reg point + collisionLoc, x mirrored by facing. */
export function attackLoc(pos: Vec, a: AttackDef, facingLeft: boolean): Vec {
  return { x: pos.x + a.collisionLoc.x * faceDir(facingLeft), y: pos.y + a.collisionLoc.y }
}

/** calcCollisionVectMelee's #magicMelee scale: (strength + MAGIC_MELEE_CAPACITY_WEIGHT * mana_capacity) / MAGIC_MELEE_CAPACITY_WEIGHT. */
const MAGIC_MELEE_CAPACITY_WEIGHT = 1.5

/**
 * calcCollisionVectMelee: calcAttackPowerMelee (x mirrored by facing) times strength, or for a
 * #magicMelee attack (the energy punch) times (strength + 1.5 * mana_capacity) / 1.5.
 */
export function meleePush(def: ActorDef, facingLeft: boolean): Vec {
  const p = def.attack.power
  if (typeof p === 'number') throw new Error(`${def.key}: melee power must be a point`)
  const scale = def.attack.animType === 'magicMelee'
    ? (def.strength + MAGIC_MELEE_CAPACITY_WEIGHT * def.mana_capacity) / MAGIC_MELEE_CAPACITY_WEIGHT
    : def.strength
  return { x: p.x * faceDir(facingLeft) * scale, y: p.y * scale }
}

/** calcAttackHitMelee: hit iff the strike point is inside the target's sprite rect. */
export function meleeHits(attackerPos: Vec, def: ActorDef, facingLeft: boolean, targetRect: Rect): boolean {
  const circle = def.attack.strikeCircle
  if (circle) return circleMeetsRect(offsetFrom(attackerPos, circle.centre, facingLeft), circle.radius, targetRect)
  const s = attackLoc(attackerPos, def.attack, facingLeft)
  return s.x >= targetRect.left && s.x < targetRect.right && s.y >= targetRect.top && s.y < targetRect.bottom
}

/** A point offset from the reg point, x mirrored by facing (as calcAttackLoc mirrors collisionLoc). */
const offsetFrom = (pos: Vec, offset: Vec, facingLeft: boolean): Vec => ({ x: pos.x + offset.x * faceDir(facingLeft), y: pos.y + offset.y })

/** Remake strike circle (the sword's swing, a splash bullet's landing): the rect's closest point to the centre lies within the radius. */
export function circleMeetsRect(centre: Vec, radius: number, r: Rect): boolean {
  const dx = centre.x - Math.max(r.left, Math.min(centre.x, r.right))
  const dy = centre.y - Math.max(r.top, Math.min(centre.y, r.bottom))
  return dx * dx + dy * dy <= radius * radius
}

/** Reach as a radius; a point reach (the player's punch) is not a radius, so fall back to the struct default 25. */
const reachRadius = (a: AttackDef): number => (typeof a.reach === 'number' ? a.reach : 25)

/**
 * modifyLocWithEyestrain: integer error in [-e, e] per axis, e = integer(min(1, dist / reach) * eyestrain)
 * growing linearly from 0 at point blank to `eyestrain` at `reach`. Lingo integer() rounds to nearest.
 */
export function aimWithEyestrain(from: Vec, target: Vec, def: ActorDef, rng: Rng): [Vec, Rng] {
  const dist = Math.hypot(target.x - from.x, target.y - from.y)
  const reach = reachRadius(def.attack)
  const e = Math.round(Math.min(1, reach > 0 ? dist / reach : 1) * def.eyestrain)
  const [ex, r1] = roughly(rng, e)
  const [ey, r2] = roughly(r1, e)
  return [{ x: target.x + ex, y: target.y + ey }, r2]
}

/** performRangedAttack: bullet spawn point (calcAttackLoc) and initial velocity toward the aim point. */
export function rangedShot(from: Vec, aimAt: Vec, def: ActorDef, facingLeft: boolean): { spawn: Vec; vel: Vec } {
  const a = def.attack
  const spawn = attackLoc(from, a, facingLeft)
  const dx = aimAt.x - spawn.x
  const dy = aimAt.y - spawn.y
  // remake: shotSpeedScale (1 = engine)
  const k = a.shotSpeedScale
  if (a.firingType === 'fullstrength') {
    const d = Math.hypot(dx, dy) || 1
    return { spawn, vel: { x: (dx / d) * def.strength * k, y: (dy / d) * def.strength * k } }
  }
  return { spawn, vel: { x: (dx / 10) * k, y: (dy / 10) * k } }
}

/** calcAttackPowerBullet: impact push = bullet velocity * power (scalar). */
export function bulletPush(vel: Vec, bulletDef: ActorDef): Vec {
  const p = bulletDef.attack.power
  if (typeof p !== 'number') throw new Error(`${bulletDef.key}: bullet power must be a number`)
  return { x: vel.x * p, y: vel.y * p }
}

/**
 * modSplashDamage.calcCollisionVectSplash: CollisionCalcVect(targetLoc, attackLoc, power) with the
 * locs swapped against its parameters (attackLoc, targetLoc), so the push points from the victim
 * toward the impact, of length power - dist (SineDist: the plain distance); none at power or
 * farther. A victim on the impact gets dist 1 and direction (0, 1), as CollisionCalcVect does.
 */
export function splashPush(victim: Vec, impact: Vec, bulletDef: ActorDef): Vec {
  const power = bulletDef.attack.power
  if (typeof power !== 'number') throw new Error(`${bulletDef.key}: bullet power must be a number`)
  const on = victim.x === impact.x && victim.y === impact.y
  const dir = on ? { x: 0, y: 1 } : { x: impact.x - victim.x, y: impact.y - victim.y }
  const dist = on ? 1 : Math.hypot(dir.x, dir.y)
  const speed = power - dist
  if (speed <= 0) return { x: 0, y: 0 }
  return { x: (dir.x / dist) * speed, y: (dir.y / dist) * speed }
}
