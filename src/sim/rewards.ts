// Roguelite (docs/plans/2026-10-25-roguelite-mode-design.md, Rewards): what Merlin holds, so the pick
// screen offers no spell he has. The rewards themselves are pickups in the next floor's start room.
import { weaponOf } from '../mr-open/mr-weapons'
import type { SimState } from './state'

/** Whether Merlin holds the weapon a scroll gives (its #character, as collectScroll adds it). */
export function holdsScroll(s: SimState, scroll: string): boolean {
  const def = s.defs[scroll]
  return weaponOf(s.arsenal, def?.character ?? scroll) !== undefined
}
