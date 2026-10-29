// Merlin's attack input (objAiPlayer.playerAttackCharge / playerAttackRelease, combat notes §5,
// spells notes §3): a spell charges while its key is held and is released when it is let go; a
// melee weapon (the punch, the energy punch, the sword) swings while it is held, striking on its
// attack frame every hated unit under the strike point (teamMaster.impactMeleeAttack). With the
// golden machine gun on, every spell is started in its gun version (spells notes §6).
import type { ActorDef, AttackDef } from '../mr-open/mr-actor-data'
import { cooldownReady, meleeHits, meleePush, resetCooldown } from '../mr-open/mr-attack'
import type { Vec } from '../mr-open/mr-geometry'
import { lowestAvailableStage, takeUnit } from '../mr-open/mr-army'
import { gmgAutoFires, gmgSummonDue, gunAttack, isSpellStream, onGunRhythm, setGmg, type GmgState } from '../mr-open/mr-golden-machine-gun'
import { chargeLimits, chargeStep, payloadFor, sendsAlliesHome } from '../mr-open/mr-spell'
import { hatedTeams } from '../mr-open/mr-targeting'
import { defOf, hurtSpriteRectFor, isAlive, isUnit, playerStatsOf } from './actors'
import { onFreshFrame } from './anim'
import { aimPoint, chargeKindFor, isHeld, spellAimPoint } from './player-aim'
import { ATTACK_STRIPS, type ActorState, type AttackStrip, type ChargeKind, type InputSnapshot } from './state'
import { hitTargetIn, playSound, playerIn, waitingSleepers, type Tick } from './tick-context'
import { applyPayload, withOwnerDamage } from './tick-combat'
import { nearestAllyOnScreen } from './tick-army'
import { alignSpell, chargingSpellOf, releaseMagic, startSpell, stepMultistage, streamSpell, streamVolley } from './tick-spell'
import { isVolleyStream } from './volley'
import { stepWeaponChoice } from './tick-weapons'
import type { Size } from './view'

/**
 * The weapon and gun keys first (objAiPlayer.interpretGameKeys runs before interpretMouse), then the
 * attack input. The AI's current spell (pCurrentSpell) is the player's spell still in `charge` mode; it
 * belongs to the AI, not to the character mode, so a hit forcing #walk
 * (objPlayerMerlinCharacter.takeHit) keeps it: while its key stays held, attack() -> chargeMagic
 * re-enters #charge and keeps counting, and letting go releases it from any mode. Without a current
 * spell, a held Space or click starts a charge (or a swing) whenever the cooldown is ready, even
 * during the release strip (releaseSpell has already cleared pCurrentSpell). A spell charged with
 * the gun the other way (switched by its key or a pickup) is released (#gmgTurnedOn /
 * #gmgTurnedOff); a held attack charges anew once the cooldown allows.
 */
export function stepPlayerAttack(t: Tick, input: InputSnapshot, view: Size): void {
  const p = playerIn(t)
  if (!isAlive(p)) return
  stepWeaponChoice(t, p, input)
  if (input.toggleGun) t.gmg = setGmg(t.gmg)
  const def = withGun(playerStatsOf(t.s, p, t.arsenal), t.gmg) // the potions drunk raise the mana stats
  const spell = chargingSpellOf(t, p)
  if (spell && (spell.attack ?? def.attack).gmgOn !== t.gmg.on) {
    releaseSpell(t, p, def, spell, input, view)
  } else if (spell) {
    const held = heldChargeKind(input, p.ai.chargeKind)
    if (held !== null) {
      p.ai.chargeKind = held
      if (continueCharge(t, p, def, spell)) autoFire(t, p, def, spell, input, view)
    } else releaseSpell(t, p, def, spell, input, view)
  } else if (def.attack.type === 'magic') {
    const started = startCharge(t, p, def, input)
    if (started) autoFire(t, p, def, started, input, view)
  } else if (def.attack.type === 'melee') {
    startSwing(t, p, def, input, view)
  }
}

/** objAiAttack.ensureSpell with the gmg on: a spell starts in its gun version; melee weapons are untouched. */
const withGun = (def: ActorDef, gmg: GmgState): ActorDef => (gmg.on && def.attack.type === 'magic' ? { ...def, attack: gunAttack(def.attack) } : def)

