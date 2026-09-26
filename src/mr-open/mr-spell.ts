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
  const speed = a.chargeSpeed * caster.mana_flow
  return { start: Math.min(a.chargeStart + caster.mana_burst, max), max, speed: a.chargeSpeedMax === null ? speed : Math.min(speed, a.chargeSpeedMax) }
}

/**
 * calcAttackChargeMax's randomSummon branch (modAttack.txt:104-112): when the second stage is below
 * the max, the max becomes min(max, max * random(20) / 17 + random(stage 1)) + random(2) - 1, so an
 * AI summoner stops at a random stage (or short of the first: a plain blast). `randomInt` is Lingo random(n).
 */
export function randomSummonMax(max: number, a: AttackDef, randomInt: (n: number) => number): number {
  const [first, second] = a.multistage
  if (!a.randomSummon || !first || !second || second.chargeRequired - max >= 0) return max
  const temp = (max * randomInt(20)) / 17 + randomInt(first.chargeRequired)
  return Math.min(max, temp) + randomInt(2) - 1
}

/** modSpellMultistage.selectPayload: the last stage whose chargeRequired the charge has reached; null = blank. */
export function payloadFor(charge: number, a: AttackDef): string | null {
  let payload: string | null = null
  for (const stage of a.multistage) {
    if (stage.chargeRequired > charge) break
    payload = stage.payload
  }
  return payload
}

/** CounterOnce on the charge counter: pinned at max. */
export const chargeStep = (charge: number, speed: number, max: number): number => Math.min(max, charge + speed)

/** objCharacter.calcChargeLoc: the charge sprite sits at the caster's chargeLoc mirrored by facing. */
export function chargeLoc(caster: Vec, casterDef: ActorDef, facingLeft: boolean): Vec {
  return { x: caster.x + casterDef.chargeLoc.x * (facingLeft ? -1 : 1), y: caster.y + casterDef.chargeLoc.y }
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
 * calcCollisionVectSpell nudges a victim exactly on the centre by point(0,1) before taking the direction
 * (the speed still uses dist 0), so a direct hit pushes straight down (+y) with the full (radius + r) * power.
 */
export function explode(center: Vec, chargeAtRelease: number, a: AttackDef, victims: SplashVictim[]): Explosion {
  return explodeWithCharge(center, chargeAtRelease * a.chargeExplodeFactor, a, victims)
}

/**
 * The explosion itself for a final `charge` (calcAttackHitMagic / calcCollisionVectSpell): a spell's
 * charge after chargeExplodeFactor, or an #explode bullet's explodeCharge (modExploder.getCurrentCharge).
 */
export function explodeWithCharge(center: Vec, charge: number, a: AttackDef, victims: SplashVictim[]): Explosion {
  const radius = charge / 2
  const power = a.power
  if (typeof power !== 'number') throw new Error(`${a.name}: spell power must be a number`)
  const pushes: { id: number; push: Vec }[] = []
  for (const v of victims) {
    const dx = v.pos.x - center.x
    const dy = v.pos.y - center.y
    const dist = Math.hypot(dx, dy)
    if (dist * dist >= (radius + v.radius) ** 2) continue
    const speed = (radius + v.radius - dist) * power
    if (speed <= 0) continue
    // avoid locs being on top of each other: targetLoc + point(0,1)
    const dir = dist === 0 ? { x: 0, y: 1 } : { x: dx / dist, y: dy / dist }
    pushes.push({ id: v.id, push: { x: dir.x * speed, y: dir.y * speed } })
  }
  return { radius, pushes }
}
