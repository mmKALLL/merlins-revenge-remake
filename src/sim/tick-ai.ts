// CPU character AI step (combat notes §3): one `decide` per living CPU character in a walking
// mode, acting on the decision: retarget via teamMaster.findTarget, walk via modPathFinding /
// modMoveToLoc (the walk velocity overwrites the actor's velocity; friction applies in the move
// step), stop in reach, or start an attack strip. The #attack and #dazed AI modes are driven by the
// animation and reel state in tick-combat.ts. On top of the engine AI, the remake's spreading
// detour (detourPause / detourMove) can start after a melee attack or a stretch of walking; see
// rollDetour and stepDetour.
import type { ActorDef } from '../mr-open/mr-actor-data'
import { rectAt } from '../mr-open/mr-collision'
import { decide, type AiDecision, type AiView, type TargetView } from '../mr-open/mr-ai-cpu'
import { cooldownReady } from '../mr-open/mr-attack'
import { distance, type Rect, type Vec } from '../mr-open/mr-geometry'
import { arrived, frameMove, movedOnScreen, pathStep } from '../mr-open/mr-pathfinding'
import { findTarget, hatedTeams, type Targetable } from '../mr-open/mr-targeting'
import { armedDefOf, collisionRectFor, defOf, faceAlong, isAlive, isUnit } from './actors'
import { nextRandom } from './rng'
import { ATTACK_STRIPS, type ActorState, type AttackStrip } from './state'
import { actorIn, waitingSleepers, type Tick } from './tick-context'
import { insideRect } from './view'

const asTargetable = (a: ActorState): Targetable => ({ id: a.id, team: a.team, pos: a.pos, alive: true })

/**
 * Living team units as targeting candidates: targetRoles [[#teamMembers, #teamBuildings]] covers
 * characters and dwellings (dead and dying ones are skipped by findTargetInTeam). The AI does not
 * see the sleepers of a continuous world (not even those in the tick: hit or idly wandering);
 * Merlin's aim does (`withSleepers`).
 */
export function targetables(t: Tick, withSleepers = false): Targetable[] {
  const candidates = withSleepers ? [...t.actors, ...waitingSleepers(t)] : t.actors.filter((a) => a.awake)
  return candidates.filter((a) => !t.removed.has(a.id) && isUnit(t.s, a) && isAlive(a)).map(asTargetable)
}

/**
 * teamMaster.findTarget: the id of the closest living unit in a team `a` hates, or null; `within`
 * (remake) limits the candidates to units positioned inside it.
 */
export function nearestHostileId(t: Tick, a: ActorState, withSleepers = false, within: Rect | null = null): number | null {
  const candidates = targetables(t, withSleepers)
  const inside = within ? candidates.filter((c) => insideRect(c.pos, within)) : candidates
  return findTarget(asTargetable(a), inside, hatedTeams(a.team, t.s.teams))
}

function targetView(t: Tick, id: number | null): TargetView | null {
  if (id === null) return null
  const target = actorIn(t, id)
  if (!target) return null
  return { pos: target.pos, rect: rectAt(target.pos, collisionRectFor(t.s, target)), alive: isAlive(target) }
}

function decideFor(t: Tick, a: ActorState): AiDecision {
  const me: AiView = { pos: a.pos, attack: armedDefOf(t.s, a).attack, cooldownReady: cooldownReady(a.cooldown) }
  return decide(a.ai.mode, me, targetView(t, a.ai.targetId), a.ai.retargetCounter)
}

/** Draws the next number from the tick's seeded RNG. */
function random(t: Tick): number {
  const [r, rng] = nextRandom(t.rng)
  t.rng = rng
  return r
}

/**
 * Remake spreading detour (not in the original): rolls `detourChance` on the seeded RNG. On success
 * the character stops and enters detourPause; returns whether it did. A chance of 0 never rolls.
 */
export function rollDetour(t: Tick, a: ActorState, def: ActorDef): boolean {
  if (def.detourChance <= 0) return false
  if (random(t) >= def.detourChance) return false
  a.mode = 'walk'
  a.vel = { x: 0, y: 0 }
  a.ai = { ...a.ai, mode: 'detourPause', targetId: null, detourTicks: def.detourPauseTicks, detourGoal: null, walkTicks: 0, pathStall: 0, moveTarget: null }
  return true
}

/**
 * One tick of a detour; returns whether it took the tick. detourPause stands still for
 * `detourPauseTicks`; the tick the count runs out starts detourMove (see stepDetourMove) at once.
 */
