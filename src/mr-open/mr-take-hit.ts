// Port of objGameObject.takeHit (inertia scaling), modEnergy.takeHit / loseEnergy / recoverEnergy,
// objMoveXY.stallUpdate and modReel.updateReel (reel ends when the stall counter finishes).
// Death steps (die -> dead -> finish, modStretchDeath / objCPUCharacter.updateDead) are mode
// transitions driven by the animation and live in the tick; the energy rule `energy <= 0` is here.
import type { Vec } from './mr-geometry'
import type { ActorDef } from './mr-actor-data'

/** objMoveXY pStallSpeed for characters. */
export const STALL_SPEED = 0.2
/** objMoveXY pStallCount length: the reel ends after 10 stalled ticks. */
export const REEL_STALL_TICKS = 10

export interface HitResult {
  push: Vec
  damage: number
}

/**
 * objGameObject.takeHit + modEnergy.takeHit: the push added to the victim's velocity is scaled by
 * (100 - inertia)/100, and damage is the Manhattan length of that scaled push times the attacking
 * object's damageMultiplier.
 */
export function resolveHit(victim: ActorDef, push: Vec, attackerMultiplier: number): HitResult {
  const k = (100 - victim.inertia) / 100
  const p = { x: push.x * k, y: push.y * k }
  return { push: p, damage: (Math.abs(p.x) + Math.abs(p.y)) * attackerMultiplier }
}

/** modEnergy.checkDead. */
export const isDead = (energy: number): boolean => energy <= 0

/** objMoveXY.stallUpdate: counts consecutive ticks with |vx| + |vy| <= 0.2, resets on movement. */
export function stallStep(stall: number, moveVect: Vec): number {
  return Math.abs(moveVect.x) + Math.abs(moveVect.y) <= STALL_SPEED ? stall + 1 : 0
}

/** modReel.updateReel: finished once the stall counter has run its course. */
export const reelFinished = (stall: number): boolean => stall >= REEL_STALL_TICKS

/**
 * modEnergy.recoverEnergy: +1 energy every `delay` ticks while alive and below max.
 * Returns [energy, counter].
 */
export function regenStep(energy: number, max: number, counter: number, delay: number): [number, number] {
  if (energy <= 0 || energy >= max) return [energy, 0]
  return counter + 1 >= delay ? [Math.min(max, energy + 1), 0] : [energy, counter + 1]
}
