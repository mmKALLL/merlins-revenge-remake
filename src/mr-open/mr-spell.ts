// Port of the energy blast: modAttack.calcAttackChargeMax / calcAttackChargeStart / calcAttackChargeSpeed,
// objCharacter.calcChargeLoc, objSpell.releaseNormal (GeomMoveVector), objMoveXY.finishConditionMet
// (PointArrivedAtTarget) and objSpell.goMode(#explode) + modAttack calcAttackHit/calcCollisionVect for
// #magic (circle-vs-circle splash with linear falloff).
import type { Vec } from './mr-geometry'
import type { ActorDef, AttackDef } from './mr-actor-data'
import { volleyFullCharge } from '../sim/volley'

export interface ChargeLimits {
  start: number
  max: number
  speed: number
}

/**
 * Charge counter parameters for a caster. `magicLimitPercent` is magicLimitMaster.getMagicLimit (only
 * with limitMagic). calcAttackChargeStart ends with `chargeStart = min(pChargeStart, chargeStartMax)`:
 * with a chargeStartMax (the summons) the start is the attack's own, mana_burst left out.
 * Remake: with a `chargeFullTicks` the max is also what the charge reaches in that many ticks; a
 * volley's max stops where it fires its most projectiles.
 */
export function chargeLimits(caster: ActorDef, magicLimitPercent = 100): ChargeLimits {
  const a = caster.attack
  let max = Math.min(a.chargeMax, caster.mana_capacity * a.chargeMaxModifier + a.chargeMaxBasic)
  if (a.limitMagic) max = (max * magicLimitPercent) / 100
  const flow = a.chargeSpeed * caster.mana_flow
  const speed = a.chargeSpeedMax === null ? flow : Math.min(flow, a.chargeSpeedMax)
  const start = a.chargeStartMax === null ? Math.min(a.chargeStart + caster.mana_burst, max) : Math.min(a.chargeStart, a.chargeStartMax)
  if (a.chargeFullTicks !== null) max = Math.min(max, start + speed * a.chargeFullTicks)
  if (a.volley !== null) max = Math.min(max, volleyFullCharge(a.volley))
  return { start, max, speed }
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

/** modSpellMultistage.selectPayload's pCurrentPayloadNum: the 1-based number of the last stage the charge has reached; 0 = blank. */
export function stageNumber(charge: number, a: AttackDef): number {
  let num = 0
  for (const stage of a.multistage) {
    if (stage.chargeRequired > charge) break
    num++
  }
  return num
}

/** modSpellMultistage.selectPayload: the last stage whose chargeRequired the charge has reached; null = blank. */
export function payloadFor(charge: number, a: AttackDef): string | null {
  const num = stageNumber(charge, a)
  return num === 0 ? null : a.multistage[num - 1]!.payload
}

/** The payload functions an impact calls: payloadFunctionNonBlank once a summon stage is reached (selectPayload). */
export const payloadFunctionsFor = (charge: number, a: AttackDef): string[] => (payloadFor(charge, a) === null ? a.payloadFunction : a.payloadFunctionNonBlank)

/** Whether a spell released at `charge` sends the allies it hits into the reserve (the army summon's blank payload #armyTeleportOut). */
export const sendsAlliesHome = (charge: number, a: AttackDef): boolean => payloadFunctionsFor(charge, a).includes('armyTeleportOut')

/** modSpellMultistage.chargeReinIn: the charge a refused summon drops to, just below the first stage. */
export const reinedInCharge = (a: AttackDef): number => a.multistage[0]!.chargeRequired - 1

/** chargeReinInToAvailable holds the charge this far below the stage above the best available unit. */
const AVAILABLE_REIN_IN = 0.1

/**
 * The army summon's part of obtainPermissionOrHalt: once the charge reaches the stage of the best
 * unit in the reserve (`topAvailable`, 1-based; 0 = none), or any stage when there is none,
 * chargeReinInToAvailable holds it at the next stage's charge - 0.1. Null when it may charge on.
 */
export function armyReinIn(charge: number, a: AttackDef, topAvailable: number): number | null {
  if (topAvailable >= a.multistage.length) return null
  const num = stageNumber(charge, a)
  if (num === 0 || num < topAvailable) return null
  return a.multistage[topAvailable]!.chargeRequired - AVAILABLE_REIN_IN
}

/** CounterOnce on the charge counter: pinned at max. */
export const chargeStep = (charge: number, speed: number, max: number): number => Math.min(max, charge + speed)

/** objCharacter.calcChargeLoc: the charge sprite sits at the caster's chargeLoc mirrored by facing. */
export function chargeLoc(caster: Vec, casterDef: ActorDef, facingLeft: boolean): Vec {
  return { x: caster.x + casterDef.chargeLoc.x * (facingLeft ? -1 : 1), y: caster.y + casterDef.chargeLoc.y }
}

/**
 * Remake (owner request): a spell's damage multiplier for its charge at release (before
 * chargeExplodeFactor): 1 + (charge - from) x perCharge, clamped to 1..max. The engine's damage is
 * linear in the charge (its push); this lets the biggest blasts hit harder still.
 */
export function chargeDamageMultiplier(charge: number, a: AttackDef): number {
  const { from, perCharge, max } = a.chargeDamageBonus
  return Math.max(1, Math.min(max, 1 + (charge - from) * perCharge))
}

/** A spell's flight speed: spellSpeed x the remake's shotSpeedScale (1 = engine). */
export const spellFlightSpeed = (a: AttackDef): number => a.spellSpeed * a.shotSpeedScale

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
