// Combat tick steps (combat notes §4-7): attack frames (melee strike, bullet spawn), bullet flight
// and impact, the victim side of a hit (objGameObject.takeHit -> modReel / modEnergy), reel and
// death progression, cooldown/regeneration counters and the exits-open rule. The player's spell
// (charge, release, explosion) is in tick-spell.ts.
import type { ActorDef } from '../mr-open/mr-actor-data'
import {
  aimWithEyestrain, bulletPush, cooldownIncrement, meleeHits, meleePush, rangedShot, resetCooldown, tickCooldown,
} from '../mr-open/mr-attack'
import { bulletHits, bulletStalled, LANDED_TICKS } from '../mr-open/mr-bullet'
import { rectAt } from '../mr-open/mr-collision'
import type { Vec } from '../mr-open/mr-geometry'
import { isDead, reelFinished, regenStep, resolveHit, stallStep } from '../mr-open/mr-take-hit'
import { hostileTeamsTo } from '../mr-open/mr-team-data'
import { collisionRectFor, defOf, isAlive, isBullet, isCharacter, isUnit, spriteRectFor } from './actors'
import { onFreshFrame } from './anim'
import { spreadVec } from './rng'
import type { ActorState, SimState } from './state'
import { actorIn, playSound, spawn, type Tick } from './tick-context'
import { rollDetour } from './tick-ai'

/** Ticks the player's die mode lasts before the map restart is requested. */
export const PLAYER_DEATH_TICKS = 30

/**
 * modEnergy.loseEnergy: energy falls; at <= 0 the character dies (outOfEnergy -> #die). A CPU
 * character's energy becomes -100 in the engine; only the sign matters here.
 */
function loseEnergy(t: Tick, victim: ActorState, amount: number): void {
  const def = defOf(t.s, victim)
  victim.energy -= amount
  t.events.push({ kind: 'hit', id: victim.id })
  if (isDead(victim.energy)) startDeath(t, victim)
  // modEnergy.loseEnergy (modEnergy.txt:206): every energy loss, the killing one included; for the
  // player that is wizard_hit (objPlayerMerlinCharacter -> objCharacter installs modEnergy)
  playSound(t, def.takeHitSound, def.takeHitVolume)
}

/**
 * #die with the dieSound: objCharacter.goMode(#die) (objCharacter.txt:201-202), objDwelling
 * startDeath -> goMode(#dead) (objDwelling.txt:77-80, the same dieSound fields).
 */
export function startDeath(t: Tick, a: ActorState): void {
  const def = defOf(t.s, a)
  a.energy = Math.min(a.energy, 0) // loseAllEnergy for a dwelling that ran out of residents
  a.mode = 'die'
  a.age = 0
  t.events.push({ kind: 'died', id: a.id })
  playSound(t, def.dieSound, def.dieVolume)
}

/**
 * objCPUCharacter.collisionWall / collisionVertical -> modEnergy.takeDamage: a character hitting a
 * wall while reeling takes the impact speed on that axis minus its damageSpeed, when above it.
 */
export function takeWallDamage(t: Tick, a: ActorState, speed: number): void {
  const excess = Math.abs(speed) - defOf(t.s, a).damageSpeed
  // objDwelling keeps objGameObject's collision callbacks, which only stop the move
  if (a.mode === 'reel' && excess > 0 && isCharacter(t.s, a)) loseEnergy(t, a, excess)
}

/**
 * Victim side of a hit: objGameObject.takeHit (inertia scaling, velocity add), modReel.takeHit
 * (goMode(#reel): frictionReel, stall reset, dazed AI), modEnergy.takeHit / loseEnergy. Ignored for
 * victims already dying or dead (objCPUCharacter.takeHit: #dead or checkDead; the player: #die).
 * objPlayerMerlinCharacter.takeHit forces the player back to #walk afterwards. In the export only
 * objCPUCharacter.goMode(#walk) calls frictionNormal, so ported literally the player would keep
 * frictionReel forever and walk at ~18 px/tick after the first hit, which the shipped game did not
 * do. Remake decision: the player's push goes into a separate `knockback` vector that decays by
 * frictionReel (a long slide) while walking keeps normal friction. Returns the inertia-scaled push,
 * which objGameObject writes back into the caller's point (Lingo points are passed by reference).
 */
