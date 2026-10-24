// Combat tick steps (combat notes §4-7): attack frames (melee strike, bullet spawn), bullet flight
// and impact, the victim side of a hit (objGameObject.takeHit -> modReel / modEnergy), reel and
// death progression, cooldown/regeneration counters and the exits-open rule. The player's spell
// (charge, release, explosion) is in tick-spell.ts.
import type { ActorDef, AttackDef } from '../mr-open/mr-actor-data'
import {
  aimWithEyestrain, bulletPush, cooldownIncrement, meleeHits, meleePush, rangedShot, resetCooldown, splashPush, tickCooldown,
} from '../mr-open/mr-attack'
import { bulletHits, bulletStalled } from '../mr-open/mr-bullet'
import { rectAt } from '../mr-open/mr-collision'
import { freezeTicksAfter } from '../mr-open/mr-freeze'
import { distance, type Vec } from '../mr-open/mr-geometry'
import { explodeWithCharge, type SplashVictim } from '../mr-open/mr-spell'
import { hatedTeams } from '../mr-open/mr-targeting'
import { isDead, reelFinished, regenStep, resolveHit, stallStep } from '../mr-open/mr-take-hit'
import { hostileTeamsTo } from '../mr-open/mr-team-data'
import { armedDefOf, collisionRectFor, defOf, hurtRectFor, hurtSpriteRectFor, isAlive, isBullet, isCharacter, isUnit } from './actors'
import { onFreshFrame } from './anim'
import { spreadVec } from './rng'
import type { ActorState, SimState } from './state'
import { actorIn, hitTargetIn, playSound, sleeperIn, spawn, waitingSleepers, type Tick } from './tick-context'
import { nearestHostileId, rollDetour } from './tick-ai'
import { isInvincible } from './tick-pickup'
import { teleportOut } from './tick-army'
import { stepPlayerCooldowns } from './tick-weapons'
import { stepAttackGrace } from './attack-grace'

/** Ticks the player's die mode lasts before the map restart is requested. */
export const PLAYER_DEATH_TICKS = 30

/**
 * modEnergy.loseEnergy: energy falls; at <= 0 the character dies (outOfEnergy -> #die). A CPU
 * character's energy becomes -100 in the engine; only the sign matters here. Nothing happens to
 * Merlin while a pickup's temporary invincibility lasts (getInvinceActive).
 */
