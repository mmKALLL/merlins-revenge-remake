// Combat tick steps (combat notes §4-7): the player's charge/release input, attack frames
// (melee strike, bullet spawn), bullet flight and impact, spell flight and explosion, the victim
// side of a hit (objGameObject.takeHit -> modReel / modEnergy), reel and death progression,
// cooldown/regeneration counters and the exits-open rule.
import { rectAt } from '../mr-open/mr-collision'
import {
  aimWithEyestrain, bulletPush, cooldownReady, meleeHits, meleePush, rangedShot, resetCooldown, tickCooldown, cooldownIncrement,
} from '../mr-open/mr-attack'
import { bulletHits, bulletStalled, LANDED_TICKS } from '../mr-open/mr-bullet'
import type { ActorDef } from '../mr-open/mr-actor-data'
import type { Vec } from '../mr-open/mr-geometry'
import { arrivedAtTarget, chargeLimits, chargeLoc, chargeStep, explode, releaseVelocity, type SplashVictim } from '../mr-open/mr-spell'
import { isDead, reelFinished, regenStep, resolveHit, stallStep } from '../mr-open/mr-take-hit'
import { findTarget, hatedTeams } from '../mr-open/mr-targeting'
import { hostileTeamsTo } from '../mr-open/mr-team-data'
import { collisionRectFor, createActor, isAlive, isBullet, isCharacter, isSpell, spriteRectFor } from './actors'
import { onFreshFrame } from './anim'
import type { ActorState, ChargeKind, InputSnapshot, SimState } from './state'
import { spreadVec } from './rng'
import { actorIn, playerIn, type Tick } from './tick-context'
import { rollDetour, targetables } from './tick-ai'

/** Ticks an exploded spell stays for the render fade (objSpell startQuickFade). */
export const EXPLODE_TICKS = 8
/** Ticks the player's die mode lasts before the map restart is requested. */
export const PLAYER_DEATH_TICKS = 30
/** Release distance straight ahead when neither the mouse nor a hostile gives a target. */
const AHEAD_PX = 100
/** F fires this many px short of the nearest hostile. */
const SHORT_PX = 16

const isHeld = (input: InputSnapshot, kind: ChargeKind | null): boolean =>
  kind === 'mouse' ? input.chargeHeld : kind === 'nearest' ? input.shootNearest : kind === 'short' ? input.shootShort : false

/** Spawns an actor into the tick from `defs[key]` and returns the working copy. */
function spawn(t: Tick, key: string, pos: Vec, over: Partial<ActorState>): ActorState {
  const [actor, after] = createActor({ ...t.s, nextId: t.nextId }, key, pos)
  t.nextId = after.nextId
  const a: ActorState = { ...actor, ...over }
  t.actors.push(a)
  return a
}

function releaseTarget(t: Tick, p: ActorState, input: InputSnapshot, kind: ChargeKind | null): Vec {
  const ahead = { x: p.pos.x + (p.facingLeft ? -AHEAD_PX : AHEAD_PX), y: p.pos.y }
  const mouse = input.mouseWorld ?? ahead
  if (kind !== 'nearest' && kind !== 'short') return mouse
  const me = { id: p.id, team: p.team, pos: p.pos, alive: true }
  const nearestId = findTarget(me, targetables(t), hatedTeams(p.team, t.s.teams))
  const nearest = nearestId === null ? undefined : actorIn(t, nearestId)
  if (!nearest) return mouse
  if (kind === 'nearest') return { ...nearest.pos }
  const dx = nearest.pos.x - p.pos.x
  const dy = nearest.pos.y - p.pos.y
  const d = Math.hypot(dx, dy)
  if (d <= SHORT_PX) return { ...p.pos }
  return { x: nearest.pos.x - (dx / d) * SHORT_PX, y: nearest.pos.y - (dy / d) * SHORT_PX }
}

const moveTo = (a: ActorState, pos: Vec): void => {
  a.prevPos = a.pos
  a.pos = pos
}

