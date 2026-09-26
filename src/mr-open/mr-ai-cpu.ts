// Port of objAiCPU.update / updateMoveToAttack / targetInReach / calcDirXToTarget and
// objAiAttack.calcIdealAttackLoc / calcStrikePoint / attack: the per-tick decision of a CPU
// character's AI in modes #findTarget and #moveToAttack. The #attack / #dazed modes are driven by the
// animation and reel state, so this module only reports "idle" for them.
import type { Rect, Vec } from './mr-geometry'
import type { AttackDef } from './mr-actor-data'
import type { AiMode } from '../sim/state'

/**
 * objAiCPU pRetargetCounter length: refresh the target every 30 ticks while chasing. Lingo counters
 * start at 1 and finish when the count reaches the length, so the engine retargets one tick earlier
 * (29 ticks); this port keeps the simpler N-tick model deliberately.
 */
export const RETARGET_TICKS = 30

export interface AiView {
  pos: Vec
  attack: AttackDef
  cooldownReady: boolean
}

export interface TargetView {
  pos: Vec
  /** the target's collision rect in world px (getCollisionRect) */
  rect: Rect
  alive: boolean
}

/** calcDirXToTarget: +1 if the target is to the right (ties included), -1 if to the left. */
export function dirXToTarget(me: Vec, target: Vec): 1 | -1 {
  return target.x < me.x ? -1 : 1
}

/** calcIdealAttackLoc: ranged/magic stand on the target; melee and #none stand idealAttackLoc away on the near side. */
export function idealAttackLoc(me: Vec, target: Vec, a: AttackDef): Vec {
  if (a.type === 'ranged' || a.type === 'magic') return target
  const d = dirXToTarget(me, target)
  return { x: target.x + a.idealAttackLoc.x * -d, y: target.y + a.idealAttackLoc.y * -1 }
}

/** calcStrikePoint: reg point + collisionLoc with x mirrored by the facing direction. */
export function strikePoint(me: Vec, a: AttackDef, faceDir: 1 | -1): Vec {
  return { x: me.x + a.collisionLoc.x * faceDir, y: me.y + a.collisionLoc.y }
}

const insideRect = (r: Rect, p: Vec): boolean => p.x >= r.left && p.x < r.right && p.y >= r.top && p.y < r.bottom

/** targetInReach: melee tests either strike point in the target rect; ranged/magic tests the reach radius (or rect inflate). */
export function targetInReach(me: AiView, t: TargetView): boolean {
  const a = me.attack
  if (a.type === 'melee') return insideRect(t.rect, strikePoint(me.pos, a, -1)) || insideRect(t.rect, strikePoint(me.pos, a, 1))
  if (typeof a.reach !== 'number') {
    // point reach: me.getLoc().inside(target.getRect().inflate(reach.x, reach.y)); the target's
    // collision rect stands in for getRect() (the sprite rect)
    const r = a.reach
    return insideRect({ left: t.rect.left - r.x, top: t.rect.top - r.y, right: t.rect.right + r.x, bottom: t.rect.bottom + r.y }, me.pos)
  }
  const d2 = (t.pos.x - me.pos.x) ** 2 + (t.pos.y - me.pos.y) ** 2
  return d2 < a.reach ** 2
}

export type AiDecision =
  | { kind: 'retarget' }
  | { kind: 'move'; goal: Vec }
  | { kind: 'stop' }
  | { kind: 'startAttack'; faceLeft: boolean }
  | { kind: 'idle' }

/**
 * One decision per tick for AI modes findTarget / moveToAttack. `retargetCounter` is the ticks since
 * the last retarget; the caller resets it when it acts on 'retarget'. 'stop' = in reach but the
 * cooldown is not finished (#arrivedAtAttackLoc stops movement; attack() returns early).
 */
export function decide(aiMode: AiMode, me: AiView, target: TargetView | null, retargetCounter: number): AiDecision {
  if (aiMode === 'dazed' || aiMode === 'attack' || aiMode === 'none' || aiMode === 'detourPause' || aiMode === 'detourMove') return { kind: 'idle' }
  if (aiMode === 'findTarget' || target === null || !target.alive || retargetCounter >= RETARGET_TICKS) return { kind: 'retarget' }
  if (targetInReach(me, target)) {
    return me.cooldownReady ? { kind: 'startAttack', faceLeft: target.pos.x < me.pos.x } : { kind: 'stop' }
  }
  return { kind: 'move', goal: idealAttackLoc(me.pos, target.pos, me.attack) }
}
