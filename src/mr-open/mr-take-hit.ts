// Port of objGameObject.takeHit (inertia scaling), modEnergy.takeHit / loseEnergy / recoverEnergy,
// objMoveXY.stallUpdate and modReel.updateReel (reel ends when the stall counter finishes).
// Death steps (die -> dead -> finish, modStretchDeath / objCPUCharacter.updateDead) are mode
// transitions driven by the animation and live in the tick; the energy rule `energy <= 0` is here.
import type { Vec } from './mr-geometry'
import type { ActorDef } from './mr-actor-data'

/** objGameObject #stallSpeed default (ActorDef.stallSpeed; swordOrc 3, goblinMage 0.5). */
export const STALL_SPEED = 0.2
/**
 * objMoveXY pStallCount length: the reel ends after 10 stalled ticks. Lingo counters start at 1 and
 * finish when the count reaches the length, so the engine ends the reel one tick earlier (9 stalled
 * ticks); this port keeps the simpler N-tick model deliberately.
 */
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

/** modEnergy.checkDead: at or below minEnergy (0, or a multistage enemy's threshold). */
export const isDead = (energy: number, minEnergy = 0): boolean => energy <= minEnergy

/** objMoveXY.stallUpdate: counts consecutive ticks with |vx| + |vy| <= the stall speed, resets on movement. */
export function stallStep(stall: number, moveVect: Vec, stallSpeed = STALL_SPEED): number {
  return Math.abs(moveVect.x) + Math.abs(moveVect.y) <= stallSpeed ? stall + 1 : 0
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