/** objSpell.align with chargeOffsetSide #top: the ball sits on the charge loc, its bottom edge there (grows upward). */
function alignSpell(spell: ActorState, caster: ActorState, def: ActorDef): void {
  const at = chargeLoc(caster.pos, def, caster.facingLeft)
  moveTo(spell, { x: at.x, y: at.y - (spell.charge * (spell.attack ?? def.attack).chargeSize) / 2 })
}

/**
 * objAiPlayer.playerAttackCharge / playerAttackRelease with objAiAttack.chargeMagic / releaseMagic.
 * The AI's current spell (pCurrentSpell) is the player's spell still in `charge` mode; it belongs to
 * the AI, not to the character mode, so a hit forcing #walk (objPlayerMerlinCharacter.takeHit) keeps
 * it: while its key stays held, attack() -> chargeMagic re-enters #charge and keeps counting, and
 * letting go releases it from any mode. Without a current spell, a held Space/click, E or F starts
 * a charge whenever the cooldown is ready, even during the release strip (releaseSpell has already
 * cleared pCurrentSpell).
 */
export function stepPlayerAttack(t: Tick, input: InputSnapshot): void {
  const p = playerIn(t)
  if (!isAlive(p)) return
  const def = t.s.defs[p.def]!
  const spell = t.actors.find((a) => !t.removed.has(a.id) && isSpell(t.s, a) && a.ownerId === p.id && a.mode === 'charge')
  const limits = chargeLimits(def) // magic limit fixed at 100 %
  if (spell) {
    if (isHeld(input, p.ai.chargeKind)) {
      if (!cooldownReady(p.cooldown)) return // objAiAttack.attack
      p.mode = 'charge' // ensureMode(#charge)
      spell.charge = chargeStep(spell.charge, limits.speed, limits.max)
      alignSpell(spell, p, def)
      return
    }
    const target = releaseTarget(t, p, input, p.ai.chargeKind)
    spell.mode = 'fly'
    spell.targetPoint = target
    spell.vel = releaseVelocity(spell.pos, target, (spell.attack ?? def.attack).spellSpeed)
    p.mode = 'release'
    p.ai.chargeKind = null
    p.cooldown = resetCooldown(def.attack)
    return
  }
  if (p.mode === 'charge') {
    // the spell went away under the charge
    p.mode = 'walk'
    p.ai.chargeKind = null
  }
  const kind: ChargeKind | null = input.chargeHeld ? 'mouse' : input.shootNearest ? 'nearest' : input.shootShort ? 'short' : null
  if (kind === null || !cooldownReady(p.cooldown)) return
  if (!t.s.defs['spell']) throw new Error('actor definitions have no "spell" entry')
  // ensureSpell + setSpellProperties (the caster's attack and team), then chargeSpell at the start value
  const created = spawn(t, 'spell', chargeLoc(p.pos, def, p.facingLeft), {
    mode: 'charge', ownerId: p.id, charge: limits.start, team: p.team, attack: def.attack,
  })
  alignSpell(created, p, def)
  p.mode = 'charge'
  p.ai.chargeKind = kind
}

/**
 * modEnergy.loseEnergy: energy falls; at <= 0 the character dies (outOfEnergy -> #die). A CPU
 * character's energy becomes -100 in the engine; only the sign matters here.
 */
function loseEnergy(t: Tick, victim: ActorState, amount: number): void {
  victim.energy -= amount
  t.events.push({ kind: 'hit', id: victim.id })
  if (isDead(victim.energy)) {
    victim.mode = 'die'
    victim.age = 0
    t.events.push({ kind: 'died', id: victim.id })
  }
}

/**
 * objCPUCharacter.collisionWall / collisionVertical -> modEnergy.takeDamage: a character hitting a
 * wall while reeling takes the impact speed on that axis minus its damageSpeed, when above it.
 */
export function takeWallDamage(t: Tick, a: ActorState, speed: number): void {
  const excess = Math.abs(speed) - t.s.defs[a.def]!.damageSpeed
  if (a.mode === 'reel' && excess > 0) loseEnergy(t, a, excess)
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
  if (victim.mode === 'die' || victim.mode === 'dead' || victim.mode === 'finish' || isDead(victim.energy)) return push
  const def = t.s.defs[victim.def]!
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
    victim.ai.mode = 'dazed' // also ends a remake detour
    victim.ai.moveTarget = null
    victim.ai.walkTicks = 0
  }
  loseEnergy(t, victim, hit.damage)
  return hit.push
}

