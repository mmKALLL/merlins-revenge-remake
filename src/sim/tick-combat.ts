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
import { explodeWithCharge, type SplashVictim } from '../mr-open/mr-spell'
import { hatedTeams } from '../mr-open/mr-targeting'
import { isDead, reelFinished, regenStep, resolveHit, stallStep } from '../mr-open/mr-take-hit'
import { hostileTeamsTo } from '../mr-open/mr-team-data'
import { armedDefOf, collisionRectFor, defOf, isAlive, isBullet, isCharacter, isUnit, spriteRectFor } from './actors'
import { onFreshFrame } from './anim'
import { spreadVec } from './rng'
import type { ActorState, SimState } from './state'
import { actorIn, hitTargetIn, playSound, sleeperIn, spawn, waitingSleepers, type Tick } from './tick-context'
import { nearestHostileId, rollDetour } from './tick-ai'

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
  if (isDead(victim.energy, def.minEnergy)) startDeath(t, victim)
  // modEnergy.loseEnergy (modEnergy.txt:206): every energy loss, the killing one included; for the
  // player that is wizard_hit (objPlayerMerlinCharacter -> objCharacter installs modEnergy)
  playSound(t, def.takeHitSound, def.takeHitVolume)
}

/**
 * #die with the dieSound: objCharacter.goMode(#die) (objCharacter.txt:201-202), objDwelling
 * startDeath -> goMode(#dead) (objDwelling.txt:77-80, the same dieSound fields). The AI stops: no
 * attack frame fires from a dying unit, and an attack it was in never finishes back into #walk
 * (a reel-proof tower killed mid-attack keeps its AI mode through the hit).
 */
export function startDeath(t: Tick, a: ActorState): void {
  const def = defOf(t.s, a)
  a.energy = Math.min(a.energy, 0) // loseAllEnergy for a dwelling that ran out of residents
  a.mode = 'die'
  a.age = 0
  if (def.aiType !== null) {
    a.ai.mode = 'dazed'
    a.ai.moveTarget = null
  }
  t.events.push({ kind: 'died', id: a.id })
  playSound(t, def.dieSound, def.dieVolume)
}

/**
 * modEnergy.die -> loseAllEnergy (loseEnergy(pMaxEnergy)), what teamMaster.killTeam tells every
 * member and building (the kill all cheat): the unit dies as from a lethal hit, without the push, so
 * its death strip, grave, sounds and the exits follow as usual. objDwelling.die also calls
 * startDeath. It counts as a hit, which wakes a sleeper of a continuous world for its death to play.
 */
