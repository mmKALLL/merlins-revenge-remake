// Roguelite (docs/plans/2026-10-25-roguelite-mode-design.md, Rewards): what Merlin holds, so the pick
// screen offers no spell he has and the run summary lists the spells collected. The rewards
// themselves are pickups in the next floor's start room.
import { SCROLL_OBJ_TYPE } from '../mr-open/mr-pickup'
import { startingArsenal, weaponOf } from '../mr-open/mr-weapons'
import type { SimState } from './state'

/** Whether Merlin holds the weapon a scroll gives (its #character, as collectScroll adds it). */
export function holdsScroll(s: SimState, scroll: string): boolean {
  const def = s.defs[scroll]
  return weaponOf(s.arsenal, def?.character ?? scroll) !== undefined
}

/** The scrolls (actor keys) whose weapons Merlin holds beyond his starting ones, in the order he took them. */
export function collectedScrolls(s: SimState): string[] {
  const player = s.defs['player']
  const starting = new Set(player ? startingArsenal(player).weapons.map((w) => w.key) : [])
  const scrollOf = new Map<string, string>()
  for (const def of Object.values(s.defs)) {
    const weapon = def.character ?? def.key
    if (def.objType === SCROLL_OBJ_TYPE && !scrollOf.has(weapon)) scrollOf.set(weapon, def.key)
  }
  return s.arsenal.weapons.flatMap((w) => {
    const scroll = scrollOf.get(w.key)
    return scroll !== undefined && !starting.has(w.key) ? [scroll] : []
  })
}
