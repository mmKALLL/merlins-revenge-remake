// Merlin's attack input (objAiPlayer.playerAttackCharge / playerAttackRelease, combat notes §5,
// spells notes §3): a spell charges while its key is held and is released when it is let go; a
// melee weapon (the punch, the energy punch, the sword) swings while it is held, striking on its
// attack frame every hated unit under the strike point (teamMaster.impactMeleeAttack).
import type { ActorDef } from '../mr-open/mr-actor-data'
import { cooldownReady, meleeHits, meleePush, resetCooldown } from '../mr-open/mr-attack'
import type { Vec } from '../mr-open/mr-geometry'
import { chargeLimits, chargeStep, sendsAlliesHome } from '../mr-open/mr-spell'
import { hatedTeams } from '../mr-open/mr-targeting'
import { defOf, isAlive, isUnit, playerStatsOf, spriteRectFor } from './actors'
import { onFreshFrame } from './anim'
import { aimPoint, chargeKindFor, isHeld, spellAimPoint } from './player-aim'
import { ATTACK_STRIPS, type ActorState, type AttackStrip, type InputSnapshot } from './state'
import { hitTargetIn, playSound, playerIn, waitingSleepers, type Tick } from './tick-context'
import { applyPayload, withOwnerDamage } from './tick-combat'
import { nearestAllyOnScreen } from './tick-army'
import { alignSpell, chargingSpellOf, releaseMagic, startSpell, stepMultistage } from './tick-spell'
import { stepWeaponChoice } from './tick-weapons'
import type { Size } from './view'

/**
 * The weapon keys first (objAiPlayer.interpretGameKeys runs before interpretMouse), then the attack
 * input. The AI's current spell (pCurrentSpell) is the player's spell still in `charge` mode; it
 * belongs to the AI, not to the character mode, so a hit forcing #walk
 * (objPlayerMerlinCharacter.takeHit) keeps it: while its key stays held, attack() -> chargeMagic
 * re-enters #charge and keeps counting, and letting go releases it from any mode. Without a current
 * spell, a held Space/click or E starts a charge (or a swing) whenever the cooldown is ready, even
 * during the release strip (releaseSpell has already cleared pCurrentSpell).
 */
export function stepPlayerAttack(t: Tick, input: InputSnapshot, view: Size): void {
  const p = playerIn(t)
  if (!isAlive(p)) return
  stepWeaponChoice(t, p, input)
  const def = playerStatsOf(t.s, p, t.arsenal) // the potions drunk raise the mana stats
  const spell = chargingSpellOf(t, p)
  if (spell) {
    if (isHeld(input, p.ai.chargeKind)) continueCharge(t, p, def, spell)
    else releaseSpell(t, p, def, spell, input, view)
  } else if (def.attack.type === 'magic') {
    startCharge(t, p, def, input)
  } else if (def.attack.type === 'melee') {
    startSwing(t, p, def, input, view)
  }
}

function continueCharge(t: Tick, p: ActorState, def: ActorDef, spell: ActorState): void {
  if (!cooldownReady(p.cooldown)) return // objAiAttack.attack
  const limits = chargeLimits({ ...def, attack: spell.attack ?? def.attack }) // magic limit fixed at 100 %
  p.mode = 'charge' // ensureMode(#charge)
  spell.charge = chargeStep(spell.charge, limits.speed, limits.max)
  // the player's AI only resets its charge counter on #chargeLimited (objAiAttack.eventNotification)
  stepMultistage(t, spell)
  alignSpell(spell, p, def)
}

function releaseSpell(t: Tick, p: ActorState, def: ActorDef, spell: ActorState, input: InputSnapshot, view: Size): void {
  releaseMagic(t, p, def, spell, releaseAim(t, p, def, spell, input, view))
  p.ai.chargeKind = null
}

/**
 * Where the released spell flies (spellAimPoint). Remake: an army summon charged short of its first
 * stage, a blank that sends the allies it hits home, flies at Merlin's nearest ally in sight
 * instead, so a weak tap sends one ally back into the reserve.
 */
