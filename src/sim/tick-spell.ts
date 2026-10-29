// Spells in play (combat notes §5, spells notes §4-5): a spell created over its caster
// (objAiAttack.ensureSpell), the multistage summons' permission and rein-in
// (modSpellMultistage), the release (objSpell.releaseNormal, or modFireBullets for pulses and
// beams, or the remake's volleys), the flight, and the explosion with its payload functions, summons and mines. The
// player's charge input is in tick-player-attack.ts, the AI casters' in tick-caster.ts; the victim
// side of a hit is in tick-combat.ts.
import type { ActorDef, AttackDef, VolleyDef } from '../mr-open/mr-actor-data'
import { ARMY_SUMMON, takeUnit, topAvailableStage } from '../mr-open/mr-army'
import { attackLoc, resetCooldown } from '../mr-open/mr-attack'
import { tileOfPx } from '../mr-open/mr-collision'
import type { Vec } from '../mr-open/mr-geometry'
import { gmgMuzzle, gmgSpellCentre, gmgStrip, isSpellStream } from '../mr-open/mr-golden-machine-gun'
import { BEAM_JITTER, ENERGY_MINE, chargeAfterBullet, fireBulletsPeriod, mineCount, mineSpread } from '../mr-open/mr-mine'
import { spellChargeVolume } from '../mr-open/mr-sound'
import {
  armyReinIn, arrivedAtTarget, chargeDamageMultiplier, chargeLimits, chargeLoc, explode, payloadFor, payloadFunctionsFor, reinedInCharge, releaseVelocity, sendsAlliesHome, spellFlightSpeed, stageNumber,
} from '../mr-open/mr-spell'
import { friendlyTeams, hatedTeams } from '../mr-open/mr-targeting'
import { defOf, isAlive, isSpell } from './actors'
import { spellAimPoint } from './player-aim'
import { armyMembersInPlay, summonWholeReserve } from './tick-army'
import { nextRandom, randomInt, roughly, spreadVec } from './rng'
import type { ActorState, InputSnapshot } from './state'
import { actorIn, hitTargetIn, playSound, spawn, type Tick } from './tick-context'
import { nearestHostileId } from './tick-ai'
import { applyPayload, splashVictims, withOwnerDamage } from './tick-combat'
import { reservationTeamOf, teamHasRoomFor } from './tick-dwelling'
import {
  isVolleyStream, launchToLand, shotAngleDeg, shotDue, shotSpeedFactor, streamShotAngleDeg, streamShotCharge, streamShotDue, streamShotSpeedFactor, turnAndScale, volleyBallPx, volleyIconPx,
  volleyLaunch, volleyProjectileAttack, volleyShots,
} from './volley'
import type { Size } from './view'

/** attack.explodeFunction of summon spells (modSpellMultistage.doExplodeFunction). */
export const SUMMON_UNIT = 'summonUnit'
/** attack.explodeFunction of the energy mines spell. */
const DEPOSIT_MINES = 'depositMines'

/** Ticks an exploded spell stays for the render fade (objSpell startQuickFade). */
export const EXPLODE_TICKS = 8

/**
 * objSpell.align with chargeOffsetSide #top: the ball sits on the charge loc, its bottom edge there
 * (grows upward); fired through the golden machine gun (#side), beside the gun's muzzle.
 */
export function alignSpell(spell: ActorState, caster: ActorState, def: ActorDef): void {
  const ballPx = spellBallPx(spell, def.attack)
  spell.prevPos = spell.pos
  if ((spell.attack ?? def.attack).gmgOn) {
    spell.pos = gmgSpellCentre(caster.pos, def.gmgChargeLoc, caster.facingLeft, ballPx)
    return
  }
  const at = chargeLoc(caster.pos, def, caster.facingLeft)
  spell.pos = { x: at.x, y: at.y - ballPx / 2 }
}

/** The charging ball's diameter: charge x chargeSize; a volley's grows to hold its icon stack (remake). */
export function spellBallPx(spell: ActorState, casterAttack: AttackDef): number {
  const atk = spell.attack ?? casterAttack
  // firing, a volley's ball shrinks with the charge each shot spends; a growing icon (no ball) stands in for it
  if (!atk.volley) return spell.charge * atk.chargeSize
  return atk.volley.growingIconPx > 0 ? volleyIconPx(spell.charge, atk.volley) : volleyBallPx(spell.charge, atk.chargeSize, atk.volley)
}