/** objAiAttack.updateAttack: perform the attack on its strip frame, finish when the strip has looped. */
export function stepAttackFrames(t: Tick): void {
  for (const a of t.actors) {
    if (t.removed.has(a.id) || a.ai.mode !== 'attack') continue
    const def = t.s.defs[a.def]!
    const atk = def.attack
    if (onFreshFrame(a, atk.animFrame)) {
      const target = a.ai.targetId === null ? undefined : actorIn(t, a.ai.targetId)
      if (target && isAlive(target)) {
        if (atk.type === 'melee') {
          if (meleeHits(a.pos, def, a.facingLeft, spriteRectFor(t.s, target))) applyHit(t, target, meleePush(def, a.facingLeft), atk.damageMultiplier)
          a.cooldown = resetCooldown(atk)
        } else if (atk.type === 'ranged' && atk.bullet) {
          const [aim, rng] = aimWithEyestrain(a.pos, target.pos, def, t.rng)
          t.rng = rng
          const shot = rangedShot(a.pos, aim, def, a.facingLeft)
          // remake: projectileSpreadDeg turns the shot by a small random angle
          const [vel, rng2] = spreadVec(t.rng, shot.vel, def.projectileSpreadDeg)
          t.rng = rng2
          spawn(t, atk.bullet, shot.spawn, { mode: 'fly', vel, ownerId: a.id, targetId: target.id, targetPoint: aim, team: a.team })
          a.cooldown = resetCooldown(atk)
        }
      }
    }
    if (a.animLooped) {
      a.mode = 'walk'
      a.ai.mode = 'findTarget'
      a.ai.targetId = null
      a.vel = { x: 0, y: 0 }
      // remake: a finished melee attack may start a spreading detour
      if (atk.type === 'melee') rollDetour(t, a, def)
    }
  }
}

/** objBullet.updateFly (stall -> land, target collision -> hit) and the landed strip. */
export function stepBullets(t: Tick): void {
  for (const a of t.actors) {
    if (t.removed.has(a.id) || !isBullet(t.s, a)) continue
    if (a.mode === 'fly') {
      if (bulletStalled(a.vel)) {
        // objBullet.goMode(#land): setVect(point(0,0)) - the landed arrow does not drift
        a.mode = 'land'
        a.age = 0
        a.vel = { x: 0, y: 0 }
        continue
      }
      const target = a.targetId === null ? undefined : actorIn(t, a.targetId)
      if (!target || !isAlive(target)) continue
      if (bulletHits(rectAt(a.pos, collisionRectFor(t.s, a)), target.pos, collisionRectFor(t.s, target))) {
        // objBullet.updateFly calls myTarget.takeHit and then CallPayloadFunction([#takeHit]) with the
        // same collisionVect: two pushes and two damage applications, the second with the vector
        // objGameObject.takeHit already scaled by the victim's inertia in place
        const def = t.s.defs[a.def]!
        const scaled = applyHit(t, target, bulletPush(a.vel, def), def.attack.damageMultiplier)
        applyHit(t, target, scaled, def.attack.damageMultiplier)
        t.removed.add(a.id)
      }
    } else if (a.mode === 'land') {
      a.age++
      if (a.age >= LANDED_TICKS) t.removed.add(a.id)
    }
  }
}

/** objSpell: flight until PointArrivedAtTarget, then goMode(#explode) -> teamMaster.impactAttack, then the fade. */
export function stepSpells(t: Tick): void {
  for (const a of t.actors) {
    if (t.removed.has(a.id) || !isSpell(t.s, a)) continue
    if (a.mode === 'charge') {
      // objAiAttack.cancelAttack on the caster's #dead finishes the charging spell
      const owner = a.ownerId === null ? undefined : actorIn(t, a.ownerId)
      if (!owner || !isAlive(owner)) t.removed.add(a.id)
    } else if (a.mode === 'fly') {
      if (a.targetPoint && arrivedAtTarget(a.pos, a.targetPoint, a.vel)) explodeSpell(t, a)
    } else if (a.mode === 'explode') {
      a.age++
      if (a.age >= EXPLODE_TICKS) t.removed.add(a.id)
    }
  }
}

