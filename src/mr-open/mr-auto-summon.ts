// Port of modAutoSummon.summonArmy (script_objects/modAutoSummon.txt, the #army key in
// objAiPlayer.interpretGameKeys): how many of each reserve unit type one press summons. The tick
// (src/sim/tick-army.ts) places them; see docs/notes/engine-mechanics-spells.md §5.

/** summonArmy: `summonLoc.locv = startLoc.locv + random(30) - 15` (twice; loch is never moved). */
export const AUTO_SUMMON_JITTER = 30

/**
 * When the team has fewer free slots than army types, summonArmy shares them out over all but the
 * last two types ("drop the higher units (kings and dwarves)").
 */
const DROPPED_HIGHER_TYPES = 2

/**
 * The unit types summonArmy creates, in creation order: `slotsPerUnit` = the free slots over the
 * number of army types (over two fewer when the slots do not cover every type; integer division,
 * at least 1), then for each type in `armyMembers` order as many as the slots per unit, the units
 * of that type in the reserve and the slots left allow. `availableSlots` is
 * reservationsMaster.getAvailableSlots (Infinity for a team without a cap).
 */
export function autoSummonTypes(availableSlots: number, armyMembers: readonly string[], inReserve: (typ: string) => number): string[] {
  if (availableSlots <= 0 || armyMembers.length === 0) return []
  const shareOver = availableSlots >= armyMembers.length ? armyMembers.length : Math.max(1, armyMembers.length - DROPPED_HIGHER_TYPES)
  const slotsPerUnit = Math.max(1, Math.floor(availableSlots / shareOver))
  const out: string[] = []
  let slotsLeft = availableSlots
  for (const typ of armyMembers) {
    const n = Math.min(slotsPerUnit, inReserve(typ), slotsLeft)
    for (let i = 0; i < n; i++) out.push(typ)
    slotsLeft -= n
    if (slotsLeft <= 0) break
  }
  return out
}
