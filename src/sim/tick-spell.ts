// The player's spell (combat notes §4, §6): charge / resume / release input (objAiPlayer with
// objAiAttack.chargeMagic / releaseMagic), spell flight and explosion (objSpell). The victim side
// of an explosion push is applyHit in tick-combat.ts.
import type { ActorDef } from '../mr-open/mr-actor-data'
import { cooldownReady, resetCooldown } from '../mr-open/mr-attack'
import type { Vec } from '../mr-open/mr-geometry'
import { chargeVolume } from '../mr-open/mr-sound'
import { arrivedAtTarget, chargeLimits, chargeLoc, chargeStep, explode, releaseVelocity, type SplashVictim } from '../mr-open/mr-spell'
import { hatedTeams } from '../mr-open/mr-targeting'
import { defOf, isAlive, isCharacter, isSpell, spriteRectFor } from './actors'
import { spreadVec } from './rng'
import type { ActorState, ChargeKind, InputSnapshot } from './state'
import { actorIn, playerIn, playSound, spawn, type Tick } from './tick-context'
import { applyHit } from './tick-combat'
import { nearestHostileId } from './tick-ai'

/** Ticks an exploded spell stays for the render fade (objSpell startQuickFade). */
export const EXPLODE_TICKS = 8
/** Release distance straight ahead when neither the mouse nor a hostile gives a target. */
const AHEAD_PX = 100
/** The push-back shot (Space with the F toggle on) lands this many px short of the nearest hostile, toward the player. */
const SHORT_PX = 20

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
  const nearestId = nearestHostileId(t, p)
  const nearest = nearestId === null ? undefined : actorIn(t, nearestId)
  if (!nearest) return mouse
  if (kind === 'nearest') return { ...nearest.pos }
  const dx = nearest.pos.x - p.pos.x
  const dy = nearest.pos.y - p.pos.y
  const d = Math.hypot(dx, dy)
  if (d <= SHORT_PX) return { ...p.pos }
  return { x: nearest.pos.x - (dx / d) * SHORT_PX, y: nearest.pos.y - (dy / d) * SHORT_PX }
}

/** objSpell.align with chargeOffsetSide #top: the ball sits on the charge loc, its bottom edge there (grows upward). */
function alignSpell(spell: ActorState, caster: ActorState, def: ActorDef): void {
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
  const spell = t.actors.find((a) => !t.removed.has(a.id) && isSpell(t.s, a) && a.ownerId === p.id && a.mode === 'charge')
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
  const target = releaseTarget(t, p, input, p.ai.chargeKind)
  const atk = spell.attack ?? def.attack
  spell.mode = 'fly'
  spell.targetPoint = target
  spell.vel = releaseVelocity(spell.pos, target, atk.spellSpeed)
  // objSpell.releaseNormal -> playReleaseSound (objSpell.txt:219-226, :247)
  playSound(t, atk.releaseSound, chargeVolume(spell.charge, atk.chargeVolumeMap))
  p.mode = 'release'
  p.ai.chargeKind = null
  p.cooldown = resetCooldown(def.attack)
}

function startCharge(t: Tick, p: ActorState, def: ActorDef, input: InputSnapshot): void {
  if (p.mode === 'charge') {
    // the spell went away under the charge
    p.mode = 'walk'
    p.ai.chargeKind = null
  }
  const kind = chargeKindFor(input)
  if (kind === null || !cooldownReady(p.cooldown)) return
  if (!t.s.defs['spell']) throw new Error('actor definitions have no "spell" entry')
  // ensureSpell + setSpellProperties (the caster's attack and team), then chargeSpell at the start value
  const created = spawn(t, 'spell', chargeLoc(p.pos, def, p.facingLeft), {
    mode: 'charge',
    ownerId: p.id,
    charge: chargeLimits(def).start,
    team: p.team,
    attack: def.attack,
  })
  alignSpell(created, p, def)
  p.mode = 'charge'
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

/** Living characters in a team the spell's team hates, with their sprite radius (objGameObject.getRadius). */
function splashVictims(t: Tick, spell: ActorState): SplashVictim[] {
  const hated = hatedTeams(spell.team, t.s.teams)
  return t.actors
    .filter((v) => !t.removed.has(v.id) && isCharacter(t.s, v) && isAlive(v) && hated.includes(v.team))
    .map((v) => {
      const r = spriteRectFor(t.s, v)
      return { id: v.id, pos: v.pos, radius: (r.right - r.left) / 2 }
    })
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
  const victims = splashVictims(t, spell)
  // objSpell.goMode(#explode) (objSpell.txt:146-155): the volume comes from the charge before chargeExplodeFactor
  const explodeVolume = chargeVolume(spell.charge, atk.chargeVolumeMap)
  const ex = explode(spell.pos, spell.charge, atk, victims)
  // remake: the caster's knockbackSpreadDeg turns each push by a small random angle
  const caster = t.actors.find((c) => c.id === spell.ownerId)
  const spread = caster ? defOf(t.s, caster).knockbackSpreadDeg : 0
  for (const { id, push } of ex.pushes) {
    const victim = actorIn(t, id)
    if (!victim) continue
    const [turned, rng] = spreadVec(t.rng, push, spread)
    t.rng = rng
    applyHit(t, victim, turned, atk.damageMultiplier)
  }
  t.events.push({ kind: 'explode', pos: spell.pos, radius: ex.radius })
  playSound(t, atk.explodeSound, explodeVolume)
  spell.charge *= atk.chargeExplodeFactor
  spell.mode = 'explode'
  spell.vel = { x: 0, y: 0 }
  spell.prevPos = spell.pos
  spell.age = 0
}
