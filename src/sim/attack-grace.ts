// Remake (owner request): a fairness grace. A hostile unit that has just become active for Merlin (its
// room entered or the map started with the room camera; a wake in the continuous world) starts no
// ranged or magic attack for the player's activationAttackGraceTicks, so nothing can be fired at him
// before he has seen the room. It still walks, and melee units attack as usual (they have to reach
// him first). Engine notes spells, "Remake decisions".
import { hostileTeamsTo } from '../mr-open/mr-team-data'
import type { AttackDef } from '../mr-open/mr-actor-data'
import { defOf, isUnit, playerOf } from './actors'
import type { ActorState, SimState } from './state'

/** Starts the grace for `a` when it is hostile to Merlin. */
export function startAttackGrace(s: SimState, a: ActorState): void {
  const p = playerOf(s)
  if (hostileTeamsTo(p.team, s.teams).includes(a.team)) a.attackGrace = defOf(s, p).activationAttackGraceTicks
}

/** The state with the grace started for every hostile unit in play (a room entered, the map start). */
export function withAttackGrace(s: SimState): SimState {
  const actors = s.actors.map((a) => {
    if (a.id === s.playerId || !isUnit(s, a)) return a
    const copy = { ...a }
    startAttackGrace(s, copy)
    return copy
  })
  return { ...s, actors }
}

/** One tick of the grace (awake units only, with the cooldowns). */
export function stepAttackGrace(a: ActorState): void {
  if (a.attackGrace > 0) a.attackGrace--
}

/** Whether the grace keeps `a` from starting `attack`: ranged and magic attacks wait, melee does not. */
export const heldByAttackGrace = (a: ActorState, attack: AttackDef): boolean => a.attackGrace > 0 && attack.type !== 'melee'