/**
 * objSpell.goMode(#explode) with the spell's own attack copy and team (setSpellProperties). The
 * spell is placed on its target point before exploding: objMoveXY.update says "pLoc can be adjusted
 * by fin so as not to overshoot targetLoc", but no snapping code survives in the export, and the
 * original explodes centred on the cursor. prevPos is pinned so the renderer does not slide the
 * explosion.
 */
function explodeSpell(t: Tick, spell: ActorState): void {
  const atk = spell.attack
  if (!atk) throw new Error(`spell ${spell.id} has no attack (setSpellProperties was not applied)`)
  if (spell.targetPoint) spell.pos = { ...spell.targetPoint }
  const hated = hatedTeams(spell.team, t.s.teams)
  const victims: SplashVictim[] = t.actors
    .filter((v) => !t.removed.has(v.id) && isCharacter(t.s, v) && isAlive(v) && hated.includes(v.team))
    .map((v) => {
      const r = spriteRectFor(t.s, v)
      return { id: v.id, pos: v.pos, radius: (r.right - r.left) / 2 }
    })
  const ex = explode(spell.pos, spell.charge, atk, victims)
  // remake: the caster's knockbackSpreadDeg turns each push by a small random angle
  const caster = t.actors.find((c) => c.id === spell.ownerId)
  const spread = caster ? t.s.defs[caster.def]!.knockbackSpreadDeg : 0
  for (const { id, push } of ex.pushes) {
    const victim = actorIn(t, id)
    if (!victim) continue
    const [turned, rng] = spreadVec(t.rng, push, spread)
    t.rng = rng
    applyHit(t, victim, turned, atk.damageMultiplier)
  }
  t.events.push({ kind: 'explode', pos: spell.pos, radius: ex.radius })
  spell.charge *= atk.chargeExplodeFactor
  spell.mode = 'explode'
  spell.vel = { x: 0, y: 0 }
  spell.prevPos = spell.pos
  spell.age = 0
}

/** modReel.updateReel, objCharacter #die -> #dead, objCPUCharacter.updateDead -> #finish (grave), the player's release strip and death timer. */
export function stepReelAndDeath(t: Tick): void {
  for (const a of t.actors) {
    if (t.removed.has(a.id)) continue
    const def = t.s.defs[a.def]!
    const wasMode = t.prev.get(a.id)?.mode
    switch (a.mode) {
      case 'reel':
        if (t.hit.has(a.id)) break // modReel.updateReel first runs on the update after the hit
        a.stall = stallStep(a.stall, { x: a.pos.x - a.prevPos.x, y: a.pos.y - a.prevPos.y })
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

/** modWeaponManager.updateCooldowns and modEnergy.recoverEnergy for every character. */
export function stepCooldownsAndRegen(t: Tick): void {
  for (const a of t.actors) {
    if (t.removed.has(a.id) || !isCharacter(t.s, a)) continue
    const def = t.s.defs[a.def]!
    a.cooldown = tickCooldown(a.cooldown, cooldownIncrement(def))
    const [energy, counter] = regenStep(a.energy, def.energy, a.regenCounter, def.energyRecoverDelay)
    a.energy = energy
    a.regenCounter = counter
  }
}

/**
 * teamMaster.isPlayerEnemiesDead over the given actors: no member left in a team hostile to the
 * player. Dying and dead characters are still members; they leave the team only in #finish
 * (objGameObject.finish -> leaveTeam), i.e. once their grave has been recorded.
 */
export function exitsOpenFor(s: SimState, actors: ActorState[]): boolean {
  const hostile = hostileTeamsTo(s.defs['player']!.team, s.teams)
  return !actors.some((a) => hostile.includes(a.team) && isCharacter(s, a) && a.mode !== 'finish')
}
