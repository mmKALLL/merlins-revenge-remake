// Roguelite (docs/plans/2026-10-25-roguelite-mode-design.md, Rewards): what Merlin holds, so the pick
// screen offers no spell or wizard he has and the run summary lists the spells and wizards collected.
// The rewards themselves are pickups (or the wizard) in the next floor's start room.
import { reserveCount } from '../mr-open/mr-army'
import { GOLDEN_MACHINE_GUN, SCROLL_OBJ_TYPE } from '../mr-open/mr-pickup'
import { weaponOf } from '../mr-open/mr-weapons'
import { isAlive, playerOf, wizardTypes } from './actors'
import type { SimState } from './state'

/** Whether Merlin holds the weapon a scroll gives (its #character, as collectScroll adds it), or has found the golden machine gun. */
export function holdsScroll(s: SimState, scroll: string): boolean {
  if (scroll === GOLDEN_MACHINE_GUN) return s.gmg.collected
  const def = s.defs[scroll]
  return weaponOf(s.arsenal, def?.character ?? scroll) !== undefined
}

/**
 * The scrolls (actor keys) whose weapons Merlin holds, in the order he took them: in a roguelite run
 * every weapon but his punch (withRunStartArsenal), the energy blast too; then the golden machine
 * gun, once found (a mode, not a weapon).
 */
export function collectedScrolls(s: SimState): string[] {
  const scrollOf = new Map<string, string>()
  for (const def of Object.values(s.defs)) {
    const weapon = def.character ?? def.key
    if (def.objType === SCROLL_OBJ_TYPE && !scrollOf.has(weapon)) scrollOf.set(weapon, def.key)
  }
  const weapons = s.arsenal.weapons.flatMap((w) => {
    const scroll = scrollOf.get(w.key)
    return scroll !== undefined ? [scroll] : []
  })
  return s.gmg.collected ? [...weapons, GOLDEN_MACHINE_GUN] : weapons
}

/** Whether Merlin has the friendly wizard `key`: in his reserve, or alive in play on his team. */
export function hasWizard(s: SimState, key: string): boolean {
  const team = playerOf(s).team
  return reserveCount(s.army, team, key) > 0 || s.actors.some((a) => a.def === key && a.team === team && isAlive(a))
}

/** The friendly wizards (actor keys) Merlin has (hasWizard), in wizardTypes order. */
export const wizardsFound = (s: SimState): string[] => wizardTypes(s.defs).filter((key) => hasWizard(s, key))

/** The friendly wizards Merlin does not have yet, those a floor-end reward may bring. */
export const wizardsToFind = (s: SimState): string[] => wizardTypes(s.defs).filter((key) => !hasWizard(s, key))