function loseEnergy(t: Tick, victim: ActorState, amount: number): void {
  if (victim.id === t.s.playerId && isInvincible(t)) return
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

/** Merlin, when `source` is him or a bullet, spell or mine of his; undefined otherwise. */
function merlinBehind(t: Tick, source: ActorState): ActorState | undefined {
  const merlins = source.id === t.s.playerId || (!isUnit(t.s, source) && source.ownerId === t.s.playerId)
  return merlins ? actorIn(t, t.s.playerId) : undefined
}

/**
 * Remake (owner request): Merlin's `damageDealtMultiplier` multiplies the damage of everything he deals, his
 * swings and spells and the bullets and mines his spells leave (owned by him), but not his allies'.
 */
export function withOwnerDamage(t: Tick, source: ActorState, atk: AttackDef): AttackDef {
  const player = merlinBehind(t, source)
  const scale = player ? defOf(t.s, player).damageDealtMultiplier : 1
  return scale === 1 ? atk : { ...atk, damageMultiplier: atk.damageMultiplier * scale }
}

/** CallPayloadFunction's handlers (general_functions/CallPayloadFunction ().txt). */
const PAYLOAD = { takeHit: 'takeHit', takeHeal: 'takeHeal', takeFreeze: 'takeFreeze', armyTeleportOut: 'armyTeleportOut' } as const
/** modEnergy.takeHeal: energy += (|vx| + |vy|) * this, up to the maximum. */
const HEAL_PER_PUSH = 2

/**
 * CallPayloadFunction: each of the attack's payload functions on the victim, in order, with the
 * collision vector (`functions`: a summon spell's stage ones). #takeHit pushes and damages, writing
 * the inertia-scaled push back for the functions after it (Lingo points are passed by reference);
 * #takeHeal heals (no push), #takeFreeze freezes, #armyTeleportOut sends an ally to the reserve.
 */
export function applyPayload(t: Tick, victim: ActorState, push: Vec, atk: AttackDef, functions: readonly string[] = atk.payloadFunction): void {
  let vect = push
  for (const fn of functions) {
    if (fn === PAYLOAD.takeHit) vect = applyHit(t, victim, vect, atk.damageMultiplier)
    else if (fn === PAYLOAD.takeHeal) takeHeal(t, victim, vect)
    else if (fn === PAYLOAD.takeFreeze) takeFreeze(t, victim, vect, atk)
    else if (fn === PAYLOAD.armyTeleportOut) teleportOut(t, victim)
  }
}

/** modEnergy.takeHeal (no push, no reel): the healed unit gains twice the collision vector's Manhattan length. */
function takeHeal(t: Tick, victim: ActorState, push: Vec): void {
  if (!isAlive(victim)) return
  const max = defOf(t.s, victim).maxEnergy
  victim.energy = Math.min(max, victim.energy + (Math.abs(push.x) + Math.abs(push.y)) * HEAL_PER_PUSH)
}

/** modFreeze.takeFreeze on a character (Merlin included): frozen for longer the harder the push; glowing teal with a glowTeal attack. */
function takeFreeze(t: Tick, victim: ActorState, push: Vec, atk: AttackDef): void {
  if (!isCharacter(t.s, victim) || !isAlive(victim)) return
  if (victim.freezeTicks === 0) victim.glowTeal = atk.glowTeal
  victim.freezeTicks = freezeTicksAfter(victim.freezeTicks, push, atk.freezeMultiplier)
}

/** objAiAttack.updateAttack: perform the attack on its strip frame, finish when the strip has looped. */
export function stepAttackFrames(t: Tick): void {
  for (const a of t.actors) {
    // Merlin's swings are stepPlayerSwing's (tick-player-attack.ts)
    if (t.removed.has(a.id) || a.ai.mode !== 'attack' || a.id === t.s.playerId) continue
    const def = armedDefOf(t.s, a)
    const target = a.ai.targetId === null ? undefined : actorIn(t, a.ai.targetId)
    const alive = target && isAlive(target) ? target : undefined
    if (alive) a.ai.attackAt = { ...alive.pos }
    if (onFreshFrame(a, def.attack.animFrame)) {
      if (alive) performAttack(t, a, def, alive)
      else if (def.keepAttackOnTargetLoss && a.ai.attackAt) strikeWhereTargetWas(t, a, def, a.ai.attackAt)
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
    if (meleeHits(a.pos, def, a.facingLeft, hurtSpriteRectFor(t.s, target))) applyPayload(t, target, meleePush(def, a.facingLeft), atk)
  } else if (atk.type === 'ranged' && atk.bullet) {
    fireBullet(t, a, def, atk.bullet, target.pos, target.id)
  } else {
    return
  }
  playSound(t, atk.sound, atk.volume)
  a.cooldown = resetCooldown(atk)
}

/**
 * Remake (owner request): a `keepAttackOnTargetLoss` unit (the dwarf tower) finishes its attack at
 * where its target last stood when the target died during the wind-up: a ranged attack still fires.
 */
function strikeWhereTargetWas(t: Tick, a: ActorState, def: ActorDef, at: Vec): void {
  const atk = def.attack
  if (atk.type !== 'ranged' || !atk.bullet) return
  fireBullet(t, a, def, atk.bullet, at, null)
  playSound(t, atk.sound, atk.volume)
  a.cooldown = resetCooldown(atk)
}

/** A ranged attack's bullet, aimed with eyestrain at `targetPos` (the target's, when it has one). */
function fireBullet(t: Tick, a: ActorState, def: ActorDef, bullet: string, targetPos: Vec, targetId: number | null): void {
  const [aim, rng] = aimWithEyestrain(a.pos, targetPos, def, t.rng)
  t.rng = rng
  const shot = rangedShot(a.pos, aim, def, a.facingLeft)
  // remake: projectileSpreadDeg turns the shot by a small random angle
  const [vel, rng2] = spreadVec(t.rng, shot.vel, def.projectileSpreadDeg)
  t.rng = rng2
  spawn(t, bullet, shot.spawn, { mode: 'fly', vel, ownerId: a.id, targetId, targetPoint: aim, team: a.team })
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
      if (a.age < defOf(t.s, a).landedTicks) continue
      t.removed.add(a.id)
      reincarnate(t, a, defOf(t.s, a)) // objBullet #land fin (flamingRock leaves a fire)
    } else if (a.mode === 'explode') {
      // modExploder.updateExplode: until the explode strip has looped, then #explodeFin -> dead
      lingerExplosion(t, a)
      a.age++
      const hasStrip = t.s.anims[defOf(t.s, a).name]?.['explode'] !== undefined
      if (hasStrip ? a.animLooped : a.age >= BULLET_EXPLODE_TICKS) t.removed.add(a.id)
    }
  }
}

