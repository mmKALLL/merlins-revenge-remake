// What the reserve army display shows (remake; docs/notes/engine-mechanics-hud.md §6): where it sits
// and which unit types of the reserve it lists, in order. Pure, so the order can be tested.

/** Settings, Army display: the right margin (the original's prg_armyMaster mark), the top strip, or none. */
export const ARMY_DISPLAYS = ['right', 'top', 'off'] as const
export type ArmyDisplayMode = (typeof ARMY_DISPLAYS)[number]
export const DEFAULT_ARMY_DISPLAY: ArmyDisplayMode = 'right'

export interface ArmyEntry { typ: string; count: number }

/**
 * The reserve's unit types with at least one unit: the friendly `wizards` first (the original showed
 * the wizard apart, on prg_wizardmaster), then those in `order` (Merlin's armyMembers), in that
 * order, then any others by name, so the display does not reshuffle as counts change.
 */
export function armyDisplayEntries(
  reserve: Readonly<Record<string, number>> | undefined,
  order: readonly string[],
  wizards: readonly string[],
): ArmyEntry[] {
  if (!reserve) return []
  const known = new Set([...wizards, ...order])
  const others = Object.keys(reserve).filter((typ) => !known.has(typ)).sort()
  return [...wizards, ...order, ...others]
    .map((typ) => ({ typ, count: reserve[typ] ?? 0 }))
    .filter((e) => e.count > 0)
}
