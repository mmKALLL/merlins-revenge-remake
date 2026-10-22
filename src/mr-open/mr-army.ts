// Port of armyMaster's reserve army (pReserveArmy, recordUnitDetails, lookupArmyDetails,
// restoreUnitToCombat) and modTeleport's timing (docs/notes/engine-mechanics-spells.md §5). The
// reserve keeps units by team and type; experience is not ported, so a count per type is all a unit
// leaves behind (a returning unit comes back with full energy, as restoreArmyDetails keeps no energy).
import type { AttackDef } from './mr-actor-data'

/** team -> actor type -> units waiting in the reserve. */
export type ArmyReserve = Record<string, Record<string, number>>

export const NO_ARMY: ArmyReserve = {}

/** modTeleport pTeleportFrames: a teleport in or out plays over this many ticks. */
export const TELEPORT_TICKS = 15

/** The spell whose summons come from the reserve (modSpellMultistage, armyMaster.createUnit check `#armySummon`). */
export const ARMY_SUMMON = 'armySummon'

export const reserveCount = (army: ArmyReserve, team: string, typ: string): number => army[team]?.[typ] ?? 0

/** armyMaster.recordUnitDetails: `n` more units of `typ` in `team`'s reserve. */
export function recordUnits(army: ArmyReserve, team: string, typ: string, n = 1): ArmyReserve {
  return { ...army, [team]: { ...army[team], [typ]: reserveCount(army, team, typ) + n } }
}

/** armyMaster.restoreUnitToCombat: one unit of `typ` out of the reserve; null when there is none. */
export function takeUnit(army: ArmyReserve, team: string, typ: string): ArmyReserve | null {
  const n = reserveCount(army, team, typ)
  return n > 0 ? { ...army, [team]: { ...army[team], [typ]: n - 1 } } : null
}

/** Remake (owner request): a scroll's starting army put into `team`'s reserve. */
export function withUnits(army: ArmyReserve, team: string, units: Record<string, number>): ArmyReserve {
  let out = army
  for (const [typ, n] of Object.entries(units)) out = recordUnits(out, team, typ, n)
  return out
}

/**
 * modSpellMultistage.updateAvailableUnits: the 1-based number of the highest stage whose unit type
 * has a unit in `team`'s reserve, 0 when none has.
 */
export function topAvailableStage(army: ArmyReserve, team: string, a: AttackDef): number {
  for (let i = a.multistage.length; i >= 1; i--) if (reserveCount(army, team, a.multistage[i - 1]!.payload) > 0) return i
  return 0
}