function stepFlyingBullet(t: Tick, a: ActorState): void {
  const def = defOf(t.s, a)
  // objBullet.checkStalled: no move vector yet on a bullet's first frame (a beam, created standing, lands on its second)
  const firstFrame = a.age === 0
  a.age++
  if (!firstFrame && bulletStalled(a.vel)) {
    // #bulletLanded: modExploder explodes when it is one of the bullet's explodeEvents, else
    // objBullet.goMode(#land): setVect(point(0,0)) - the landed arrow does not drift
    if (def.explodeEvents.includes('bulletLanded')) return explodeBullet(t, a, def)
    a.mode = 'land'
    a.age = 0
    a.vel = { x: 0, y: 0 }
    if (def.splashRadius !== null) splashOnLanding(t, a, def, def.splashRadius)
    return
  }
  // a splash bullet does not collide with its target (#collideWithTarget false)
  if (def.splashRadius !== null) return
  const struck = a.hitsFirstHostile ? firstHostileTouched(t, a, def) : targetTouched(t, a)
  if (!struck) return
  const target = hitTargetIn(t, struck.id)!
  // objBullet.updateFly calls myTarget.takeHit and then CallPayloadFunction([#takeHit]) with the
  // same collisionVect: two pushes and two damage applications, the second with the vector
  // objGameObject.takeHit already scaled by the victim's inertia in place. An #explode bullet's
  // collisionVect is the explosion's (calcCollisionVectSpell with its explodeCharge).
  const push = def.attack.type === 'explode' ? explosionPushOn(t, a, def, target) : bulletPush(a.vel, def)
  const atk = withOwnerDamage(t, a, bulletAttackOf(a, def))
  const scaled = applyHit(t, target, push, atk.damageMultiplier)
  applyPayload(t, target, scaled, atk)
  if (pierceThrough(a, target.id)) return
  // #bulletCollidedWithTarget: explode (modExploder) or die
  if (def.explodeEvents.includes('bulletCollidedWithTarget')) explodeBullet(t, a, def)
  else t.removed.add(a.id)
}

/** Remake (volley #pierce): a projectile with pierces left flies on through the unit it hit, which it does not hit again. */
function pierceThrough(a: ActorState, victimId: number): boolean {
  if (a.piercesLeft <= 0) return false
  a.piercesLeft--
  a.piercedIds = [...a.piercedIds, victimId]
  return true
}

/** The bullet's attack: a volley projectile's own copy (its damageMultiplier and hit roles), else its definition's. */
const bulletAttackOf = (a: ActorState, def: ActorDef): AttackDef => a.attack ?? def.attack

