// A pasteable JSON snapshot of the sim for bug reports and test setup (readme "Reporting bugs").
// It holds the dynamic state only: the grid comes back from the map id, the actor, team and
// animation data from the converted assets, and a hash of the actor and team data flags a
// snapshot taken with different tuning. Pure: no DOM, usable from the browser and from tests.
import type { ActorDef } from '../mr-open/mr-actor-data'
import type { Vec } from '../mr-open/mr-geometry'
import type { TeamDef } from '../mr-open/mr-team-data'
import type { Rng } from '../sim/rng'
import type { ActorState, AnimationSet, InputSnapshot, RoomState, SimState, WorldMode } from '../sim/state'
import type { WorldGrid } from '../sim/world-grid'

/** Bump when the snapshot shape or the meaning of a field changes. */
export const SNAPSHOT_VERSION = 1

/** The input that stepped the sim from `tick` to `tick + 1`. */
export interface LoggedInput {
  tick: number
  input: InputSnapshot
}

export interface SimSnapshot {
  version: number
  mapId: string
  /** the seed the current run started from (the page's ?seed=, or the restart seed after a death) */
  seed: number
  /** hashData of the actor and team data the snapshot was taken with */
  dataHash: string
  tick: number
  worldMode: WorldMode
  room: Vec
  exitsOpen: boolean
  navMode: boolean
  rng: Rng
  nextId: number
  playerId: number
  restartRequested: boolean
  actors: ActorState[]
  rooms: Record<string, RoomState>
  /** the inputs of the ticks leading up to this moment, oldest first (context; not replayed on load) */
  inputs: LoggedInput[]
}

export interface SnapshotExtras {
  mapId: string
  seed: number
  dataHash: string
  inputs?: readonly LoggedInput[]
}

// JSON has no -0, NaN or Infinity; they are written as {"$num": "..."} so a loaded state is exact.
const NUM_TAG = '$num'
const SPECIAL_NUMBERS: Record<string, number> = {
  '-0': -0, NaN: Number.NaN, Infinity: Number.POSITIVE_INFINITY, '-Infinity': Number.NEGATIVE_INFINITY,
}

function encodeNumbers(_key: string, v: unknown): unknown {
  if (typeof v !== 'number') return v
  if (Object.is(v, -0)) return { [NUM_TAG]: '-0' }
  return Number.isFinite(v) ? v : { [NUM_TAG]: String(v) }
}

function decodeNumbers(_key: string, v: unknown): unknown {
  if (!isObj(v)) return v
  const name = v[NUM_TAG]
  if (typeof name !== 'string' || !(name in SPECIAL_NUMBERS) || Object.keys(v).length !== 1) return v
  return SPECIAL_NUMBERS[name]
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** JSON with object keys sorted, so equal data gives equal text whatever order it was built in. */
function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`
  if (isObj(v)) return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(v[k])}`).join(',')}}`
  return JSON.stringify(v) ?? 'null'
}

const FNV_OFFSET = 0x811c9dc5
const FNV_PRIME = 0x01000193

/** FNV-1a (32 bit) of the actor definitions and teams, as 8 hex digits: a tuning mismatch check, not security. */
export function hashData(defs: Record<string, ActorDef>, teams: Record<string, TeamDef>): string {
  const text = stableStringify({ defs, teams })
  let h = FNV_OFFSET
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), FNV_PRIME)
  return (h >>> 0).toString(16).padStart(8, '0')
}

/** The snapshot of a sim state (the per-tick events are left out). Shares the state's objects. */
export function snapshotOf(s: SimState, extras: SnapshotExtras): SimSnapshot {
  return {
    version: SNAPSHOT_VERSION,
    mapId: extras.mapId,
    seed: extras.seed,
    dataHash: extras.dataHash,
    tick: s.tick,
    worldMode: s.worldMode,
    room: s.room,
    exitsOpen: s.exitsOpen,
    navMode: s.navMode,
    rng: s.rng,
    nextId: s.nextId,
    playerId: s.playerId,
    restartRequested: s.restartRequested,
    actors: s.actors,
    rooms: s.rooms,
    inputs: [...(extras.inputs ?? [])],
  }
}

/** The sim state as snapshot JSON; `space` pretty-prints it (test fixtures). */
export function serializeSim(s: SimState, extras: SnapshotExtras, space?: number): string {
  return JSON.stringify(snapshotOf(s, extras), encodeNumbers, space)
}

/** Parses snapshot JSON (or deep-copies a parsed snapshot) and checks its version and shape. */
export function parseSnapshot(json: string | SimSnapshot): SimSnapshot {
  const text = typeof json === 'string' ? json : JSON.stringify(json, encodeNumbers)
  const v: unknown = JSON.parse(text, decodeNumbers)
  if (!isObj(v)) throw new Error('state snapshot: not a JSON object')
  if (v['version'] !== SNAPSHOT_VERSION) throw new Error(`state snapshot: version ${String(v['version'])}, this build reads ${SNAPSHOT_VERSION}`)
  if (typeof v['mapId'] !== 'string' || typeof v['tick'] !== 'number' || !Array.isArray(v['actors']) || !isObj(v['rooms']) || !isObj(v['rng'])) {
    throw new Error('state snapshot: missing mapId, tick, actors, rooms or rng')
  }
  return v as unknown as SimSnapshot
}

/** A sim state from snapshot JSON and the static data of its map (the grid built from the snapshot's map id). */
export function deserializeSim(
  json: string | SimSnapshot,
  grid: WorldGrid,
  defs: Record<string, ActorDef>,
  teams: Record<string, TeamDef>,
  anims: Record<string, AnimationSet>,
): SimState {
  const snap = parseSnapshot(json)
  const stored = Object.values(snap.rooms).flatMap((r) => r.actors)
  const unknown = [...new Set([...snap.actors, ...stored].map((a) => a.def).filter((d) => !defs[d]))]
  if (unknown.length) throw new Error(`state snapshot: no actor definition for ${unknown.join(', ')}`)
  return {
    tick: snap.tick,
    worldMode: snap.worldMode,
    grid,
    defs,
    teams,
    anims,
    room: snap.room,
    rooms: snap.rooms,
    exitsOpen: snap.exitsOpen,
    navMode: snap.navMode,
    actors: snap.actors,
    nextId: snap.nextId,
    rng: snap.rng,
    playerId: snap.playerId,
    restartRequested: snap.restartRequested,
    events: [],
  }
}

/** The last `capacity` inputs, kept in a fixed array (one write per tick). */
export class InputLog {
  private readonly items: (LoggedInput | undefined)[]
  private next = 0

  constructor(readonly capacity = 300) {
    this.items = new Array<LoggedInput | undefined>(capacity)
  }

  push(tick: number, input: InputSnapshot): void {
    this.items[this.next] = { tick, input }
    this.next = (this.next + 1) % this.capacity
  }

  /** Oldest first. */
  entries(): LoggedInput[] {
    return [...this.items.slice(this.next), ...this.items.slice(0, this.next)].filter((e): e is LoggedInput => e !== undefined)
  }
}