/**
 * objAiAttack.releaseMagic: the caster plays its release strip and the cooldown restarts. The spell
 * flies at spellSpeed toward `target` (objSpell.releaseNormal, with its release sound), or with
 * releaseFunction #fireBullets stays where it is and fires (modFireBullets #spellReleased),
 * aiming where its caster aims (`kind` for Merlin). A gun stream (a volley's, or the mines')
 * has fired as it charged: let go, what is left of its charge goes with it. Remake: any other spell
 * fired through the gun leaves from its muzzle (launchFromMuzzle).
 */
export function releaseMagic(t: Tick, caster: ActorState, def: ActorDef, spell: ActorState, target: Vec): void {
  const atk = spell.attack ?? def.attack
  const stream = isGunStream(atk)
  if (atk.gmgOn && !stream) launchFromMuzzle(t, caster, spell, atk)
  if (stream) {
    t.removed.add(spell.id)
  } else if (atk.releaseFunction === 'fireBullets') {
    spell.mode = 'fireBullets'
    spell.age = 0
    spell.ai.chargeKind = caster.ai.chargeKind
  } else if (atk.volley !== null) {
    // remake: the volley fires from where the spell stands, toward the aim at the release
    spell.mode = 'volley'
    spell.age = 0
    spell.targetPoint = target
    spell.volley = { total: volleyShots(spell.charge, atk.volley), fired: 0 }
    playSound(t, atk.releaseSound, spellChargeVolume(spell.charge, atk))
  } else {
    spell.mode = 'fly'
    spell.targetPoint = target
    spell.vel = releaseVelocity(spell.pos, target, spellFlightSpeed(atk))
    // objSpell.releaseNormal -> playReleaseSound (objSpell.txt:219-226, :247)
    playSound(t, atk.releaseSound, spellChargeVolume(spell.charge, atk))
  }
  caster.mode = 'release'
  caster.cooldown = resetCooldown(def.attack)
}

/** Remake: a gun spell streams while held (a volley's projectiles, or the mines' spells) instead of being released. */
const isGunStream = (a: AttackDef): boolean => isVolleyStream(a) || isSpellStream(a)

/**
 * Remake (owner): where a spell fired through the golden machine gun leaves from: the gun's muzzle
 * (gmgMuzzle on Merlin's still gun frame, plus the attack's gmgMuzzleShift); beside the muzzle at
 * gmgChargeLoc when his sprite has no gun frame.
 */
export function muzzleOf(t: Tick, caster: ActorState, atk: AttackDef): Vec {
  const def = defOf(t.s, caster)
  const frame = t.s.anims[def.name]?.[gmgStrip(false)]
  if (!frame?.reg) return gmgSpellCentre(caster.pos, { x: def.gmgChargeLoc.x + atk.gmgMuzzleShift, y: def.gmgChargeLoc.y }, caster.facingLeft, 0)
  return gmgMuzzle(caster.pos, { w: frame.w, h: frame.h, reg: frame.reg }, caster.facingLeft, atk.gmgMuzzleShift)
}

/** The released gun spell moved from beside the muzzle onto it, without a slide in the drawing. */
function launchFromMuzzle(t: Tick, caster: ActorState, spell: ActorState, atk: AttackDef): void {
  spell.pos = muzzleOf(t, caster, atk)
  spell.prevPos = spell.pos
}

/** The caster's spell still charging (the AI's pCurrentSpell), if any. */
export function chargingSpellOf(t: Tick, caster: ActorState): ActorState | undefined {
  return t.actors.find((a) => !t.removed.has(a.id) && isSpell(t.s, a) && a.ownerId === caster.id && a.mode === 'charge')
}

/**
 * objAiAttack.ensureSpell + setSpellProperties (the caster's attack and team): a new spell at the
 * start charge, aligned over the caster, which goes into #charge.
 */
export function startSpell(t: Tick, caster: ActorState, def: ActorDef): ActorState {
  if (!t.s.defs['spell']) throw new Error('actor definitions have no "spell" entry')
  const created = spawn(t, 'spell', chargeLoc(caster.pos, def, caster.facingLeft), {
    mode: 'charge',
    ownerId: caster.id,
    charge: chargeLimits(def).start,
    team: caster.team,
    attack: def.attack,
  })
  alignSpell(created, caster, def)
  caster.mode = 'charge'
  return created
}