function stepDetour(t: Tick, a: ActorState, def: ActorDef): boolean {
  if (a.ai.mode === 'detourPause') {
    a.vel = { x: 0, y: 0 }
    const left = a.ai.detourTicks - 1
    if (left > 0) {
      a.ai = { ...a.ai, detourTicks: left }
      return true
    }
    startDetourMove(t, a, def)
  }
  if (a.ai.mode !== 'detourMove') return false
  return stepDetourMove(a, def)
}

/** Picks a random direction and aims detourMove at the point `detourDistance` away in it. */
function startDetourMove(t: Tick, a: ActorState, def: ActorDef): void {
  const angle = random(t) * 2 * Math.PI
  const goal = { x: a.pos.x + Math.cos(angle) * def.detourDistance, y: a.pos.y + Math.sin(angle) * def.detourDistance }
  // detourTicks now counts the ticks walked; the first one has nothing to stall on yet
  a.ai = { ...a.ai, mode: 'detourMove', detourTicks: 0, detourGoal: goal, pathStall: 0 }
}

/**
 * detourMove walks at walkSpeed toward its goal (tile collisions apply in the move step) until
 * within the modMoveToLoc arrival distance, stalled for `pathFindingStallTime` ticks, or
 * `detourMoveMaxTicks` ticks have been walked (cutoff, user request). It then switches to
 * findTarget and returns false, so the caller retargets the closest enemy on the same tick.
 */
function stepDetourMove(a: ActorState, def: ActorDef): boolean {
  const goal = a.ai.detourGoal ?? a.pos
  const moved = movedOnScreen(a.pos, a.prevPos)
  const pathStall = a.ai.detourTicks === 0 || moved ? 0 : a.ai.pathStall + 1
  if (arrived(a.pos, goal) || pathStall >= def.pathFindingStallTime || a.ai.detourTicks >= def.detourMoveMaxTicks) {
    a.vel = { x: 0, y: 0 }
    a.ai = { ...a.ai, mode: 'findTarget', detourTicks: 0, detourGoal: null, pathStall: 0, walkTicks: 0 }
    return false
  }
  a.vel = frameMove(a.pos, goal, def.walkSpeed)
  a.mode = 'walk'
  a.ai = { ...a.ai, detourTicks: a.ai.detourTicks + 1, pathStall }
  faceAlong(a, a.vel.x)
  return true
}

/**
 * teamMaster.findTarget on a 'retarget' decision. With a target the character switches to
 * moveToAttack and decides again, acting on the fresh target this tick (objAiCPU.update runs both);
 * without one it stands in findTarget and the decision is null.
 */
function retarget(t: Tick, a: ActorState): AiDecision | null {
  a.ai.retargetCounter = 0
  const targetId = nearestHostileId(t, a)
  if (targetId === null) {
    a.ai.mode = 'findTarget'
    a.ai.targetId = null
    a.ai.walkTicks = 0
    a.vel = { x: 0, y: 0 }
    return null
  }
  a.ai.targetId = targetId
  a.ai.mode = 'moveToAttack'
  const def = defOf(t.s, a)
  if (def.multiAttack) selectAttack(t, a, def, actorIn(t, targetId)!)
  return decideFor(t, a)
}

/**
 * modWeaponManager.setMultiAttack on a new target: the natural attack (weapon 1) while the target is
 * beyond bufferDist (the weapon's reach when that is ranged too), else the weapon (2) - unless the
 * target fights in melee, then weapon 1 again once the squared distance exceeds 20 (the engine
 * compares GeomDistSqr with 20, so in practice always). Each weapon keeps its own cooldown.
 */
function selectAttack(t: Tick, a: ActorState, def: ActorDef, target: ActorState): void {
  const weapon2 = def.attack
  const buffer = weapon2.type === 'ranged' && typeof weapon2.reach === 'number' ? weapon2.reach : def.bufferDist
  const dist2 = (target.pos.x - a.pos.x) ** 2 + (target.pos.y - a.pos.y) ** 2
  let natural = dist2 - buffer * buffer > 0
  if (!natural) natural = defOf(t.s, target).attack.type === 'melee' && dist2 > MULTI_ATTACK_MELEE_DIST_SQR && weapon2.type === 'melee'
  if (natural === a.useNatural) return
  a.useNatural = natural
  const cooldown = a.cooldown
  a.cooldown = a.otherCooldown
  a.otherCooldown = cooldown
}
/** setMultiAttack's melee check compares a squared distance with this. */
const MULTI_ATTACK_MELEE_DIST_SQR = 20

