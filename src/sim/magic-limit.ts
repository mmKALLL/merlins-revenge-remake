// The magic limiters in play (objMagicLimit, mr-magic-limit.ts). A room's objects are created when
// Merlin enters it and finished when he leaves (objRoom's store and restore), so a limiter holds the
// magic limit while Merlin is in its room. A continuous world (remake) keeps every room's objects
// alive; there a room's limiters come into play as Merlin walks into it and leave play as he walks
// out, as in the rooms world mode.
import type { Vec } from '../mr-open/mr-geometry'
import { magicLimitAfter } from '../mr-open/mr-magic-limit'
import { defOf, isMagicLimiter } from './actors'
import type { ActorState, SimState } from './state'

/** The percentages of the limiters among `actors`, in list (creation) order. */
function limitsOf(s: SimState, actors: readonly ActorState[]): number[] {
  const limits: number[] = []
  for (const a of actors) {
    const limit = isMagicLimiter(s, a) ? defOf(s, a).magicLimit : null
    if (limit !== null) limits.push(limit)
  }
  return limits
}

/** The state with the magic limit after the actors `left` leave play and the actors `entered` come in. */
export function withMagicLimiters(s: SimState, left: readonly ActorState[], entered: readonly ActorState[]): SimState {
  const magicLimit = magicLimitAfter(s.magicLimit, limitsOf(s, left), limitsOf(s, entered))
  return magicLimit === s.magicLimit ? s : { ...s, magicLimit }
}

/** Continuous world: the actors standing in `room`. */
export function actorsInRoom(s: SimState, room: Vec): ActorState[] {
  return s.actors.filter((a) => {
    const at = s.grid.roomOfPoint(a.pos.x, a.pos.y)
    return at.x === room.x && at.y === room.y
  })
}