/**
 * modSpellMultistage.chargeMultistage after a charge step of a summon spell: the first stage reached
 * asks for a team slot (obtainPermissionOrHalt; refused, chargeReinIn drops the charge below the
 * first stage), and the army summon is held below the stage above the best unit in the reserve
 * (chargeReinInToAvailable). Returns whether the charge was limited (#chargeLimited).
 */
export function stepMultistage(t: Tick, spell: ActorState): boolean {
  const atk = spell.attack
  if (!atk || atk.explodeFunction !== SUMMON_UNIT || atk.multistage.length === 0) return false
  let limited = false
  if (spell.summonReserved === 0 && stageNumber(spell.charge, atk) >= 1) {
    if (teamHasRoomFor(t, reservationTeamOf(t.s, spell, atk), 1)) spell.summonReserved = 1
    else {
      spell.charge = reinedInCharge(atk)
      limited = true
    }
  }
  if (atk.name === ARMY_SUMMON) {
    const held = armyReinIn(spell.charge, atk, topAvailableStage(t.army, spell.team, atk))
    if (held !== null) {
      spell.charge = held
      limited = true
    }
  }
  return limited
}

/**
 * objSpell: flight until PointArrivedAtTarget, then goMode(#explode) -> teamMaster.impactAttack, then
 * the fade; a #fireBullets spell fires until its charge runs out. `input` and `view` aim Merlin's
 * pulses and beams (objAiPlayer.getTargetLoc at each shot).
 */
export function stepSpells(t: Tick, input: InputSnapshot, view: Size): void {
  for (const a of t.actors) {
    if (t.removed.has(a.id) || !isSpell(t.s, a)) continue
    if (a.mode === 'charge') {
      // objAiAttack.cancelAttack on the caster's #dead finishes the charging spell
      const owner = a.ownerId === null ? undefined : actorIn(t, a.ownerId)
      if (!owner || !isAlive(owner)) t.removed.add(a.id)
    } else if (a.mode === 'fly') {
      if (a.targetPoint && arrivedAtTarget(a.pos, a.targetPoint, a.vel)) explodeSpell(t, a)
    } else if (a.mode === 'fireBullets') {
      stepFireBullets(t, a, input, view)
    } else if (a.mode === 'volley') {
      stepVolley(t, a)
    } else if (a.mode === 'explode') {
      a.age++
      if (a.age >= EXPLODE_TICKS) t.removed.add(a.id)
    }
  }
}

/**
 * modFireBullets.updateFireBullets: a bullet every fireBulletsPeriod ticks; the spell is gone after
 * the last. A fractional period (remake fireRateScale) carries what is over into the next wait.
 */
function stepFireBullets(t: Tick, spell: ActorState, input: InputSnapshot, view: Size): void {
  const atk = spell.attack!
  const period = fireBulletsPeriod(atk)
  spell.age++
  if (spell.age < period) return
  spell.age -= period
  const next = chargeAfterBullet(spell.charge, atk)
  spell.charge = next.charge
  const target = ownerAim(t, spell, input, view)
  if (target) {
    if (atk.beam) fireBeam(t, spell, atk, target)
    else firePulse(t, spell, atk, target)
  }
  if (next.last) t.removed.add(spell.id)
}

/**
 * Remake volley: every projectile due fires (one every staggerTicks from the release); the spell
 * shrinks by chargePerShot with each and is gone after the last, or when its caster is.
 */
function stepVolley(t: Tick, spell: ActorState): void {
  const atk = spell.attack!
  const v = atk.volley
  const volley = spell.volley!
  const owner = spell.ownerId === null ? undefined : actorIn(t, spell.ownerId)
  if (!owner || !isAlive(owner) || !v) {
    t.removed.add(spell.id)
    return
  }
  const aim = spell.targetPoint
  while (volley.fired < volley.total && shotDue(spell.age, volley.fired, v)) {
    const { fired, total } = volley
    if (aim) fireVolleyShot(t, spell, atk, v, owner, { aim, charge: spell.charge, angleDeg: (u) => shotAngleDeg(fired, total, v, u), speedFactor: (u) => shotSpeedFactor(fired, v, u) })
    volley.fired++
    spell.charge = Math.max(0, spell.charge - v.chargePerShot)
  }
  spell.age++
  if (volley.fired >= volley.total) t.removed.add(spell.id)
}