/** modPathFinding + modMoveToLoc toward the decision's goal, then the remake's walking detour roll. */
function walkToward(t: Tick, a: ActorState, def: ActorDef, goal: Vec): void {
  const moved = movedOnScreen(a.pos, a.prevPos)
  const path = { pathMode: a.ai.pathMode, waypoint: a.ai.waypoint, pathStall: a.ai.pathStall, scenicTicks: a.ai.scenicTicks }
  const r = pathStep(path, a.pos, goal, def.walkSpeed, moved, t.rng, def.pathFindingStallTime, def.scenicMaxTicks)
  t.rng = r.rng
  a.ai = { ...a.ai, ...r.path, moveTarget: goal }
  a.vel = r.vel
  a.mode = 'walk'
  faceAlong(a, r.vel.x)
  // remake: every detourMoveTicks of continuous walking may start a spreading detour
  a.ai.walkTicks++
  if (a.ai.walkTicks < def.detourMoveTicks) return
  a.ai.walkTicks = 0
  // no walking detour while already close to the target (user feedback)
  const target = a.ai.targetId === null ? undefined : actorIn(t, a.ai.targetId)
  const nearTarget = target !== undefined && distance(a.pos, target.pos) < def.detourMinTargetDistance
  if (!nearTarget) rollDetour(t, a, def)
}

/**
 * #arrivedAtAttackLoc resets only the path stall counter (modPathFinding.internalEvent): the path
 * mode and a scenic waypoint survive, so a scenic leg resumes once the target is out of reach.
 */
function stopInReach(a: ActorState): void {
  a.vel = { x: 0, y: 0 }
  a.ai = { ...a.ai, pathStall: 0, moveTarget: null, walkTicks: 0 }
}

/** Starts the attack strip; stepAttackFrames performs and finishes it. `def` carries the current attack (armedDefOf). */
function startAttack(a: ActorState, def: ActorDef, faceLeft: boolean): void {
  a.facingLeft = faceLeft
  // objAiAttack.attack -> goMode(attack.animType): the strip named after the attack's animType
  a.mode = ATTACK_STRIPS.has(def.attack.animType) ? (def.attack.animType as AttackStrip) : 'weaponMelee'
  a.ai = { ...a.ai, pathStall: 0, mode: 'attack', moveTarget: null, walkTicks: 0 }
  a.vel = { x: 0, y: 0 }
}

/** Distance factor of GeomMirrorPoint: a run-away goal far beyond the runner. */
const RUN_AWAY_PX = 2000

/**
 * objAiCPU #runReload (updateRunReload): walk away from the target until the cooldown is done, then
 * #moveToAttack. modMoveToLoc.moveAwayFromLoc calls GeomMirrorPoint without a distance (void x 20);
 * the port follows the evident intent (away from the target) rather than a zero-length mirror.
 */
function stepRunReload(t: Tick, a: ActorState, def: ActorDef): void {
  a.ai.retargetCounter++
  if (cooldownReady(a.cooldown)) {
    a.ai.mode = 'moveToAttack'
    return
  }
  const target = a.ai.targetId === null ? undefined : actorIn(t, a.ai.targetId)
  if (!target) return
  const away = { x: a.pos.x - target.pos.x, y: a.pos.y - target.pos.y }
  const d = Math.hypot(away.x, away.y) || 1
  a.vel = frameMove(a.pos, { x: a.pos.x + (away.x / d) * RUN_AWAY_PX, y: a.pos.y + (away.y / d) * RUN_AWAY_PX }, def.walkSpeed)
  a.mode = 'walk'
  faceAlong(a, a.vel.x)
}

export function stepCpuAi(t: Tick): void {
  for (const a of t.actors) {
    if (t.removed.has(a.id) || !a.awake) continue
    const def = defOf(t.s, a)
    if (def.aiType !== 'objAiCPU' || (a.mode !== 'walk' && a.mode !== 'stand')) continue
    if (a.ai.mode === 'runReload') {
      stepRunReload(t, a, def)
      if (a.ai.mode === 'runReload') continue
    }
    if (stepDetour(t, a, def)) continue
    let decision: AiDecision | null = decideFor(t, a)
    if (decision.kind === 'retarget') decision = retarget(t, a)
    else a.ai.retargetCounter++
    switch (decision?.kind) {
      case 'move':
        walkToward(t, a, def, decision.goal)
        break
      case 'stop':
        stopInReach(a)
        break
      case 'startAttack':
        startAttack(a, armedDefOf(t.s, a), decision.faceLeft)
        break
      default: // idle, a repeated retarget, or no target found
        break
    }
  }
}
