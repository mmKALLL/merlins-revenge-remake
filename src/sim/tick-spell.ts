// The player's spell (combat notes §4, §6): charge / resume / release input (objAiPlayer with
// objAiAttack.chargeMagic / releaseMagic), spell flight and explosion (objSpell). The victim side
// of an explosion push is applyHit in tick-combat.ts.
import type { ActorDef, AttackDef } from '../mr-open/mr-actor-data'
import { tileOfPx } from '../mr-open/mr-collision'
import { friendlyTeams, hatedTeams } from '../mr-open/mr-targeting'
import { cooldownReady, resetCooldown } from '../mr-open/mr-attack'
import type { Vec } from '../mr-open/mr-geometry'
import { chargeVolume } from '../mr-open/mr-sound'
import { arrivedAtTarget, chargeLimits, chargeLoc, chargeStep, explode, payloadFor, releaseVelocity } from '../mr-open/mr-spell'
import { defOf, isAlive, isSpell } from './actors'
import { spreadVec } from './rng'
import type { ActorState, ChargeKind, InputSnapshot } from './state'
import { actorIn, hitTargetIn, playerIn, playSound, sleeperIn, spawn, type Tick } from './tick-context'
import { applyHit, splashVictims } from './tick-combat'
import { nearestHostileId } from './tick-ai'

/** attack.explodeFunction of summon spells (modSpellMultistage.doExplodeFunction). */
export const SUMMON_UNIT = 'summonUnit'

/** Ticks an exploded spell stays for the render fade (objSpell startQuickFade). */
export const EXPLODE_TICKS = 8
/** Release distance straight ahead when neither the mouse nor a hostile gives a target. */
const AHEAD_PX = 100
/** The push-back shot (Space with the F toggle on) lands this many px short of the nearest hostile, toward the player. */
const SHORT_PX = 18

/** The input flag that holds each kind of charge; checked in this order when a charge starts. */
const CHARGE_INPUT: Record<ChargeKind, 'chargeHeld' | 'shootNearest' | 'shootShort'> = {
  mouse: 'chargeHeld',
  nearest: 'shootNearest',
  short: 'shootShort',
}

const isHeld = (input: InputSnapshot, kind: ChargeKind | null): boolean => kind !== null && input[CHARGE_INPUT[kind]]

function chargeKindFor(input: InputSnapshot): ChargeKind | null {
  for (const kind of Object.keys(CHARGE_INPUT) as ChargeKind[]) if (input[CHARGE_INPUT[kind]]) return kind
  return null
}

/** Where a released spell flies: the mouse (else straight ahead), the nearest hostile, or SHORT_PX short of it. */
function releaseTarget(t: Tick, p: ActorState, input: InputSnapshot, kind: ChargeKind | null): Vec {
  const ahead = { x: p.pos.x + (p.facingLeft ? -AHEAD_PX : AHEAD_PX), y: p.pos.y }
  const mouse = input.mouseWorld ?? ahead
  if (kind !== 'nearest' && kind !== 'short') return mouse
  const nearestId = nearestHostileId(t, p, true)
  const nearest = nearestId === null ? undefined : (actorIn(t, nearestId) ?? sleeperIn(t, nearestId))
  if (!nearest) return mouse
  if (kind === 'nearest') return { ...nearest.pos }
  const dx = nearest.pos.x - p.pos.x
  const dy = nearest.pos.y - p.pos.y
  const d = Math.hypot(dx, dy)
  if (d <= SHORT_PX) return { ...p.pos }
  return { x: nearest.pos.x - (dx / d) * SHORT_PX, y: nearest.pos.y - (dy / d) * SHORT_PX }
}

/** objSpell.align with chargeOffsetSide #top: the ball sits on the charge loc, its bottom edge there (grows upward). */
export function alignSpell(spell: ActorState, caster: ActorState, def: ActorDef): void {
  const at = chargeLoc(caster.pos, def, caster.facingLeft)
  spell.prevPos = spell.pos
  spell.pos = { x: at.x, y: at.y - (spell.charge * (spell.attack ?? def.attack).chargeSize) / 2 }
}

/**
 * objAiPlayer.playerAttackCharge / playerAttackRelease with objAiAttack.chargeMagic / releaseMagic.
 * The AI's current spell (pCurrentSpell) is the player's spell still in `charge` mode; it belongs to
 * the AI, not to the character mode, so a hit forcing #walk (objPlayerMerlinCharacter.takeHit) keeps
 * it: while its key stays held, attack() -> chargeMagic re-enters #charge and keeps counting, and
 * letting go releases it from any mode. Without a current spell, a held Space/click or E starts
 * a charge whenever the cooldown is ready, even during the release strip (releaseSpell has already
 * cleared pCurrentSpell).
 */
export function stepPlayerAttack(t: Tick, input: InputSnapshot): void {
  const p = playerIn(t)
  if (!isAlive(p)) return
  const def = defOf(t.s, p)
  const spell = chargingSpellOf(t, p)
  if (!spell) startCharge(t, p, def, input)
  else if (isHeld(input, p.ai.chargeKind)) continueCharge(p, def, spell)
  else releaseSpell(t, p, def, spell, input)
}