/** objBullet.checkCollisionWithTarget: the bullet's target, when it touches it (a target that fell asleep while the bullet flew included). */
function targetTouched(t: Tick, a: ActorState): ActorState | undefined {
  const seen = a.targetId === null ? undefined : (actorIn(t, a.targetId) ?? sleeperIn(t, a.targetId))
  if (!seen || !isAlive(seen)) return undefined
  return bulletHits(rectAt(a.pos, collisionRectFor(t.s, a)), seen.pos, hurtRectFor(t.s, seen)) ? seen : undefined
}

/**
 * Remake (volley projectiles): the first living hated unit of a role the bullet hits that it
 * touches and has not pierced; when it touches several on one tick, the one nearest to where it was the tick before.
 */
function firstHostileTouched(t: Tick, a: ActorState, def: ActorDef): ActorState | undefined {
  const rect = rectAt(a.pos, collisionRectFor(t.s, a))
  const touched = hatedUnits(t, hatedTeams(a.team, t.s.teams), bulletAttackOf(a, def).hits)
    .filter((v) => !a.piercedIds.includes(v.id) && bulletHits(rect, v.pos, hurtRectFor(t.s, v)))
  return touched.sort((p, q) => distance(p.pos, a.prevPos) - distance(q.pos, a.prevPos))[0]
}

/**
 * modSplashDamage.impactSplashDamage (#land -> teamMaster.impactAttack) with the remake's circle:
 * every living hated unit of a role the bullet hits whose sprite rect meets the circle of `radius`
 * around the landing point takes splashPush through the payload functions (once; no extra takeHit
 * as on contact).
 */
function splashOnLanding(t: Tick, a: ActorState, def: ActorDef, radius: number): void {
  for (const v of hatedUnits(t, hatedTeams(a.team, t.s.teams), bulletAttackOf(a, def).hits)) {
    // modSplashDamage.calcAttackHitSplash: the unit's reg point within `radius` of the axe
    if (distance(v.pos, a.pos) >= radius) continue
    const victim = hitTargetIn(t, v.id)
    if (victim) applyPayload(t, victim, splashPush(victim.pos, a.pos, def), withOwnerDamage(t, a, bulletAttackOf(a, def)))
  }
  // modSplashDamage.drawSplashGrave: the landing mark stays on the ground (the axe's crack)
  if (def.splashGraveOn) t.graves.push({ def: a.def, pos: { ...a.pos } })
}

/** calcCollisionVectSpell of an #explode bullet on one unit (no push when outside the blast). */
function explosionPushOn(t: Tick, bullet: ActorState, def: ActorDef, victim: ActorState): Vec {
  const r = hurtSpriteRectFor(t.s, victim)
  const ex = explodeWithCharge(bullet.pos, def.attack.explodeCharge, def.attack, [{ id: victim.id, pos: victim.pos, radius: (r.right - r.left) / 2 }])
  return ex.pushes[0]?.push ?? { x: 0, y: 0 }
}

/**
 * modExploder.explode (an #explode bullet or an energy mine): the explode sound,
 * teamMaster.impactAttack with the explodeCharge (radius explodeCharge / 2, push
 * (radius + r - dist) * power, as a spell) through the payload functions, then the explode strip.
 */
export function explodeBullet(t: Tick, a: ActorState, def: ActorDef): void {
  playSound(t, def.exploderSound, def.exploderVolume)
  const atk = bulletAttackOf(a, def)
  const ex = explodeWithCharge(a.pos, atk.explodeCharge, atk, splashVictims(t, hatedTeams(a.team, t.s.teams), atk.hits))
  const dealt = withOwnerDamage(t, a, atk)
  for (const { id, push } of ex.pushes) {
    const victim = hitTargetIn(t, id)
    if (victim) applyPayload(t, victim, push, dealt)
  }
  const player = merlinBehind(t, a)
  a.explosionHitIds = player && defOf(t.s, player).explosionsLinger ? ex.pushes.map((p) => p.id) : null
  t.events.push({ kind: 'explode', pos: a.pos, radius: ex.radius })
  a.mode = 'explode'
  a.vel = { x: 0, y: 0 }
  a.prevPos = a.pos
  a.age = 0
}

