// CPU character AI step (combat notes §3): one `decide` per living CPU character in a walking
// mode, acting on the decision: retarget via teamMaster.findTarget, walk via modPathFinding /
// modMoveToLoc (the walk velocity overwrites the actor's velocity), stop in reach, or start an
// attack strip. The #attack and #dazed AI modes are driven by the animation and reel state in
// tick-combat.ts.
import { rectAt } from '../mr-open/mr-collision'
import { decide, type AiView, type TargetView } from '../mr-open/mr-ai-cpu'
import { cooldownReady } from '../mr-open/mr-attack'
import { BEELINE, pathStep } from '../mr-open/mr-pathfinding'
import { findTarget, hatedTeams, type Targetable } from '../mr-open/mr-targeting'
import { collisionRectFor, isAlive, isCharacter } from './actors'
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

export function stepCpuAi(t: Tick): void {
  for (const a of t.actors) {
    if (t.removed.has(a.id)) continue
    const def = t.s.defs[a.def]!
    if (def.aiType !== 'objAiCPU' || (a.mode !== 'walk' && a.mode !== 'stand')) continue
    let decision = decideFor(t, a)
    if (decision.kind === 'retarget') {
      a.ai.retargetCounter = 0
      const me: Targetable = { id: a.id, team: a.team, pos: a.pos, alive: true }
      const targetId = findTarget(me, targetables(t), hatedTeams(a.team, t.s.teams))
      if (targetId === null) {
        a.ai.mode = 'findTarget'
        a.ai.targetId = null
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
        const r = pathStep(path, a.pos, decision.goal, def.walkSpeed, moved, t.rng)
        t.rng = r.rng
        a.ai = { ...a.ai, ...r.path, moveTarget: decision.goal }
        a.vel = r.vel
        a.mode = 'walk'
        // moveHorizReaction: facing follows horizontal movement
        if (r.vel.x < 0) a.facingLeft = true
        else if (r.vel.x > 0) a.facingLeft = false
        break
      }
      case 'stop':
        // #arrivedAtAttackLoc resets the path stall: waiting in reach never turns into wandering
        a.vel = { x: 0, y: 0 }
        a.ai = { ...a.ai, ...BEELINE, moveTarget: null }
        break
      case 'startAttack': {
        const anim = def.attack.animType
        a.facingLeft = decision.faceLeft
        a.mode = anim === 'weaponRanged' ? 'weaponRanged' : 'weaponMelee'
        a.ai = { ...a.ai, ...BEELINE, mode: 'attack', moveTarget: null }
        a.vel = { x: 0, y: 0 }
        break
      }
      case 'idle':
      case 'retarget':
        break
    }
  }
}