/**
 * Remake (the golden machine gun's volley, isVolleyStream): while held, a projectile at `aim`
 * whenever the charge holds one (streamShotCharge: chargePerShot, or a fireball's gmgShotCharge),
 * each spending that and fired at it (a fireball's blast too); the stream's count
 * (spell.volley.fired) spreads the later ones.
 */
export function streamVolley(t: Tick, caster: ActorState, spell: ActorState, aim: Vec): void {
  const atk = spell.attack
  const v = atk?.volley
  if (!atk || !v) return
  const stream = spell.volley ?? { total: 0, fired: 0 }
  const shot = streamShotCharge(v)
  while (streamShotDue(spell.charge, v)) {
    const index = stream.fired
    fireVolleyShot(t, spell, atk, v, caster, { aim, charge: shot, angleDeg: (u) => streamShotAngleDeg(index, v, u), speedFactor: (u) => streamShotSpeedFactor(index, v, u) })
    stream.fired++
    stream.total = stream.fired
    spell.charge = Math.max(0, spell.charge - shot)
  }
  spell.volley = stream
}

/**
 * Remake (gmgStreamSlowdown, the mines in gun mode): while held, whenever the charge holds
 * chargePerUnit, a spell of that charge (one mine) leaves the muzzle for `aim` as a released one
 * would, with its release sound; the held spell keeps the rest.
 */
export function streamSpell(t: Tick, caster: ActorState, spell: ActorState, aim: Vec): void {
  const atk = spell.attack
  if (!atk || atk.chargePerUnit <= 0) return
  while (spell.charge + STREAM_EPSILON >= atk.chargePerUnit) {
    const from = muzzleOf(t, caster, atk)
    const vel = releaseVelocity(from, aim, spellFlightSpeed(atk))
    spawn(t, 'spell', from, { mode: 'fly', ownerId: caster.id, team: spell.team, attack: atk, charge: atk.chargePerUnit, targetPoint: aim, vel })
    playSound(t, atk.releaseSound, spellChargeVolume(atk.chargePerUnit, atk))
    spell.charge = Math.max(0, spell.charge - atk.chargePerUnit)
  }
}

/** Keeps a charge sitting exactly on a shot's worth from rounding down the shot. */
const STREAM_EPSILON = 1e-9

/** One volley projectile's aim, the charge it is fired at, and its place in the fan (angle and speed from a uniform draw). */
interface VolleyShot {
  aim: Vec
  charge: number
  angleDeg: (u: number) => number
  speedFactor: (u: number) => number
}

/**
 * One projectile of a volley: the attack's bullet launched from the spell or Merlin (launchFrom) toward the aim (volleyLaunch;
 * one that explodes on landing only as fast as lands it on the aim), turned to its place in the fan
 * and its speed jittered. It carries volleyProjectileAttack (the bullet's attack with the volley's
 * damageMultiplier, the spell's hit roles, dwellings too, any chill, and a blast grown from the
 * shot's charge) and hits the first hostile unit it touches (a burstOnContact one bursts on it).
 */
function fireVolleyShot(t: Tick, spell: ActorState, atk: AttackDef, volley: VolleyDef, owner: ActorState, shot: VolleyShot): void {
  const bulletDef = atk.bullet ? t.s.defs[atk.bullet] : undefined
  if (!bulletDef) return
  const ownerDef = defOf(t.s, owner)
  const from = atk.gmgOn ? muzzleOf(t, owner, atk) : volley.launchFrom === 'caster' ? attackLoc(owner.pos, ownerDef.attack, owner.facingLeft) : spell.pos
  const [angleU, r1] = nextRandom(t.rng)
  const [speedU, r2] = nextRandom(r1)
  t.rng = r2
  const launch = volleyLaunch(from, shot.aim, ownerDef.strength, atk.firingType, volley)
  const base = bulletDef.explodeEvents.includes('bulletLanded') ? launchToLand(from, shot.aim, launch, bulletDef.friction, volley.minLandingSpeedShare) : launch
  const vel = turnAndScale(base, shot.angleDeg(angleU), shot.speedFactor(speedU))
  const attack = volleyProjectileAttack(bulletDef.attack, atk.hits, volley, shot.charge)
  spawn(t, bulletDef.key, from, { mode: 'fly', vel, ownerId: spell.ownerId, team: spell.team, attack, hitsFirstHostile: true, burstsOnContact: volley.burstOnContact, piercesLeft: volley.pierce })
  // remake: a gun stream's shot without a sound of its own (the shuriken fan's) swooshes as a release
  if (atk.sound !== null) playSound(t, atk.sound, atk.volume)
  else if (atk.gmgOn) playSound(t, atk.releaseSound, spellChargeVolume(shot.charge, atk))
}

