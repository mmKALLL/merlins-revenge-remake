// CPU character AI step (combat notes §3): one `decide` per living CPU character in a walking
// mode, acting on the decision: retarget via teamMaster.findTarget, walk via modPathFinding /
// modMoveToLoc (the walk velocity overwrites the actor's velocity; friction applies in the move step), stop in reach, or start an
// attack strip. The #attack and #dazed AI modes are driven by the animation and reel state in
// tick-combat.ts. On top of the engine AI, the remake's spreading detour (detourPause /
// detourMove) can interrupt a walker; see stepDetour.
import type { ActorDef } from '../mr-open/mr-actor-data'
import { rectAt } from '../mr-open/mr-collision'
import { decide, type AiView, type TargetView } from '../mr-open/mr-ai-cpu'
import { cooldownReady } from '../mr-open/mr-attack'
import { arrived, frameMove, pathStep } from '../mr-open/mr-pathfinding'
import { findTarget, hatedTeams, type Targetable } from '../mr-open/mr-targeting'
import { collisionRectFor, isAlive, isCharacter } from './actors'
import { nextRandom } from './rng'
import type { ActorState } from './state'
import { actorIn, type Tick } from './tick-context'

/** Living characters as targeting candidates (dead and dying ones are skipped by findTargetInTeam). */
export function targetables(t: Tick): Targetable[] {
  return t.actors
    .filter((a) => !t.removed.has(a.id) && isCharacter(t.s, a) && isAlive(a))
    .map((a) => ({ id: a.id, team: a.team, pos: a.pos, alive: true }))
}

function targetView(t: Tick, id: number | null): TargetView | null {
  if (id === null) return null
  const target = actorIn(t, id)
  if (!target) return null
  return { pos: target.pos, rect: rectAt(target.pos, collisionRectFor(t.s, target)), alive: isAlive(target) }
}

function decideFor(t: Tick, a: ActorState) {
  const me: AiView = { pos: a.pos, attack: t.s.defs[a.def]!.attack, cooldownReady: cooldownReady(a.cooldown) }
  return decide(a.ai.mode, me, targetView(t, a.ai.targetId), a.ai.retargetCounter)
}

/**
 * Remake spreading detour (not in the original): rolls `detourChance` on the seeded RNG. On success
 * the character stops and enters detourPause; returns whether it did. A chance of 0 never rolls.
 */
export function rollDetour(t: Tick, a: ActorState, def: ActorDef): boolean {
  if (def.detourChance <= 0) return false
  const [r, rng] = nextRandom(t.rng)
  t.rng = rng
  if (r >= def.detourChance) return false
  a.mode = 'walk'
  a.vel = { x: 0, y: 0 }
  a.ai = { ...a.ai, mode: 'detourPause', targetId: null, detourTicks: def.detourPauseTicks, detourGoal: null, walkTicks: 0, pathStall: 0, moveTarget: null }
  return true
}

/**
 * One tick of a detour; returns whether it took the tick. detourPause stands still; the tick its
 * count runs out picks a random direction and starts detourMove: walking at walkSpeed toward the
 * point `detourDistance` away (tile collisions apply in the move step) until within the
 * modMoveToLoc arrival distance or stalled for `pathFindingStallTime` ticks. It then ends in
 * findTarget, so the same tick retargets the closest enemy.
 */
