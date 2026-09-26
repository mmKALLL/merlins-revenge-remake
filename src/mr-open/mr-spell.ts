// Port of the energy blast: modAttack.calcAttackChargeMax / calcAttackChargeStart / calcAttackChargeSpeed,
// objCharacter.calcChargeLoc, objSpell.releaseNormal (GeomMoveVector), objMoveXY.finishConditionMet
// (PointArrivedAtTarget) and objSpell.goMode(#explode) + modAttack calcAttackHit/calcCollisionVect for
// #magic (circle-vs-circle splash with linear falloff).
import type { Vec } from './mr-geometry'
import type { ActorDef, AttackDef } from './mr-actor-data'

export interface ChargeLimits {
  start: number
  max: number
  speed: number
}

/** Charge counter parameters for a caster. `magicLimitPercent` is magicLimitMaster.getMagicLimit (only with limitMagic). */
export function chargeLimits(caster: ActorDef, magicLimitPercent = 100): ChargeLimits {
  const a = caster.attack
  let max = Math.min(a.chargeMax, caster.mana_capacity * a.chargeMaxModifier + a.chargeMaxBasic)
  if (a.limitMagic) max = (max * magicLimitPercent) / 100
  return { start: Math.min(a.chargeStart + caster.mana_burst, max), max, speed: a.chargeSpeed * caster.mana_flow }
}

/** CounterOnce on the charge counter: pinned at max. */
export const chargeStep = (charge: number, speed: number, max: number): number => Math.min(max, charge + speed)

/** objCharacter.calcChargeLoc: the charge sprite sits at collisionLoc mirrored by facing. */
export function chargeLoc(caster: Vec, casterDef: ActorDef, facingLeft: boolean): Vec {
  return { x: caster.x + casterDef.attack.collisionLoc.x * (facingLeft ? -1 : 1), y: caster.y + casterDef.attack.collisionLoc.y }
}

/** GeomMoveVector: velocity of length `speed` toward the release point. */
export function releaseVelocity(from: Vec, to: Vec, speed: number): Vec {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const d = Math.hypot(dx, dy) || 1
  return { x: (dx / d) * speed, y: (dy / d) * speed }
}

/** PointArrivedAtTarget: passed (or on) the target on every axis of travel. */
export function arrivedAtTarget(pos: Vec, target: Vec, vel: Vec): boolean {
  const px = vel.x === 0 || Math.sign(target.x - pos.x) !== Math.sign(vel.x)
  const py = vel.y === 0 || Math.sign(target.y - pos.y) !== Math.sign(vel.y)
  return px && py
}

export interface SplashVictim {
  id: number
  pos: Vec
  /** sprite width / 2 (objGameObject.getRadius) */
  radius: number
}

export interface Explosion {
  radius: number
  pushes: { id: number; push: Vec }[]
}

/**
 * objSpell.goMode(#explode): charge *= chargeExplodeFactor; splash radius = charge / 2; each victim
 * with dist < radius + its radius gets a push of length (radius + r - dist) * power away from the centre.
 */
export function explode(center: Vec, chargeAtRelease: number, a: AttackDef, victims: SplashVictim[]): Explosion {
  const charge = chargeAtRelease * a.chargeExplodeFactor
  const radius = charge / 2
  const power = typeof a.power === 'number' ? a.power : 1
  const pushes: { id: number; push: Vec }[] = []
  for (const v of victims) {
    const dx = v.pos.x - center.x
    const dy = v.pos.y - center.y
    const dist = Math.hypot(dx, dy)
    if (dist * dist >= (radius + v.radius) ** 2) continue
    const speed = (radius + v.radius - dist) * power
    if (speed <= 0) continue
    const d = dist || 1
    pushes.push({ id: v.id, push: { x: (dx / d) * speed, y: (dy / d) * speed } })
  }
  return { radius, pushes }
}