/** objSpell.getTargetLoc -> owner.getTargetLoc: where Merlin aims, a CPU caster's target, or none. */
function ownerAim(t: Tick, spell: ActorState, input: InputSnapshot, view: Size): Vec | null {
  const owner = spell.ownerId === null ? undefined : actorIn(t, spell.ownerId)
  if (!owner || !isAlive(owner)) return null
  if (owner.id === t.s.playerId) return spellAimPoint(t, owner, input, spell.ai.chargeKind, view, spell.attack ?? defOf(t.s, owner).attack)
  const target = owner.ai.targetId === null ? undefined : actorIn(t, owner.ai.targetId)
  return target ? { ...target.pos } : null
}

/**
 * modAttack.performRangedAttack from the spell: the attack says #throwType, not #firingType, so the
 * bullet flies #proportional (distance / 10). The spell has no target, so the bullet takes
 * teamMaster.findTarget's nearest hated unit (objBullet pRandomTarget).
 */
function firePulse(t: Tick, spell: ActorState, atk: AttackDef, target: Vec): void {
  if (!atk.bullet || !t.s.defs[atk.bullet]) return
  const vel = { x: (target.x - spell.pos.x) / 10, y: (target.y - spell.pos.y) / 10 }
  const bullet = spawn(t, atk.bullet, spell.pos, { mode: 'fly', vel, ownerId: spell.ownerId, targetPoint: target, team: spell.team })
  bullet.targetId = nearestHostileId(t, bullet)
}

/**
 * modAttack.performBeamAttack: a beam bullet at the target loc moved by random(20) - 10 on each axis,
 * standing still and stretched from the spell (objBullet.setBeam); it lands, and so explodes, at once.
 */
function fireBeam(t: Tick, spell: ActorState, atk: AttackDef, target: Vec): void {
  if (!atk.bullet || !t.s.defs[atk.bullet]) return
  const at = { x: target.x + jitter(t), y: target.y + jitter(t) }
  const bullet = spawn(t, atk.bullet, at, { mode: 'fly', ownerId: spell.ownerId, targetPoint: at, team: spell.team, beamFrom: { ...spell.pos } })
  bullet.targetId = nearestHostileId(t, bullet)
}

/** random(BEAM_JITTER) - BEAM_JITTER / 2 on the tick's RNG. */
function jitter(t: Tick): number {
  const [n, rng] = randomInt(t.rng, BEAM_JITTER)
  t.rng = rng
  return n - BEAM_JITTER / 2
}

/**
 * modSpellMultistage.summonPayload -> armyMaster.createUnitFromSummonSpell: the stage's unit on the
 * spell's position with its own data (a solid tile cancels it), and the reserved slot is given
 * back. The army summon takes the unit from the reserve army (none there: nothing), and it
 * teleports in (armyTeleportIn).
 */
function summonPayload(t: Tick, spell: ActorState, atk: AttackDef): void {
  const payload = payloadFor(spell.charge, atk)
  spell.summonReserved = 0
  if (payload === null || !t.s.defs[payload]) return
  if (t.s.grid.solidAt(tileOfPx(spell.pos.x), tileOfPx(spell.pos.y))) return
  if (atk.name !== ARMY_SUMMON) {
    spawn(t, payload, spell.pos, {})
    return
  }
  const army = takeUnit(t.army, spell.team, payload)
  if (!army) return
  t.army = army
  spawn(t, payload, spell.pos, { teleport: 'in', teleportAge: 0 })
}

/**
 * modSpellMultistage.depositMines: charge / chargePerUnit energy mines around the spell, each within
 * VarRoughly(charge / 2) on each axis, owned by the caster; a solid tile cancels one.
 */