export function applyHit(t: Tick, victim: ActorState, push: Vec, attackerMultiplier: number): Vec {
  if (!isAlive(victim)) return push
  const def = defOf(t.s, victim)
  const hit = resolveHit(def, push, attackerMultiplier)
  t.hit.add(victim.id)
  if (victim.id === t.s.playerId) {
    victim.knockback = { x: victim.knockback.x + hit.push.x, y: victim.knockback.y + hit.push.y }
    victim.mode = 'walk'
  } else {
    victim.vel = { x: victim.vel.x + hit.push.x, y: victim.vel.y + hit.push.y }
    victim.mode = 'reel'
    victim.frictionPercent = { ...def.frictionReel }
    victim.stall = 0
    if (def.aiType !== null) {
      victim.ai.mode = 'dazed' // also ends a remake detour
      victim.ai.moveTarget = null
      victim.ai.walkTicks = 0
    }
  }
  loseEnergy(t, victim, hit.damage)
  return hit.push
}

/** objAiAttack.updateAttack: perform the attack on its strip frame, finish when the strip has looped. */
export function stepAttackFrames(t: Tick): void {
  for (const a of t.actors) {
    if (t.removed.has(a.id) || a.ai.mode !== 'attack') continue
    const def = defOf(t.s, a)
    if (onFreshFrame(a, def.attack.animFrame)) {
      const target = a.ai.targetId === null ? undefined : actorIn(t, a.ai.targetId)
      if (target && isAlive(target)) performAttack(t, a, def, target)
    }
    if (a.animLooped) finishAttack(t, a, def)
  }
}

/**
 * objAiAttack.performAttack (objAiAttack.txt:303-314): a melee strike or a fired bullet, then the
 * attack sound (a swing sounds whether or not it hits) and a fresh cooldown.
 */
function performAttack(t: Tick, a: ActorState, def: ActorDef, target: ActorState): void {
  const atk = def.attack
  if (atk.type === 'melee') {
    if (meleeHits(a.pos, def, a.facingLeft, spriteRectFor(t.s, target))) applyHit(t, target, meleePush(def, a.facingLeft), atk.damageMultiplier)
  } else if (atk.type === 'ranged' && atk.bullet) {
    fireBullet(t, a, def, atk.bullet, target)
  } else {
    return
  }
  playSound(t, atk.sound, atk.volume)
  a.cooldown = resetCooldown(atk)
}

/** A ranged attack's bullet, aimed with eyestrain at `target`. */
function fireBullet(t: Tick, a: ActorState, def: ActorDef, bullet: string, target: ActorState): void {
  const [aim, rng] = aimWithEyestrain(a.pos, target.pos, def, t.rng)
  t.rng = rng
  const shot = rangedShot(a.pos, aim, def, a.facingLeft)
  // remake: projectileSpreadDeg turns the shot by a small random angle
  const [vel, rng2] = spreadVec(t.rng, shot.vel, def.projectileSpreadDeg)
  t.rng = rng2
  spawn(t, bullet, shot.spawn, { mode: 'fly', vel, ownerId: a.id, targetId: target.id, targetPoint: aim, team: a.team })
}

/** The attack strip has looped: back to walking and looking for a target. */
function finishAttack(t: Tick, a: ActorState, def: ActorDef): void {
  a.mode = 'walk'
  a.ai.mode = 'findTarget'
  a.ai.targetId = null
  a.vel = { x: 0, y: 0 }
  // remake: a finished melee attack may start a spreading detour
  if (def.attack.type === 'melee') rollDetour(t, a, def)
}

/** objBullet.updateFly (stall -> land, target collision -> hit) and the landed strip. */
export function stepBullets(t: Tick): void {
  for (const a of t.actors) {
    if (t.removed.has(a.id) || !isBullet(t.s, a)) continue
    if (a.mode === 'fly') stepFlyingBullet(t, a)
    else if (a.mode === 'land') {
      a.age++
      if (a.age >= LANDED_TICKS) t.removed.add(a.id)
    }
  }
}

