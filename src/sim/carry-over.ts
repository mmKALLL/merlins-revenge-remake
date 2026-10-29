// Roguelite (docs/plans/2026-10-25-roguelite-mode-design.md, Architecture): what Merlin keeps from one
// floor to the next. His record: energy, potion upgrades (derived from the potions drunk), medikits,
// weapons and the current one, the golden machine gun (found, on or off), the reserve army, the
// run's score and its time. Everything else belongs to the floor's map and starts fresh: graves,
// sleepers, room states, the mini-map, the map's tick (its timers read it) and his temporary
// invincibility.
import { naturalArsenal } from '../mr-open/mr-weapons'
import { playerOf } from './actors'
import { VOID_SCORE } from './score'
import type { SimState } from './state'

/** `next`, a fresh sim of the next floor's map, with Merlin's record from the finished floor `prev`. */
export function carryOver(prev: SimState, next: SimState): SimState {
  const energy = playerOf(prev).energy
  return {
    ...next,
    runTicks: prev.runTicks,
    pickups: { ...prev.pickups, invinceTicks: 0 },
    arsenal: prev.arsenal,
    gmg: prev.gmg,
    army: prev.army,
    score: prev.score.valid ? { ...next.score, total: prev.score.total + next.score.total } : VOID_SCORE,
    actors: next.actors.map((a) => (a.id === next.playerId ? { ...a, energy } : a)),
  }
}

/** Merlin at full energy (the roguelite heal reward, on arriving on the floor). */
export function withFullEnergy(s: SimState): SimState {
  const maxEnergy = s.defs['player']!.maxEnergy
  return { ...s, actors: s.actors.map((a) => (a.id === s.playerId ? { ...a, energy: maxEnergy } : a)) }
}

/**
 * Owner: Merlin starts a roguelite run with only his natural attack (the punch); the energy blast,
 * his starting weapon elsewhere, is one of the run's scrolls (src/run/rewards.ts).
 */
export function withRunStartArsenal(s: SimState): SimState {
  return { ...s, arsenal: naturalArsenal(s.defs['player']!) }
}
