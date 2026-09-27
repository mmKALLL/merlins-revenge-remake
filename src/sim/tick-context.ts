// Per-tick working set shared by the tick steps. `stepSim` copies every actor once, the steps
// mutate those copies in place (assigning new Vec objects, never mutating the input's), and the
// orchestrator assembles the next immutable SimState from the result. Nothing here touches the
// input state's objects, so `stepSim` stays pure.
//
// Sleeping units of a continuous world (activation.ts) are not copied: they wait in `sleepers`,
// untouched, so a big map costs little per tick. The steps only see them where a sleeper can still
// take part: hits (splash victims, a bullet's target) and Merlin's aim at the nearest hostile. A
// sleeper about to be hit is brought into the tick first (hitTargetIn).
import type { Vec } from '../mr-open/mr-geometry'
import { createActor } from './actors'
import type { Rng } from './rng'
import type { ActorState, SimEvent, SimState } from './state'

export interface Tick {
  s: SimState // the state being stepped (read-only)
  actors: ActorState[] // working copies, plus actors created this tick and sleepers brought in
  sleepers: ActorState[] // continuous world: the input's sleeping units, not copied (read-only)
  broughtIn: Set<number> // sleeper ids copied into `actors` this tick
  prev: Map<number, ActorState> // the input state's working actors by id (mode at the start of the tick)
  removed: Set<number> // ids removed this tick (finished, landed, hit)
  hit: Set<number> // ids that took a hit this tick (their reel stall counting starts next tick)
  graves: { def: string; pos: Vec }[] // graves recorded this tick in the current room
  events: SimEvent[]
  rng: Rng
  nextId: number
  restartRequested: boolean
}

const workingCopy = (a: ActorState): ActorState => ({ ...a, ai: { ...a.ai } })

export function beginTick(s: SimState): Tick {
  const awake = s.actors.filter((a) => a.awake)
  return {
    s,
    actors: awake.map(workingCopy),
    sleepers: awake.length === s.actors.length ? [] : s.actors.filter((a) => !a.awake),
    broughtIn: new Set(),
    prev: new Map(awake.map((a) => [a.id, a])),
    removed: new Set(),
    hit: new Set(),
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

/** A sleeper still waiting (not brought into this tick). */
export function sleeperIn(t: Tick, id: number): ActorState | undefined {
  if (t.broughtIn.has(id)) return undefined
  return t.sleepers.find((a) => a.id === id)
}

/** Sleepers not brought into this tick. */
export const waitingSleepers = (t: Tick): ActorState[] => (t.broughtIn.size ? t.sleepers.filter((a) => !t.broughtIn.has(a.id)) : t.sleepers)

/** Copies a sleeper into the tick's working actors (still asleep until activation decides) and returns the copy. */
export function bringIn(t: Tick, sleeper: ActorState): ActorState {
  const a = workingCopy(sleeper)
  t.actors.push(a)
  t.broughtIn.add(a.id)
  t.prev.set(a.id, sleeper)
  return a
}

/** The actor a hit lands on: a working actor, or a sleeper brought into the tick for it. */
export function hitTargetIn(t: Tick, id: number): ActorState | undefined {
  const a = actorIn(t, id)
  if (a) return a
  const sleeper = sleeperIn(t, id)
  return sleeper && bringIn(t, sleeper)
}

/** Spawns an actor into the tick from `defs[key]`, with `over` applied, and returns the working copy. */
export function spawn(t: Tick, key: string, pos: Vec, over: Partial<ActorState>): ActorState {
  const [actor, after] = createActor({ ...t.s, nextId: t.nextId }, key, pos)
  t.nextId = after.nextId
  const a: ActorState = { ...actor, ...over }
  t.actors.push(a)
  return a
}

/** modSoundFX.playSound: #none (null) plays nothing. */
export function playSound(t: Tick, name: string | null, volume: number): void {
  if (name !== null) t.events.push({ kind: 'sound', name, volume })
}

export function playerIn(t: Tick): ActorState {
  const p = actorIn(t, t.s.playerId)
  if (!p) throw new Error('sim state has no player actor')
  return p
}
