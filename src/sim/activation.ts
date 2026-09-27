// Continuous world activation (remake feature; engine notes walking-and-rooms, "Continuous world").
// With the whole map as one room, units far from Merlin sleep: no AI, movement, attacks, dwelling
// production, cooldowns or regeneration, and the AI does not see them; they can still be hit and
// show their stand strip (animated by the renderer, as the tick leaves sleepers untouched). The
// distances and the hold after a far hit come from the player's ActorDef (wakeDistance,
// sleepDistance, hitWakeTicks, navModeClearRadius); every distance is elliptical, shorter up and down
// by activationVerticalScale (activationDistance). Bullets and spells are never put to sleep.
import type { ActorDef } from '../mr-open/mr-actor-data'
import type { Vec } from '../mr-open/mr-geometry'
import { hostileTeamsTo } from '../mr-open/mr-team-data'
import { defOf, isAlive, isUnit, playerOf } from './actors'
import { stripNameFor } from './anim'
import type { ActorState, SimState } from './state'
import { bringIn, playerIn, waitingSleepers, type Tick } from './tick-context'
import { chargingSpellOf } from './tick-spell'

export type ActivationRules = Pick<ActorDef, 'wakeDistance' | 'sleepDistance' | 'hitWakeTicks'>
export type Activation = Pick<ActorState, 'awake' | 'wakeHold'>

/**
 * The distance the activation ranges compare against: vertical offsets count 1 / verticalScale
 * times longer, so a range r reaches r sideways and r * verticalScale up and down (an ellipse).
 */
export function activationDistance(a: Vec, b: Vec, verticalScale: number): number {
  return Math.hypot(b.x - a.x, (b.y - a.y) / verticalScale)
}

/** activationDistance from Merlin with the player's rules. */
const fromMerlin = (s: SimState, p: ActorState, a: ActorState): number =>
  activationDistance(p.pos, a.pos, defOf(s, p).activationVerticalScale)

/**
 * One tick of the wake/sleep rule for a unit `dist` px (reg point to reg point) from Merlin: closer
 * than wakeDistance wakes it, sleepDistance or farther puts it to sleep, in between it keeps its state
 * (hysteresis). A hit wakes it; a hit from sleepDistance or farther also holds it awake for
 * hitWakeTicks more ticks.
 */
export function nextActivation(a: Activation, dist: number, wasHit: boolean, rules: ActivationRules): Activation {
  let awake = a.awake
  let wakeHold = Math.max(0, a.wakeHold - 1)
  if (wasHit) {
    awake = true
    if (dist >= rules.sleepDistance) wakeHold = rules.hitWakeTicks
  }
  if (dist < rules.wakeDistance) awake = true
  else if (dist >= rules.sleepDistance && wakeHold === 0) awake = false
  return { awake, wakeHold }
}

/** Every unit starts asleep unless within wakeDistance of Merlin (the map start of a continuous world). */
export function activateAtStart(s: SimState): SimState {
  const p = playerOf(s)
  const actors = s.actors.map((a) => (a === p || !isUnit(s, a) ? a : { ...a, awake: withinWakeDistance(s, p, a), wakeHold: 0 }))
  return { ...s, actors }
}

/** Whether `a` is close enough to Merlin (`p`) to wake. */
export const withinWakeDistance = (s: SimState, p: ActorState, a: ActorState): boolean =>
  fromMerlin(s, p, a) < defOf(s, p).wakeDistance

/**
 * Applies the wake/sleep rule to every unit at the end of the tick, with this tick's hits (a sleeper
 * that was hit has been brought into the tick). A waiting sleeper only needs the wake test.
 */
export function stepActivation(t: Tick): void {
  const p = playerIn(t)
  const rules = defOf(t.s, p)
  for (const sleeper of waitingSleepers(t)) {
    if (withinWakeDistance(t.s, p, sleeper)) bringIn(t, sleeper).awake = true
  }
  for (const a of t.actors) {
    if (a === p || t.removed.has(a.id) || !isUnit(t.s, a)) continue
    const next = nextActivation(a, fromMerlin(t.s, p, a), t.hit.has(a.id), rules)
    a.wakeHold = next.wakeHold
    if (a.awake === next.awake) continue
    if (next.awake) a.awake = true
    else if (isCalm(a)) fallAsleep(t, a)
  }
}

/** A unit only falls asleep when walking or standing: a reel, a death, an attack or a charge plays out first. */
const isCalm = (a: ActorState): boolean => a.mode === 'walk' || a.mode === 'stand'

/** Puts the unit to sleep; a spell it was still charging goes away. */
function fallAsleep(t: Tick, a: ActorState): void {
  restAsleep(t.s, a)
  const spell = chargingSpellOf(t, a)
  if (spell) t.removed.add(spell.id)
}

/** A sleeping copy of the unit (see restAsleep). */
export function asleep(s: SimState, a: ActorState): ActorState {
  const copy = { ...a }
  restAsleep(s, copy)
  return copy
}

/**
 * Stops the unit on its stand strip and clears its AI back to finding a target. The tick leaves
 * sleepers untouched, so it is also settled for drawing: prevPos = pos, else the renderer would keep
 * interpolating between two points that never converge (a jitter).
 */
function restAsleep(s: SimState, a: ActorState): void {
  a.awake = false
  a.vel = { x: 0, y: 0 }
  a.prevPos = a.pos
  a.anim = stripNameFor(s.anims[defOf(s, a).name], 'stand', false)
  a.animFrame = 0
  a.animCounter = 0
  a.animExtend = 0
  a.animExtendCount = 0
  a.animLooped = false
  if (a.ai.mode === 'none') return
  a.ai = {
    ...a.ai, mode: 'findTarget', targetId: null, moveTarget: null, waypoint: null, pathMode: 'beeline',
    pathStall: 0, scenicTicks: 0, walkTicks: 0, detourTicks: 0, detourGoal: null, idleTicks: 0, wanderGoal: null,
  }
}

/** Nav mode in a continuous world: no awake living hostile unit within navModeClearRadius of Merlin (elliptical, as activation). */
export function navModeClear(s: SimState): boolean {
  const p = playerOf(s)
  const radius = defOf(s, p).navModeClearRadius
  const hostile = hostileTeamsTo(p.team, s.teams)
  return !s.actors.some((a) => a.awake && hostile.includes(a.team) && isUnit(s, a) && isAlive(a) && fromMerlin(s, p, a) < radius)
}