/** A charge step (objAiAttack.chargeSpell); false while the cooldown holds it (objAiAttack.attack). */
function continueCharge(t: Tick, p: ActorState, def: ActorDef, spell: ActorState): boolean {
  if (!cooldownReady(p.cooldown)) return false // objAiAttack.attack
  const limits = chargeLimits({ ...def, attack: spell.attack ?? def.attack }) // magic limit fixed at 100 %
  p.mode = 'charge' // ensureMode(#charge)
  spell.charge = chargeStep(spell.charge, limits.speed, limits.max)
  // the player's AI only resets its charge counter on #chargeLimited (objAiAttack.eventNotification)
  stepMultistage(t, spell)
  alignSpell(spell, p, def)
  return true
}

/**
 * objAiPlayer.internalEvent(#spellCharged) with the golden machine gun: a spell whose charge counter
 * has finished is released at once (playerAttackRelease); the next charge (playerAttackCharge) waits
 * for the cooldown that release restarts, so it starts on a later tick. Remake: a volley streams
 * instead, a projectile whenever its charge holds one (streamVolley), and so do the mines, a mine's
 * spell whenever the charge holds one (streamSpell); the army summon goes once it reaches the
 * lowest stage with a unit in the reserve (gmgSummonDue).
 */
function autoFire(t: Tick, p: ActorState, def: ActorDef, spell: ActorState, input: InputSnapshot, view: Size): void {
  const atk = spell.attack ?? def.attack
  const aim = () => spellAimPoint(t, p, input, p.ai.chargeKind, view, atk)
  if (isVolleyStream(atk)) streamVolley(t, p, spell, aim())
  else if (isSpellStream(atk)) streamSpell(t, p, spell, aim())
  else if (gmgAutoFires(atk, spell.charge, chargeLimits({ ...def, attack: atk })) || summonDue(t, spell, atk)) releaseSpell(t, p, def, spell, input, view)
}

/**
 * Remake (gmgSummonsLowest): the gun's army summon has reached the lowest stage with a unit in the
 * reserve, not counting the units the caster's summons still in flight will take from it.
 */
function summonDue(t: Tick, spell: ActorState, atk: AttackDef): boolean {
  if (!atk.gmgSummonsLowest) return false
  let army = t.army
  for (const a of t.actors) {
    if (t.removed.has(a.id) || a.mode !== 'fly' || a.ownerId !== spell.ownerId || a.attack?.name !== atk.name) continue
    const payload = payloadFor(a.charge, a.attack)
    if (payload !== null) army = takeUnit(army, a.team, payload) ?? army
  }
  return gmgSummonDue(atk, spell.charge, lowestAvailableStage(army, spell.team, atk))
}

/**
 * The attack input that keeps a charge going: its own, else (remake) any other held one, so F
 * switching what Space aims at mid-charge goes on charging, aimed the new way (owner request).
 */
const heldChargeKind = (input: InputSnapshot, kind: ChargeKind | null): ChargeKind | null => (isHeld(input, kind) ? kind : chargeKindFor(input))

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

/** objAiAttack.chargeMagic without a current spell: ensureSpell; the new spell, or undefined when none starts. */
function startCharge(t: Tick, p: ActorState, def: ActorDef, input: InputSnapshot): ActorState | undefined {
  if (p.mode === 'charge') {
    // the spell went away under the charge
    p.mode = 'walk'
    p.ai.chargeKind = null
  }
  const kind = chargeKindFor(input)
  if (kind === null || !cooldownReady(p.cooldown)) return undefined
  // remake (gmgFireRateScale): gun spells start on its rhythm (the pulse: 7 ticks in 10)
  if (def.attack.gmgOn && !onGunRhythm(t.s.tick, def.attack.gmgFireRateScale)) return undefined
  p.ai.mode = 'none' // ensureMode(#charge) ends a swing switched away from
  const spell = startSpell(t, p, def)
  stepMultistage(t, spell)
  p.ai.chargeKind = kind
  return spell
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
    if (!meleeHits(p.pos, def, p.facingLeft, hurtSpriteRectFor(t.s, v))) continue
    const victim = hitTargetIn(t, v.id)
    if (victim) applyPayload(t, victim, push, withOwnerDamage(t, p, def.attack))
  }
}