export function killUnit(t: Tick, a: ActorState): void {
  const def = defOf(t.s, a)
  t.hit.add(a.id)
  loseEnergy(t, a, def.maxEnergy)
  if (a.mode !== 'die') startDeath(t, a)
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
  } else if (def.reelProof) {
    // modReel.takeHit: objGameObject.takeHit still adds the push, but no #reel follows
    victim.vel = { x: victim.vel.x + hit.push.x, y: victim.vel.y + hit.push.y }
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
    const def = armedDefOf(t.s, a)
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

/**
 * The attack strip has looped: back to walking and looking for a target (objAiCPU.attackFin). A
 * runReload character (bats, evil TVs, vulture guards) re-picks its nearest target and backs away
 * from it until the cooldown is done (see stepRunReload).
 */
function finishAttack(t: Tick, a: ActorState, def: ActorDef): void {
  a.mode = 'walk'
  a.ai.mode = 'findTarget'
  a.ai.targetId = null
  a.vel = { x: 0, y: 0 }
  if (def.runReload) {
    const target = nearestHostileId(t, a)
    if (target !== null) a.ai = { ...a.ai, mode: 'runReload', targetId: target, retargetCounter: 0 }
    return
  }
  // remake: a finished melee attack may start a spreading detour
  if (def.attack.type === 'melee') rollDetour(t, a, def)
}

/** Ticks an exploding bullet without an explode strip stays before it is removed. */
const BULLET_EXPLODE_TICKS = 8

/** objBullet.updateFly (stall -> land, target collision -> hit), modExploder, and the landed strip. */
export function stepBullets(t: Tick): void {
  for (const a of t.actors) {
    if (t.removed.has(a.id) || !isBullet(t.s, a)) continue
    if (a.mode === 'fly') stepFlyingBullet(t, a)
    else if (a.mode === 'land') {
      a.age++
      if (a.age < LANDED_TICKS) continue
      t.removed.add(a.id)
      reincarnate(t, a, defOf(t.s, a)) // objBullet #land fin (flamingRock leaves a fire)
    } else if (a.mode === 'explode') {
      // modExploder.updateExplode: until the explode strip has looped, then #explodeFin -> dead
      a.age++
      const hasStrip = t.s.anims[defOf(t.s, a).name]?.['explode'] !== undefined
      if (hasStrip ? a.animLooped : a.age >= BULLET_EXPLODE_TICKS) t.removed.add(a.id)
    }
  }
}

function stepFlyingBullet(t: Tick, a: ActorState): void {
  const def = defOf(t.s, a)
  if (bulletStalled(a.vel)) {
    // #bulletLanded: modExploder explodes when it is one of the bullet's explodeEvents, else
    // objBullet.goMode(#land): setVect(point(0,0)) - the landed arrow does not drift
    if (def.explodeEvents.includes('bulletLanded')) return explodeBullet(t, a, def)
    a.mode = 'land'
    a.age = 0
    a.vel = { x: 0, y: 0 }
    return
  }
  // a target that fell asleep while the bullet flew can still be hit
  const seen = a.targetId === null ? undefined : (actorIn(t, a.targetId) ?? sleeperIn(t, a.targetId))
  if (!seen || !isAlive(seen)) return
  if (!bulletHits(rectAt(a.pos, collisionRectFor(t.s, a)), seen.pos, collisionRectFor(t.s, seen))) return
  const target = hitTargetIn(t, seen.id)!
  // objBullet.updateFly calls myTarget.takeHit and then CallPayloadFunction([#takeHit]) with the
  // same collisionVect: two pushes and two damage applications, the second with the vector
  // objGameObject.takeHit already scaled by the victim's inertia in place. An #explode bullet's
  // collisionVect is the explosion's (calcCollisionVectSpell with its explodeCharge).
  const push = def.attack.type === 'explode' ? explosionPushOn(t, a, def, target) : bulletPush(a.vel, def)
  const scaled = applyHit(t, target, push, def.attack.damageMultiplier)
  applyHit(t, target, scaled, def.attack.damageMultiplier)
  // #bulletCollidedWithTarget: explode (modExploder) or die
  if (def.explodeEvents.includes('bulletCollidedWithTarget')) explodeBullet(t, a, def)
  else t.removed.add(a.id)
}

/** calcCollisionVectSpell of an #explode bullet on one unit (no push when outside the blast). */
function explosionPushOn(t: Tick, bullet: ActorState, def: ActorDef, victim: ActorState): Vec {
  const r = spriteRectFor(t.s, victim)
  const ex = explodeWithCharge(bullet.pos, def.attack.explodeCharge, def.attack, [{ id: victim.id, pos: victim.pos, radius: (r.right - r.left) / 2 }])
  return ex.pushes[0]?.push ?? { x: 0, y: 0 }
}

/**
 * modExploder.explode: the explode sound, teamMaster.impactAttack with the bullet's explodeCharge
 * (radius explodeCharge / 2, push (radius + r - dist) * power, as a spell), then the explode strip.
 */
function explodeBullet(t: Tick, a: ActorState, def: ActorDef): void {
  playSound(t, def.exploderSound, def.exploderVolume)
  const atk = def.attack
  const ex = explodeWithCharge(a.pos, atk.explodeCharge, atk, splashVictims(t, hatedTeams(a.team, t.s.teams), atk.hits))
  for (const { id, push } of ex.pushes) {
    const victim = hitTargetIn(t, id)
    if (victim) applyHit(t, victim, push, atk.damageMultiplier)
  }
  t.events.push({ kind: 'explode', pos: a.pos, radius: ex.radius })
  a.mode = 'explode'
  a.vel = { x: 0, y: 0 }
  a.prevPos = a.pos
  a.age = 0
}

/**
 * Living units of `teams` whose role the attack `hits` (teamMembers, teamBuildings), with their
 * sprite radius (objGameObject.getRadius): the candidates of teamMaster.impactAttack. Sleepers of a
 * continuous world are caught too.
 */
export function splashVictims(t: Tick, teams: string[], hits: string[]): SplashVictim[] {
  return [...t.actors, ...waitingSleepers(t)]
    .filter((v) => !t.removed.has(v.id) && isUnit(t.s, v) && isAlive(v) && teams.includes(v.team) && hits.includes(defOf(t.s, v).teamRole))
    .map((v) => {
      const r = spriteRectFor(t.s, v)
      return { id: v.id, pos: v.pos, radius: (r.right - r.left) / 2 }
    })
}

/** modReel.updateReel, objCharacter #die -> #dead, objCPUCharacter.updateDead -> #finish (grave), the player's release strip and death timer. */
export function stepReelAndDeath(t: Tick): void {
  for (const a of t.actors) {
    if (t.removed.has(a.id)) continue
    const def = defOf(t.s, a)
    const wasMode = t.prev.get(a.id)?.mode
    if (isOutOfEnergy(t, a, def)) startDeath(t, a)
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
        // objCPUCharacter.updateDead: with graveOn false there is no grave strip to wait for
        if (a.animLooped || !def.graveOn) {
          a.mode = 'finish'
          if (def.graveOn) t.graves.push({ def: a.def, pos: a.pos })
          t.removed.add(a.id)
          reincarnate(t, a, def)
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

/**
 * modEnergy.checkDead for a CPU unit whose energy is spent outside the death modes (a state loaded
 * from before this check existed): it dies as from a lethal hit instead of standing on, not alive
 * and so unhittable, forever.
 */
function isOutOfEnergy(t: Tick, a: ActorState, def: ActorDef): boolean {
  if (a.id === t.s.playerId || !isUnit(t.s, a)) return false
  return a.mode !== 'die' && a.mode !== 'dead' && a.mode !== 'finish' && isDead(a.energy, def.minEnergy)
}

/**
 * modReincarnate.reincarnate on #leftTeam when killed in action: each reincarnateAs actor is created
 * on the dead one's reg point (useOffset false: the loop resets its counter every pass), e.g. hydra3
 * -> hydra2 -> hydra1, a four-arm golem -> two dark golems.
 */
function reincarnate(t: Tick, a: ActorState, def: ActorDef): void {
  for (const key of def.reincarnateAs) {
    if (!t.s.defs[key]) continue // not ported yet
    spawn(t, key, a.pos, { facingLeft: a.facingLeft })
  }
}

/** modWeaponManager.updateCooldowns and modEnergy.recoverEnergy for every awake team unit (a dwelling: +1 per 1000 ticks). */
export function stepCooldownsAndRegen(t: Tick): void {
  for (const a of t.actors) {
    if (t.removed.has(a.id) || !isUnit(t.s, a) || !a.awake) continue
    const def = defOf(t.s, a)
    // updateCooldowns runs every weapon's counter, each advanced by its attack type's stat
    const armed = armedDefOf(t.s, a)
    a.cooldown = tickCooldown(a.cooldown, cooldownIncrement(armed))
    if (def.multiAttack) a.otherCooldown = tickCooldown(a.otherCooldown, cooldownIncrement({ ...def, attack: a.useNatural ? def.attack : def.naturalAttack }))
    const [energy, counter] = regenStep(a.energy, def.maxEnergy, a.regenCounter, def.energyRecoverDelay)
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
