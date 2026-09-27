// Idle wander of sleeping units (remake addition, owner request; engine notes walking-and-rooms,
// "Continuous world"). In a continuous world the sleepers near the follow camera's view would
// otherwise stand frozen: every idleWanderScanTicks the sleeping CPU walkers inside the view grown by
// idleWanderMarginTiles roll for a wander, and one that succeeds walks to a random point near its
// home, still asleep (no AI, not a targeting candidate). Only the walking ones join the tick's working
// actors (isStepped); the scan is a position test over the waiting sleepers, so the rest of a big map
// stays untouched. Coming within wake range wakes the unit and ends the wander (activation.ts).
import type { ActorDef } from '../mr-open/mr-actor-data'
import { TILE_PX, type Rect } from '../mr-open/mr-geometry'
import { arrived, frameMove, movedOnScreen } from '../mr-open/mr-pathfinding'
import { restAsleep } from './activation'
import { defOf, faceAlong, isAlive, isUnit } from './actors'
import { nextRandom } from './rng'
import { isSleepWandering, TICKS_PER_SECOND, type ActorState, type AnimationSet, type SimState } from './state'
import { bringIn, playerIn, waitingSleepers, type Tick } from './tick-context'
import { insideRect, viewRect, type Size } from './view'

/** Strips that give a unit its own idle animation; such a unit stands and plays it instead of wandering. */
const IDLE_STRIPS = ['idle', 'look', 'altStand']
/** AI kinds that wander while asleep; sleepers do not cast, so spell casters walk like any unit. */
const WANDERING_AI = new Set(['objAiCPU', 'objAiCPUSpellCaster'])

const hasIdleAnimation = (set: AnimationSet | undefined): boolean => IDLE_STRIPS.some((name) => set?.[name] !== undefined)

/**
 * Whether a sleeper may start a wander: a living, calm CPU walker or spell caster with a walk speed
 * (so no dwelling) whose chance is not 0 and whose sprite has no idle strip of its own.
 */
function canWander(s: SimState, a: ActorState, def: ActorDef): boolean {
  return WANDERING_AI.has(def.aiType ?? '') && def.walkSpeed > 0 && def.idleWanderChancePerSecond > 0 && a.ai.mode === 'findTarget' &&
    (a.mode === 'stand' || a.mode === 'walk') && isUnit(s, a) && isAlive(a) && !hasIdleAnimation(s.anims[def.name])
}

function random(t: Tick): number {
  const [r, rng] = nextRandom(t.rng)
  t.rng = rng
  return r
}

/** The view rect grown by `tiles` on every side. */
const grown = (r: Rect, tiles: number): Rect => {
  const m = tiles * TILE_PX
  return { left: r.left - m, top: r.top - m, right: r.right + m, bottom: r.bottom + m }
}

/**
 * On a scan tick, each eligible sleeper inside the grown view rolls idleWanderChancePerSecond *
 * idleWanderIntervalTicks / 30 on the seeded RNG (the per-second chance when the scan period equals
 * the interval, as by default); on success it is brought into the tick and aimed at a uniformly
 * random point within idleWanderRadius of home.
 */
function scanSleepers(t: Tick, view: Size): void {
  const rules = defOf(t.s, playerIn(t))
  const area = grown(viewRect(t.s, playerIn(t).pos, view), rules.idleWanderMarginTiles)
  for (const sleeper of waitingSleepers(t)) {
    if (!insideRect(sleeper.pos, area)) continue
    const def = defOf(t.s, sleeper)
    if (!canWander(t.s, sleeper, def)) continue
    if (random(t) >= (def.idleWanderChancePerSecond * def.idleWanderIntervalTicks) / TICKS_PER_SECOND) continue
    const angle = random(t) * 2 * Math.PI
    const r = def.idleWanderRadius * Math.sqrt(random(t)) // uniform over the disc
    const a = bringIn(t, sleeper)
    const wanderGoal = { x: a.home.x + Math.cos(angle) * r, y: a.home.y + Math.sin(angle) * r }
    a.ai = { ...a.ai, mode: 'idleWander', wanderGoal, idleTicks: 0, pathStall: 0 }
  }
}

/**
 * One tick of a sleeper's wander: it walks at walkSpeed toward its goal (friction and tile
 * collisions apply in the move step, as for any walker) until within the modMoveToLoc arrival
 * distance or stalled for pathFindingStallTime ticks, then stands asleep again, settled for drawing.
 */
function stepWander(t: Tick, a: ActorState): void {
  const def = defOf(t.s, a)
  const goal = a.ai.wanderGoal ?? a.pos
  const moved = movedOnScreen(a.pos, a.prevPos)
  const pathStall = a.ai.idleTicks === 0 || moved ? 0 : a.ai.pathStall + 1
  if (arrived(a.pos, goal) || pathStall >= def.pathFindingStallTime) {
    restAsleep(t.s, a)
    return
  }
  a.vel = frameMove(a.pos, goal, def.walkSpeed)
  a.mode = 'walk'
  a.ai = { ...a.ai, idleTicks: a.ai.idleTicks + 1, pathStall }
  faceAlong(a, a.vel.x)
}

/** Continuous world: starts wanders on scan ticks, then steps every sleeper walking one. */
export function stepSleeperWanders(t: Tick, view: Size): void {
  const scanTicks = Math.max(1, defOf(t.s, playerIn(t)).idleWanderScanTicks)
  if (t.s.tick % scanTicks === 0) scanSleepers(t, view)
  for (const a of t.actors) {
    if (!t.removed.has(a.id) && isSleepWandering(a)) stepWander(t, a)
  }
}