function continueCharge(p: ActorState, def: ActorDef, spell: ActorState): void {
  if (!cooldownReady(p.cooldown)) return // objAiAttack.attack
  const limits = chargeLimits(def) // magic limit fixed at 100 %
  p.mode = 'charge' // ensureMode(#charge)
  spell.charge = chargeStep(spell.charge, limits.speed, limits.max)
  alignSpell(spell, p, def)
}

function releaseSpell(t: Tick, p: ActorState, def: ActorDef, spell: ActorState, input: InputSnapshot): void {
  releaseMagic(t, p, def, spell, releaseTarget(t, p, input, p.ai.chargeKind))
  p.ai.chargeKind = null
}

/**
 * objAiAttack.releaseMagic: the spell flies at spellSpeed toward `target`, the caster plays its
 * release strip and the cooldown restarts.
 */
export function releaseMagic(t: Tick, caster: ActorState, def: ActorDef, spell: ActorState, target: Vec): void {
  const atk = spell.attack ?? def.attack
  spell.mode = 'fly'
  spell.targetPoint = target
  spell.vel = releaseVelocity(spell.pos, target, atk.spellSpeed)
  // objSpell.releaseNormal -> playReleaseSound (objSpell.txt:219-226, :247)
  playSound(t, atk.releaseSound, chargeVolume(spell.charge, atk.chargeVolumeMap))
  caster.mode = 'release'
  caster.cooldown = resetCooldown(def.attack)
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

function startCharge(t: Tick, p: ActorState, def: ActorDef, input: InputSnapshot): void {
  if (p.mode === 'charge') {
    // the spell went away under the charge
    p.mode = 'walk'
    p.ai.chargeKind = null
  }
  const kind = chargeKindFor(input)
  if (kind === null || !cooldownReady(p.cooldown)) return
  startSpell(t, p, def)
  p.ai.chargeKind = kind
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

const TAKE_HIT = 'takeHit'
const TAKE_HEAL = 'takeHeal'
/** modEnergy.takeHeal: energy += (|vx| + |vy|) * this, up to the maximum. */
const HEAL_PER_PUSH = 2

/** modEnergy.takeHeal (no push, no reel): the healed unit gains twice the collision vector's Manhattan length. */
function takeHeal(t: Tick, victim: ActorState, push: Vec): void {
  const max = defOf(t.s, victim).maxEnergy
  victim.energy = Math.min(max, victim.energy + (Math.abs(push.x) + Math.abs(push.y)) * HEAL_PER_PUSH)
}

/**
 * modSpellMultistage.summonPayload -> armyMaster.createUnit: the stage's unit on the spell's
 * position with its own data (a solid tile cancels it), and the reserved slot is given back.
 */
function summonPayload(t: Tick, spell: ActorState, atk: AttackDef): void {
  const payload = payloadFor(spell.charge, atk)
  spell.summonReserved = 0
  if (payload === null || !t.s.defs[payload]) return
  if (t.s.grid.solidAt(tileOfPx(spell.pos.x), tileOfPx(spell.pos.y))) return
  spawn(t, payload, spell.pos, {})
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
  // impactAttack's teams by the attack's allegiance: hated ones, or friends and the own team (heal)
  const teams = atk.targetAllegiance === 'friendly' ? friendlyTeams(spell.team, t.s.teams) : hatedTeams(spell.team, t.s.teams)
  const victims = splashVictims(t, teams, atk.hits)
  // objSpell.goMode(#explode) (objSpell.txt:146-155): the volume comes from the charge before chargeExplodeFactor
  const explodeVolume = chargeVolume(spell.charge, atk.chargeVolumeMap)
  const ex = explode(spell.pos, spell.charge, atk, victims)
  // remake: the caster's knockbackSpreadDeg turns each push by a small random angle
  const caster = t.actors.find((c) => c.id === spell.ownerId)
  const spread = caster ? defOf(t.s, caster).knockbackSpreadDeg : 0
  for (const { id, push } of ex.pushes) {
    const victim = hitTargetIn(t, id)
    if (!victim) continue
    // CallPayloadFunction: takeHeal heals by the collision vector, takeHit pushes and damages
    if (atk.payloadFunction.includes(TAKE_HEAL)) takeHeal(t, victim, push)
    if (!atk.payloadFunction.includes(TAKE_HIT)) continue
    const [turned, rng] = spreadVec(t.rng, push, spread)
    t.rng = rng
    applyHit(t, victim, turned, atk.damageMultiplier)
  }
  t.events.push({ kind: 'explode', pos: spell.pos, radius: ex.radius })
  playSound(t, atk.explodeSound, explodeVolume)
  if (atk.explodeFunction === SUMMON_UNIT) summonPayload(t, spell, atk)
  spell.charge *= atk.chargeExplodeFactor
  spell.mode = 'explode'
  spell.vel = { x: 0, y: 0 }
  spell.prevPos = spell.pos
  spell.age = 0
}