/**
 * Remake (explosionsLinger): while Merlin's blast plays its explode strip, a unit that enters it is
 * hit as on the first tick; each unit once per blast.
 */
export function lingerExplosion(t: Tick, a: ActorState): void {
  const hitIds = a.explosionHitIds
  if (!hitIds) return
  const atk = bulletAttackOf(a, defOf(t.s, a))
  const newcomers = splashVictims(t, hatedTeams(a.team, t.s.teams), atk.hits).filter((v) => !hitIds.includes(v.id))
  const ex = explodeWithCharge(a.pos, atk.explodeCharge, atk, newcomers)
  const dealt = withOwnerDamage(t, a, atk)
  for (const { id, push } of ex.pushes) {
    hitIds.push(id)
    const victim = hitTargetIn(t, id)
    if (victim) applyPayload(t, victim, push, dealt)
  }
}

/**
 * Living units of `teams` whose role the attack `hits` (teamMembers, teamBuildings), with their
 * sprite radius (objGameObject.getRadius): the candidates of teamMaster.impactAttack. Sleepers of a
 * continuous world are caught too.
 */
export function splashVictims(t: Tick, teams: string[], hits: string[]): SplashVictim[] {
  return hatedUnits(t, teams, hits).map((v) => {
    const r = hurtSpriteRectFor(t.s, v)
    return { id: v.id, pos: v.pos, radius: (r.right - r.left) / 2 }
  })
}

/** Living units of `teams` whose role is one of `hits`, sleepers of a continuous world included. */
function hatedUnits(t: Tick, teams: string[], hits: string[]): ActorState[] {
  return [...t.actors, ...waitingSleepers(t)]
    .filter((v) => !t.removed.has(v.id) && isUnit(t.s, v) && isAlive(v) && teams.includes(v.team) && hits.includes(defOf(t.s, v).teamRole))
}

/** modReel.updateReel, objCharacter #die -> #dead, objCPUCharacter.updateDead -> #finish (grave), the player's release strip and death timer. */
export function stepReelAndDeath(t: Tick): void {
  for (const a of t.actors) {
    if (t.removed.has(a.id)) continue
    const def = defOf(t.s, a)
    const wasMode = t.prev.get(a.id)?.mode
    if (isOutOfEnergy(t, a, def)) startDeath(t, a)
    if (!isAlive(a)) a.teleport = null // a unit killed while teleporting dies where it is
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

/** modFreeze.updateFreeze: the frozen ticks count down; at the end defrost (the teal glow goes). */
function stepFreeze(a: ActorState): void {
  if (a.freezeTicks === 0) return
  a.freezeTicks = Math.max(0, a.freezeTicks - 1)
  if (a.freezeTicks === 0) a.glowTeal = false
}

/** modWeaponManager.updateCooldowns, modFreeze.updateFreeze and modEnergy.recoverEnergy for every awake team unit (a dwelling: +1 per 1000 ticks). */
export function stepCooldownsAndRegen(t: Tick): void {
  for (const a of t.actors) {
    if (t.removed.has(a.id) || !isUnit(t.s, a) || !a.awake) continue
    const def = defOf(t.s, a)
    stepFreeze(a)
    stepAttackGrace(a)
    // updateCooldowns runs every weapon's counter, each advanced by its attack type's stat
    if (a.id === t.s.playerId) stepPlayerCooldowns(t, a)
    else a.cooldown = tickCooldown(a.cooldown, cooldownIncrement(armedDefOf(t.s, a)))
    if (def.multiAttack) a.otherCooldown = tickCooldown(a.otherCooldown, cooldownIncrement({ ...def, attack: a.useNatural ? def.attack : def.naturalAttack }))
    if (!def.passiveEnergyRecovery) continue
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
