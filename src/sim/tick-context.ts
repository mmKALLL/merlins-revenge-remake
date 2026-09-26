// Per-tick working set shared by the tick steps. `stepSim` copies every actor once, the steps
// mutate those copies in place (assigning new Vec objects, never mutating the input's), and the
// orchestrator assembles the next immutable SimState from the result. Nothing here touches the
// input state's objects, so `stepSim` stays pure.
import type { Vec } from '../mr-open/mr-geometry'
import type { Rng } from './rng'
import type { ActorState, SimEvent, SimState } from './state'

export interface Tick {
  s: SimState // the state being stepped (read-only)
  actors: ActorState[] // working copies, plus actors created this tick
  prev: Map<number, ActorState> // the input state's actors by id (mode at the start of the tick)
  removed: Set<number> // ids removed this tick (finished, landed, hit)
  graves: { def: string; pos: Vec }[] // graves recorded this tick in the current room
  events: SimEvent[]
  rng: Rng
  nextId: number
  restartRequested: boolean
}

export function beginTick(s: SimState): Tick {
  return {
    s,
    actors: s.actors.map((a) => ({ ...a, ai: { ...a.ai } })),
    prev: new Map(s.actors.map((a) => [a.id, a])),
    removed: new Set(),
    graves: [],
    events: [],
    rng: s.rng,
    nextId: s.nextId,
    restartRequested: s.restartRequested,
  }
}

/** An actor of this tick that has not been removed. */
export function actorIn(t: Tick, id: number): ActorState | undefined {
  if (t.removed.has(id)) return undefined
  return t.actors.find((a) => a.id === id)
}

export function playerIn(t: Tick): ActorState {
  const p = actorIn(t, t.s.playerId)
  if (!p) throw new Error('sim state has no player actor')
  return p
}
