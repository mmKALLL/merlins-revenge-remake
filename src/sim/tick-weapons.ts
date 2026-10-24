// Merlin's weapons in the tick (docs/notes/engine-mechanics-spells.md §2-3): a scroll's weapon
// added (objPlayerMerlinCharacter.newScrollCollected -> addWeapon), the weapon keys and the
// weaponSelector palette (selectSpell, commandIssued -> setCurrentWeapon), and every weapon's
// cooldown counter running (modWeaponManager.updateCooldowns).
import type { ActorDef, AttackDef } from '../mr-open/mr-actor-data'
import { cooldownIncrement, tickCooldown } from '../mr-open/mr-attack'
import { withUnits } from '../mr-open/mr-army'
import { BONUS_ENERGY, GOLDEN_MACHINE_GUN } from '../mr-open/mr-pickup'
import { addWeapon, nextWeapon, nthSpell, weaponGroupOf, weaponOf } from '../mr-open/mr-weapons'
import { defOf, playerStatsOf } from './actors'
import type { ActorState, InputSnapshot } from './state'
import { chargingSpellOf } from './tick-spell'
import type { Tick } from './tick-context'
import { startTempInvince } from './tick-pickup'

/** The weapon the player picked this tick: a spell key, a palette click, or (touch) the next weapon. */
function chosenWeapon(t: Tick, p: ActorState, input: InputSnapshot): string | null {
  if (input.selectWeapon !== null) return input.selectWeapon
  if (input.selectSpell !== null) return nthSpell(t.arsenal, input.selectSpell)
  return input.cycleWeapon ? nextWeapon(t.arsenal, defOf(t.s, p).naturalAttack.name) : null
}

/** objAiPlayer.interpretGameKeys -> selectSpell / displayWeaponSelector's commandIssued: setCurrentWeapon. */
export function stepWeaponChoice(t: Tick, p: ActorState, input: InputSnapshot): void {
  const key = chosenWeapon(t, p, input)
  const slot = key === null ? undefined : weaponOf(t.arsenal, key)
  if (!slot || slot.key === t.arsenal.current) return
  equip(t, p, slot.key, slot.attack)
  t.arsenal = { ...t.arsenal, current: slot.key }
}

/**
 * setCurrentWeapon: a weapon that is not a spell cancels the attack in progress (objAiAttack.cancelAttack:
 * the charging spell goes); the current cooldown counter is filed and the new weapon's taken up.
 * `fresh`: addWeapon's new counter, which starts ready.
 */
function equip(t: Tick, p: ActorState, key: string, attack: AttackDef, fresh = false): void {
  if (weaponGroupOf(attack) !== 'magic') cancelAttack(t, p)
  const idleCooldowns = { ...t.arsenal.idleCooldowns, [t.arsenal.current]: p.cooldown }
  p.cooldown = fresh ? 0 : (idleCooldowns[key] ?? 0)
  delete idleCooldowns[key]
  t.arsenal = { ...t.arsenal, idleCooldowns }
}

/** objAiAttack.cancelAttack for Merlin: the charging spell is finished and he walks. */
function cancelAttack(t: Tick, p: ActorState): void {
  const spell = chargingSpellOf(t, p)
  if (spell) t.removed.add(spell.id)
  if (p.mode === 'charge') p.mode = 'walk'
  p.ai.chargeKind = null
}

/**
 * The weapon a scroll gives: its #attack. The starting weapon's own scroll (energyBlast) gives the
 * attack Merlin already has, so its tuning (player.attack in assets/tuning.json) is kept.
 */
function scrollAttack(t: Tick, scroll: ActorDef): AttackDef {
  const player = t.s.defs['player']!
  return scroll.key === player.weapon ? player.attack : scroll.attack
}

/**
 * objScroll.collected -> objPlayerMerlinCharacter.newScrollCollected: addWeapon (selected at once)
 * and +25 energy, or for the golden machine gun gmgCollected (not ported); temporary invincibility
 * either way. Remake (owner request): the scroll's startingArmy goes into the reserve army.
 */
export function collectScroll(t: Tick, p: ActorState, scroll: ActorDef): void {
  startTempInvince(t)
  if (scroll.key === GOLDEN_MACHINE_GUN) return
  const attack = scrollAttack(t, scroll)
  const key = scroll.character ?? scroll.key
  equip(t, p, key, attack, true)
  t.arsenal = addWeapon(t.arsenal, key, attack)
  p.energy = Math.min(p.energy + BONUS_ENERGY, defOf(t.s, p).maxEnergy)
  t.army = withUnits(t.army, p.team, scroll.startingArmy)
}

/** modWeaponManager.updateCooldowns: the current weapon's counter and every idle one, each by its own stat. */
export function stepPlayerCooldowns(t: Tick, p: ActorState): void {
  const def = playerStatsOf(t.s, p, t.arsenal)
  p.cooldown = tickCooldown(p.cooldown, cooldownIncrement(def))
  const idle = Object.entries(t.arsenal.idleCooldowns)
  if (idle.length === 0) return
  const idleCooldowns: Record<string, number> = {}
  for (const [key, left] of idle) {
    const attack = weaponOf(t.arsenal, key)?.attack ?? def.attack
    idleCooldowns[key] = tickCooldown(left, cooldownIncrement({ ...def, attack }))
  }
  t.arsenal = { ...t.arsenal, idleCooldowns }
}
