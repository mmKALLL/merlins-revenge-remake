// Port of modResidents (production cycle of objDwelling, modResidents.txt:22-243) and
// reservationsMaster.getPermissionToRelease (reservationsMaster.txt:56-74): a dwelling picks a random
// resident group, builds it, waits until the whole group fits under its team's member cap, then
// releases one resident per release interval; after `totalResidents` releases it destroys itself.
// Engine notes: docs/notes/engine-mechanics-enemies-2.md §2b.
import type { ActorDef } from './mr-actor-data'
import { randomInt, rndRange, type Rng } from '../sim/rng'

export type DwellingPhase = 'start' | 'produceGroup' | 'awaitPermission' | 'releaseCountdown' | 'empty'

export interface DwellingState {
  phase: DwellingPhase
  group: number // index into ActorDef.residentGroups of the group in production
  groupLeft: number // residents of the current group not released yet
  remaining: number // residents of totalResidents not released yet (pResidentsRemainingCounter)
  counter: number // ticks left in produceGroup / releaseCountdown
  reserved: number // team slots reserved for the current group and not released yet
}

export const dwellingStart = (def: ActorDef): DwellingState => ({
  phase: 'start', group: 0, groupLeft: 0, remaining: def.totalResidents, counter: 0, reserved: 0,
})

/**
 * modResidents.startProduction: a uniformly random group, its size (capped by the residents left)
 * and build time; production takes groupSize * buildTime ticks. The engine multiplies the group-size
 * counter list rather than its count (modResidents.txt:185), so what it really did is unknown; this
 * follows the evident intent, scaled by the remake's productionTimeScale. A dwelling without groups
 * (all of them unported) stays empty.
 */
export function startProduction(def: ActorDef, d: DwellingState, rng: Rng): [DwellingState, Rng] {
  const groups = def.residentGroups
  if (groups.length === 0 || d.remaining <= 0) return [{ ...d, phase: 'empty' }, rng]
  const [pick, r1] = randomInt(rng, groups.length)
  const group = groups[pick - 1]!
  const [size, r2] = rndRange(r1, group.groupSize)
  const [buildTime, r3] = rndRange(r2, group.buildTime)
  const groupLeft = Math.min(size, d.remaining)
  const counter = Math.round(groupLeft * buildTime * def.productionTimeScale)
  return [{ ...d, phase: 'produceGroup', group: pick - 1, groupLeft, counter, reserved: 0 }, r3]
}

/** reservationsMaster.getPermissionToRelease: the whole group must fit under the team cap (null = no cap). */
export function permissionToRelease(currentMembers: number, reservedSlots: number, numToRelease: number, maxMembers: number | null): boolean {
  return maxMembers === null || currentMembers + reservedSlots + numToRelease <= maxMembers
}

/** #releaseCountdown entry: a fresh random interval from the current group (modResidents.txt:98-107, 173-176). */
export function releaseCountdown(def: ActorDef, d: DwellingState, rng: Rng): [DwellingState, Rng] {
  const group = def.residentGroups[d.group]!
  const [counter, next] = rndRange(rng, group.releaseInterval)
  return [{ ...d, phase: 'releaseCountdown', counter }, next]
}

/** releaseResident's bookkeeping: one resident fewer in the group, in the total and in the reservation. */
export const afterRelease = (d: DwellingState): DwellingState => ({
  ...d, groupLeft: d.groupLeft - 1, remaining: d.remaining - 1, reserved: Math.max(0, d.reserved - 1),
})
