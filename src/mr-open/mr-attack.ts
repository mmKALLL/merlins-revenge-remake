// Port of modWeaponManager cooldown counters (addCooldownCounter / updateCooldowns / resetCooldown /
// getCooldownFin), modAttack.calcAttackPowerMelee / calcCollisionVectMelee / calcAttackHitMelee /
// calcAttackLoc, objAiAttack.modifyLocWithEyestrain, the performRangedAttack firing vector and
// calcAttackPowerBullet.
import type { Rect, Vec } from './mr-geometry'
import type { ActorDef, AttackDef } from './mr-actor-data'
import { roughly, type Rng } from '../sim/rng'

/**
 * Cooldown representation: the engine keeps a counter that advances from 1 toward `attack.cooldown`
 * by `agility` (melee), `dexterity` (ranged) or `mana_regeneration` (magic) each tick and is "fin"
 * when it reaches the end. This port stores the *remaining* units instead: reset to `cooldown`,
 * subtract the increment each tick, ready when <= 0. Ticks to ready = ceil(cooldown / increment),
 * e.g. bow 200 / dexterity 10 = 20 ticks; sword cooldown 0 is ready at once.
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

/** calcAttackPowerMelee * strength: the push vector applied to the victim, x mirrored by facing. */
export function meleePush(def: ActorDef, facingLeft: boolean): Vec {
  const p = def.attack.power
  if (typeof p === 'number') throw new Error(`${def.key}: melee power must be a point`)
  return { x: p.x * faceDir(facingLeft) * def.strength, y: p.y * def.strength }
}

/** calcAttackHitMelee: hit iff the strike point is inside the target's sprite rect. */
export function meleeHits(attackerPos: Vec, def: ActorDef, facingLeft: boolean, targetRect: Rect): boolean {
  const s = attackLoc(attackerPos, def.attack, facingLeft)
  return s.x >= targetRect.left && s.x < targetRect.right && s.y >= targetRect.top && s.y < targetRect.bottom
}

/** Reach as a radius; a point reach (the player's punch) is not a radius, so fall back to the struct default 25. */
const reachRadius = (a: AttackDef): number => (typeof a.reach === 'number' ? a.reach : 25)

/** modifyLocWithEyestrain: integer error in [-e, e] per axis, e growing linearly from 0 at point blank to `eyestrain` at `reach`. */
export function aimWithEyestrain(from: Vec, target: Vec, def: ActorDef, rng: Rng): [Vec, Rng] {
  const dist = Math.hypot(target.x - from.x, target.y - from.y)
  const reach = reachRadius(def.attack)
  const e = Math.floor(Math.min(1, reach > 0 ? dist / reach : 1) * def.eyestrain)
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
  if (a.firingType === 'fullstrength') {
    const d = Math.hypot(dx, dy) || 1
    return { spawn, vel: { x: (dx / d) * def.strength, y: (dy / d) * def.strength } }
  }
  return { spawn, vel: { x: dx / 10, y: dy / 10 } }
}

/** calcAttackPowerBullet: impact push = bullet velocity * power (scalar). */
export function bulletPush(vel: Vec, bulletDef: ActorDef): Vec {
  const p = bulletDef.attack.power
  if (typeof p !== 'number') throw new Error(`${bulletDef.key}: bullet power must be a number`)
  return { x: vel.x * p, y: vel.y * p }
}