function stepFlyingBullet(t: Tick, a: ActorState): void {
  if (bulletStalled(a.vel)) {
    // objBullet.goMode(#land): setVect(point(0,0)) - the landed arrow does not drift
    a.mode = 'land'
    a.age = 0
    a.vel = { x: 0, y: 0 }
    return
  }
  const target = a.targetId === null ? undefined : actorIn(t, a.targetId)
  if (!target || !isAlive(target)) return
  if (!bulletHits(rectAt(a.pos, collisionRectFor(t.s, a)), target.pos, collisionRectFor(t.s, target))) return
  // objBullet.updateFly calls myTarget.takeHit and then CallPayloadFunction([#takeHit]) with the
  // same collisionVect: two pushes and two damage applications, the second with the vector
  // objGameObject.takeHit already scaled by the victim's inertia in place
  const def = defOf(t.s, a)
  const scaled = applyHit(t, target, bulletPush(a.vel, def), def.attack.damageMultiplier)
  applyHit(t, target, scaled, def.attack.damageMultiplier)
  t.removed.add(a.id)
}

/** modReel.updateReel, objCharacter #die -> #dead, objCPUCharacter.updateDead -> #finish (grave), the player's release strip and death timer. */
export function stepReelAndDeath(t: Tick): void {
  for (const a of t.actors) {
    if (t.removed.has(a.id)) continue
    const def = defOf(t.s, a)
    const wasMode = t.prev.get(a.id)?.mode
    switch (a.mode) {
      case 'reel':
        if (t.hit.has(a.id)) break // modReel.updateReel first runs on the update after the hit
        a.stall = stallStep(a.stall, { x: a.pos.x - a.prevPos.x, y: a.pos.y - a.prevPos.y }, def.stallSpeed)
        if (reelFinished(a.stall)) {
          a.mode = 'walk'
          a.vel = { x: 0, y: 0 }
          a.frictionPercent = { ...def.friction }
          if (a.ai.mode === 'dazed') a.ai.mode = 'findTarget'
        }
        break
      case 'die':
        if (wasMode !== 'die') break // the tick of the hit itself does not count
        if (a.id === t.s.playerId) {
          a.age++
          if (a.age >= PLAYER_DEATH_TICKS) t.restartRequested = true
        } else {
          a.mode = 'dead' // one tick of #die, then the grave strip plays from frame 0
        }
        break
      case 'dead':
        if (a.animLooped) {
          a.mode = 'finish'
          t.graves.push({ def: a.def, pos: a.pos })
          t.removed.add(a.id)
        }
        break
      case 'release':
        if (a.animLooped) a.mode = 'walk'
        break
      default:
        break
    }
  }
}

/** modWeaponManager.updateCooldowns and modEnergy.recoverEnergy for every team unit (a dwelling: +1 per 1000 ticks). */
export function stepCooldownsAndRegen(t: Tick): void {
  for (const a of t.actors) {
    if (t.removed.has(a.id) || !isUnit(t.s, a)) continue
    const def = defOf(t.s, a)
    a.cooldown = tickCooldown(a.cooldown, cooldownIncrement(def))
    const [energy, counter] = regenStep(a.energy, def.energy, a.regenCounter, def.energyRecoverDelay)
    a.energy = energy
    a.regenCounter = counter
  }
}

/**
 * teamMaster.isPlayerEnemiesDead over the given actors: no member or building left in a team
 * hostile to the player (isTeamDead counts teamMembers + teamBuildings, teamMaster.txt:1170-1183).
 * Dying and dead units still count; they leave the team only in #finish (objGameObject.finish ->
 * leaveTeam), i.e. once their grave has been recorded.
 */
export function exitsOpenFor(s: SimState, actors: ActorState[]): boolean {
  const hostile = hostileTeamsTo(s.defs['player']!.team, s.teams)
  return !actors.some((a) => hostile.includes(a.team) && isUnit(s, a) && a.mode !== 'finish')
}