function releaseAim(t: Tick, p: ActorState, def: ActorDef, spell: ActorState, input: InputSnapshot, view: Size): Vec {
  const atk = spell.attack ?? def.attack
  const ally = sendsAlliesHome(spell.charge, atk) ? nearestAllyOnScreen(t, p, view) : undefined
  return ally ? { ...ally.pos } : spellAimPoint(t, p, input, p.ai.chargeKind, view, atk)
}

function startCharge(t: Tick, p: ActorState, def: ActorDef, input: InputSnapshot): void {
  if (p.mode === 'charge') {
    // the spell went away under the charge
    p.mode = 'walk'
    p.ai.chargeKind = null
  }
  const kind = chargeKindFor(input)
  if (kind === null || !cooldownReady(p.cooldown)) return
  p.ai.mode = 'none' // ensureMode(#charge) ends a swing switched away from
  const spell = startSpell(t, p, def)
  stepMultistage(t, spell)
  p.ai.chargeKind = kind
}

/** The strip a melee attack plays (its animType); weaponMelee for an unknown one. */
const swingStrip = (def: ActorDef): AttackStrip => (ATTACK_STRIPS.has(def.attack.animType) ? (def.attack.animType as AttackStrip) : 'weaponMelee')

/**
 * objAiAttack.attack for a melee weapon: with the cooldown ready, Merlin faces where he aims
 * (faceTarget: objAiPlayer.getTargetLoc) and plays the attack strip; the AI is in #attack until it
 * loops (stepPlayerSwing). Held, the next swing starts as soon as the cooldown allows.
 */
function startSwing(t: Tick, p: ActorState, def: ActorDef, input: InputSnapshot, view: Size): void {
  if (p.ai.mode === 'attack') return
  const kind = chargeKindFor(input)
  if (kind === null || !cooldownReady(p.cooldown)) return
  const aim: Vec = aimPoint(t, p, input, kind, view)
  p.facingLeft = aim.x < p.pos.x // calcDirXToTarget: ties face right
  p.mode = swingStrip(def)
  p.ai.mode = 'attack'
}

/**
 * objAiAttack.updateAttack for Merlin, after the animation step: the strike on the attack frame
 * (performMeleeAttack, the attack sound, a fresh cooldown), and attackFin(#completed) -> #walk when
 * the strip loops. A hit forcing #walk (objPlayerMerlinCharacter.takeHit) ends the swing.
 */
export function stepPlayerSwing(t: Tick): void {
  const p = playerIn(t)
  if (p.ai.mode !== 'attack') return
  if (!ATTACK_STRIPS.has(p.mode) || !isAlive(p)) {
    p.ai.mode = 'none'
    return
  }
  const def = playerStatsOf(t.s, p, t.arsenal)
  if (def.attack.type === 'melee' && onFreshFrame(p, def.attack.animFrame)) {
    impactMelee(t, p, def)
    playSound(t, def.attack.sound, def.attack.volume)
    p.cooldown = resetCooldown(def.attack)
  }
  if (p.animLooped) {
    p.mode = 'walk'
    p.ai.mode = 'none'
  }
}

/**
 * teamMaster.impactMeleeAttack: every living unit of a hated team whose role the attack hits and
 * whose sprite rect holds the strike point takes the push (calcCollisionVectMelee) through the
 * attack's payload functions.
 */
function impactMelee(t: Tick, p: ActorState, def: ActorDef): void {
  const hated = hatedTeams(p.team, t.s.teams)
  const push = meleePush(def, p.facingLeft)
  const candidates = [...t.actors, ...waitingSleepers(t)].filter(
    (v) => !t.removed.has(v.id) && isUnit(t.s, v) && isAlive(v) && hated.includes(v.team) && def.attack.hits.includes(defOf(t.s, v).teamRole),
  )
  for (const v of candidates) {
    if (!meleeHits(p.pos, def, p.facingLeft, spriteRectFor(t.s, v))) continue
    const victim = hitTargetIn(t, v.id)
    if (victim) applyPayload(t, victim, push, withOwnerDamage(t, p, def.attack))
  }
}