function depositMines(t: Tick, spell: ActorState, atk: AttackDef): void {
  if (!t.s.defs[ENERGY_MINE]) return
  const spread = mineSpread(spell.charge)
  for (let i = 0; i < mineCount(spell.charge, atk); i++) {
    const [dx, r1] = roughly(t.rng, spread)
    const [dy, r2] = roughly(r1, spread)
    t.rng = r2
    const at = { x: spell.pos.x + dx, y: spell.pos.y + dy }
    if (t.s.grid.solidAt(tileOfPx(at.x), tileOfPx(at.y))) continue
    spawn(t, ENERGY_MINE, at, { mode: 'stand', ownerId: spell.ownerId })
  }
}

/**
 * Remake (blankSummonsReserve, owner request): a blank army summon (it sends allies home) of Merlin's
 * lands with none of his army in play, so it summons the whole reserve there instead, as R does.
 */
function blankSummonsReserve(t: Tick, spell: ActorState, atk: AttackDef): boolean {
  if (!atk.blankSummonsReserve || !sendsAlliesHome(spell.charge, atk) || spell.ownerId !== t.s.playerId) return false
  const owner = actorIn(t, spell.ownerId)
  return owner !== undefined && isAlive(owner) && armyMembersInPlay(t, owner).length === 0
}

/** Remake (chargeDamageBonus): the attack with its damage scaled for the spell's charge at release. */
function withChargeDamage(atk: AttackDef, charge: number): AttackDef {
  const m = chargeDamageMultiplier(charge, atk)
  return m === 1 ? atk : { ...atk, damageMultiplier: atk.damageMultiplier * m }
}

/**
 * objSpell.goMode(#explode) with the spell's own attack copy and team (setSpellProperties). The
 * spell is placed on its target point before exploding: objMoveXY.update says "pLoc can be adjusted
 * by fin so as not to overshoot targetLoc", but no snapping code survives in the export, and the
 * original explodes centred on the cursor. prevPos is pinned so the renderer does not slide the
 * explosion. impactAttack calls the payload functions (the stage's, once a summon stage is
 * reached); then doExplodeFunction summons or lays mines.
 */
function explodeSpell(t: Tick, spell: ActorState): void {
  const atk = spell.attack
  if (!atk) throw new Error(`spell ${spell.id} has no attack (setSpellProperties was not applied)`)
  if (spell.targetPoint) spell.pos = { ...spell.targetPoint }
  // impactAttack's teams by the attack's allegiance: hated ones, or friends and the own team (heal)
  const teams = atk.targetAllegiance === 'friendly' ? friendlyTeams(spell.team, t.s.teams) : hatedTeams(spell.team, t.s.teams)
  const victims = splashVictims(t, teams, atk.hits)
  // objSpell.goMode(#explode) (objSpell.txt:146-155): the volume comes from the charge before chargeExplodeFactor
  const explodeVolume = spellChargeVolume(spell.charge, atk)
  const ex = explode(spell.pos, spell.charge, atk, victims)
  const payloadFunctions = payloadFunctionsFor(spell.charge, atk)
  const summonsReserve = blankSummonsReserve(t, spell, atk)
  // remake: the caster's knockbackSpreadDeg turns each push by a small random angle
  const caster = t.actors.find((c) => c.id === spell.ownerId)
  const spread = caster ? defOf(t.s, caster).knockbackSpreadDeg : 0
  const dealt = withChargeDamage(withOwnerDamage(t, spell, atk), spell.charge)
  for (const { id, push } of ex.pushes) {
    const victim = hitTargetIn(t, id)
    if (!victim) continue
    const [turned, rng] = spreadVec(t.rng, push, spread)
    t.rng = rng
    applyPayload(t, victim, turned, dealt, payloadFunctions)
  }
  t.events.push({ kind: 'explode', pos: spell.pos, radius: ex.radius })
  playSound(t, atk.explodeSound, explodeVolume)
  // the summon is the payload selected while charging; the mines go by the charge after the factor
  if (atk.explodeFunction === SUMMON_UNIT) summonPayload(t, spell, atk)
  if (summonsReserve) summonWholeReserve(t, actorIn(t, spell.ownerId!)!, spell.pos)
  spell.charge *= atk.chargeExplodeFactor
  if (atk.explodeFunction === DEPOSIT_MINES) depositMines(t, spell, atk)
  spell.mode = 'explode'
  spell.vel = { x: 0, y: 0 }
  spell.prevPos = spell.pos
  spell.age = 0
}