function stepDetour(t: Tick, a: ActorState, def: ActorDef): boolean {
  if (a.ai.mode === 'detourPause') {
    a.vel = { x: 0, y: 0 }
    const left = a.ai.detourTicks - 1
    if (left > 0) {
      a.ai = { ...a.ai, detourTicks: left }
      return true
    }
    const [r, rng] = nextRandom(t.rng)
    t.rng = rng
    const angle = r * 2 * Math.PI
    const goal = { x: a.pos.x + Math.cos(angle) * def.detourDistance, y: a.pos.y + Math.sin(angle) * def.detourDistance }
    // detourTicks now counts the ticks walked; the first one has nothing to stall on yet
    a.ai = { ...a.ai, mode: 'detourMove', detourTicks: 0, detourGoal: goal, pathStall: 0 }
  }
  if (a.ai.mode !== 'detourMove') return false
  const goal = a.ai.detourGoal ?? a.pos
  const moved = a.pos.x !== a.prevPos.x || a.pos.y !== a.prevPos.y
  const pathStall = a.ai.detourTicks === 0 || moved ? 0 : a.ai.pathStall + 1
  if (arrived(a.pos, goal) || pathStall >= def.pathFindingStallTime) {
    a.vel = { x: 0, y: 0 }
    a.ai = { ...a.ai, mode: 'findTarget', detourTicks: 0, detourGoal: null, pathStall: 0, walkTicks: 0 }
    return false
  }
  a.vel = frameMove(a.pos, goal, def.walkSpeed)
  a.mode = 'walk'
  a.ai = { ...a.ai, detourTicks: a.ai.detourTicks + 1, pathStall }
  if (a.vel.x < 0) a.facingLeft = true
  else if (a.vel.x > 0) a.facingLeft = false
  return true
}

export function stepCpuAi(t: Tick): void {
  for (const a of t.actors) {
    if (t.removed.has(a.id)) continue
    const def = t.s.defs[a.def]!
    if (def.aiType !== 'objAiCPU' || (a.mode !== 'walk' && a.mode !== 'stand')) continue
    if (stepDetour(t, a, def)) continue
    let decision = decideFor(t, a)
    if (decision.kind === 'retarget') {
      a.ai.retargetCounter = 0
      const me: Targetable = { id: a.id, team: a.team, pos: a.pos, alive: true }
      const targetId = findTarget(me, targetables(t), hatedTeams(a.team, t.s.teams))
      if (targetId === null) {
        a.ai.mode = 'findTarget'
        a.ai.targetId = null
        a.ai.walkTicks = 0
        a.vel = { x: 0, y: 0 }
        continue
      }
      a.ai.targetId = targetId
      a.ai.mode = 'moveToAttack'
      decision = decideFor(t, a) // act on the fresh target this tick (objAiCPU.update runs both)
    } else {
      a.ai.retargetCounter++
    }
    switch (decision.kind) {
      case 'move': {
        const moved = a.pos.x !== a.prevPos.x || a.pos.y !== a.prevPos.y
        const path = { pathMode: a.ai.pathMode, waypoint: a.ai.waypoint, pathStall: a.ai.pathStall }
        const r = pathStep(path, a.pos, decision.goal, def.walkSpeed, moved, t.rng, def.pathFindingStallTime)
        t.rng = r.rng
        a.ai = { ...a.ai, ...r.path, moveTarget: decision.goal }
        a.vel = r.vel
        a.mode = 'walk'
        // moveHorizReaction: facing follows horizontal movement
        if (r.vel.x < 0) a.facingLeft = true
        else if (r.vel.x > 0) a.facingLeft = false
        // remake: every detourMoveTicks of continuous walking may start a spreading detour
        a.ai.walkTicks++
        if (a.ai.walkTicks >= def.detourMoveTicks) {
          a.ai.walkTicks = 0
          rollDetour(t, a, def)
        }
        break
      }
      case 'stop':
        // #arrivedAtAttackLoc resets only the path stall counter (modPathFinding.internalEvent): the
        // path mode and a scenic waypoint survive, so a detour resumes once the target is out of reach
        a.vel = { x: 0, y: 0 }
        a.ai = { ...a.ai, pathStall: 0, moveTarget: null, walkTicks: 0 }
        break
      case 'startAttack': {
        const anim = def.attack.animType
        a.facingLeft = decision.faceLeft
        a.mode = anim === 'weaponRanged' ? 'weaponRanged' : 'weaponMelee'
        a.ai = { ...a.ai, pathStall: 0, mode: 'attack', moveTarget: null, walkTicks: 0 }
        a.vel = { x: 0, y: 0 }
        break
      }
      case 'idle':
      case 'retarget':
        break
    }
  }
}
