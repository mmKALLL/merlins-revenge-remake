// Port of the pickups' rules (docs/notes/engine-mechanics-potions.md): what a potion adds to Merlin
// (objPlayerMerlinCharacter.potionCollected, modCharacterAttackProperties, modNavMode), the
// medikit and maxikit (medikitCollected, modMedikit), temporary invincibility (modInvince) and
// the collected writing's fade (objPowerUpWriting, modFader).

/** objPotion and objMedikit: the pickup object types an objects-layer tile may place. */
export const POTION_OBJ_TYPE = 'objPotion'
export const MEDIKIT_OBJ_TYPE = 'objMedikit'
/** objScroll: a spell scroll (docs/notes/engine-mechanics-spells.md §1). */
export const SCROLL_OBJ_TYPE = 'objScroll'
/** act_gmg: the golden machine gun, an objScroll that is not a weapon (gmgCollected; not ported). */
export const GOLDEN_MACHINE_GUN = 'gmg'
/**
 * The scrolls the objects tilesets place (merlinOpenObjects, merlin4Objects, merlinObjects): Merlin's.
 * Other objScroll files (darkBlast, goblinSummon, ...) only carry an enemy's weapon and have no art.
 */
export const MERLIN_SCROLLS: readonly string[] = [
  'armySummon', 'energyMines', 'energyPulseSpell', 'cBlast', 'energyPunch', 'monsterSummon', 'healBlast',
  'arcticBlast', 'energyBeamSpell', 'merlinSword', 'energyBlast', GOLDEN_MACHINE_GUN,
]

/** objPlayerMerlinCharacter pBonusEnergy: energy every potion and a medikit restore at once. */
export const BONUS_ENERGY = 25
/** modInvince pTempInvinceTime 200: CounterOnce over [1, 200] finishes 199 ticks after a reset. */
export const TEMP_INVINCE_TICKS = 199
/** modFader.startFade: blend 100 -> 0 by 2 per update, after objTransformer's first frame. */
export const WRITING_FADE_TICKS = 51

/** The stat a potion raises and by how much (modCharacterAttackProperties pManaBurstInc etc., modNavMode pPotionAccelerationInc). */
export type PotionStat = 'mana_burst' | 'mana_capacity' | 'mana_flow' | 'walkAcceleration'
const POTION_EFFECTS: Record<string, { stat: PotionStat; inc: number }> = {
  manaBurst: { stat: 'mana_burst', inc: 0.75 },
  manaCapacity: { stat: 'mana_capacity', inc: 0.75 },
  manaFlow: { stat: 'mana_flow', inc: 0.5 },
  walkSpeed: { stat: 'walkAcceleration', inc: 0.3 },
}

/** potionMaster's record of one potion character: how many Merlin has drunk (in order of the first). */
export interface PotionCount { character: string; count: number }

/** Merlin's stats with the potions drunk added on top of his definition's. */
export function withPotions<T extends Record<PotionStat, number>>(stats: T, drunk: readonly PotionCount[]): T {
  const out = { ...stats }
  for (const { character, count } of drunk) {
    const effect = POTION_EFFECTS[character]
    if (effect) out[effect.stat] += effect.inc * count
  }
  return out
}

/** potionMaster.potionCollected: one more of `character`, a new record at the end for the first. */
export function drinkPotion(drunk: readonly PotionCount[], character: string): PotionCount[] {
  const known = drunk.some((p) => p.character === character)
  return known ? drunk.map((p) => (p.character === character ? { character, count: p.count + 1 } : p)) : [...drunk, { character, count: 1 }]
}

/**
 * modMedikit: `stock` unused kits, `remaining` hitpoints in the current one, `active` while it
 * heals, `healCount` the pHealDelayCounter's count (CounterNew starts it at 1, unfinished).
 */
export interface MedikitState { stock: number; remaining: number; active: boolean; healCount: number; healFin: boolean }

export const NO_MEDIKITS: MedikitState = { stock: 0, remaining: 0, active: false, healCount: 1, healFin: false }

/** modMedikit pHealDelayCounter tim [1, 5] and pHealAmount 1. */
const HEAL_COUNTER_END = 5
const HEAL_AMOUNT = 1

/** modMedikit.getNumOfMedikits: the stock plus the current kit while it has hitpoints. */
export const medikitsHeld = (m: MedikitState): number => m.stock + (m.remaining > 0 ? 1 : 0)

/**
 * One modMedikit.update for an energy below or at `maxEnergy`: below it, attemptHeal steps the
 * counter (Counter over [1, 5]: finishes on the 4th step, resets on the next) and on a finish
 * takes 1 hitpoint from the current kit into energy, or swaps in the next kit (filled to
 * maxEnergy) when the current one is empty. At max the kit goes inactive.
 */
export function medikitStep(m: MedikitState, energy: number, maxEnergy: number): { medikits: MedikitState; energy: number } {
  if (energy >= maxEnergy) return { medikits: { ...m, active: false }, energy }
  const reset = m.healFin
  const healCount = reset ? 1 : Math.min(m.healCount + 1, HEAL_COUNTER_END)
  const healFin = !reset && healCount === HEAL_COUNTER_END
  const counted = { ...m, healCount, healFin }
  if (!healFin) return { medikits: counted, energy }
  if (m.remaining > 0) {
    return { medikits: { ...counted, remaining: m.remaining - HEAL_AMOUNT, active: true }, energy: Math.min(energy + HEAL_AMOUNT, maxEnergy) }
  }
  if (m.stock === 0) return { medikits: { ...counted, active: false }, energy }
  return { medikits: { ...counted, stock: m.stock - 1, remaining: maxEnergy, active: true }, energy }
}

/**
 * objPlayerMerlinCharacter.medikitCollected: a #medikit goes into stock and restores
 * BONUS_ENERGY; anything else (the #maxikit, the M cheat) restores full energy.
 */
export function collectMedikit(m: MedikitState, character: string | null, energy: number, maxEnergy: number): { medikits: MedikitState; energy: number } {
  if (character === 'medikit') return { medikits: { ...m, stock: m.stock + 1 }, energy: Math.min(energy + BONUS_ENERGY, maxEnergy) }
  return { medikits: m, energy: maxEnergy }
}
