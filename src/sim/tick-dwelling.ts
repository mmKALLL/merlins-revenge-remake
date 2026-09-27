// Dwellings (objDwelling + modResidents; engine notes enemies-2 §2b). A map-placed dwelling is
// prebuilt, so production starts at once: build a random group, wait for room under the team cap,
// release one resident per interval on its reg point, and after totalResidents releases destroy
// itself. Hits, reel and death go through the shared combat code (applyHit, stepReelAndDeath).
import type { ActorDef } from '../mr-open/mr-actor-data'
import { tileOfPx } from '../mr-open/mr-collision'
import { afterRelease, permissionToRelease, releaseCountdown, startProduction, type DwellingState } from '../mr-open/mr-residents'
import { DEFAULT_VOLUME } from '../mr-open/mr-sound'
import { defOf, isAlive, isDwelling, isUnit } from './actors'
import type { ActorState } from './state'
import { playSound, spawn, type Tick } from './tick-context'
import { startDeath } from './tick-combat'

/** modExperience.levelUp: the dwelling levels up on every release and plays this (pReleaseStarOnLevel). */
export const LEVEL_UP_SOUND = 'level_up'

export function stepDwellings(t: Tick): void {
  for (const a of t.actors) {
    if (t.removed.has(a.id) || !a.dwelling || !isAlive(a) || !a.awake) continue
    a.dwelling = stepProduction(t, a, defOf(t.s, a), a.dwelling)
  }
}

function stepProduction(t: Tick, a: ActorState, def: ActorDef, d: DwellingState): DwellingState {
  switch (d.phase) {
    case 'start':
      return withRng(t, startProduction(def, d, t.rng))
    case 'produceGroup':
      return d.counter > 1 ? { ...d, counter: d.counter - 1 } : { ...d, phase: 'awaitPermission' }
    case 'awaitPermission':
      if (!teamHasRoomFor(t, a.team, d.groupLeft)) return d
      return withRng(t, releaseCountdown(def, { ...d, reserved: d.groupLeft }, t.rng))
    case 'releaseCountdown':
      if (d.counter > 1) return { ...d, counter: d.counter - 1 }
      releaseResident(t, a, def, d)
      return postReleaseResident(t, a, def, afterRelease(d))
    case 'empty':
      return d
  }
}

const withRng = (t: Tick, [d, rng]: [DwellingState, Tick['rng']]): DwellingState => {
  t.rng = rng
  return d
}

/** reservationsMaster.getPermissionToRelease for `n` more members of `team`. */
export function teamHasRoomFor(t: Tick, team: string, n: number): boolean {
  return permissionToRelease(teamMembers(t, team), reservedSlots(t, team), n, t.s.teams[team]?.maxMembers ?? null)
}

/**
 * reservationsMaster currentMembers: the team's #teamMembers in the room (towers and plants are
 * characters in the #teamBuildings role and do not count; a dying one leaves the team only on #finish).
 * In a continuous world the awake units stand in for the room's.
 */
function teamMembers(t: Tick, team: string): number {
  return t.actors.filter((o) => !t.removed.has(o.id) && o.awake && o.team === team && isUnit(t.s, o) && defOf(t.s, o).teamRole === 'teamMembers' && o.mode !== 'finish').length
}

/**
 * reservationsMaster reservedSlots: slots the team's living dwellings reserved and have not released
 * yet, plus those held by its summon spells still in play (awake dwellings only, as for teamMembers).
 */
function reservedSlots(t: Tick, team: string): number {
  return t.actors
    .filter((o) => !t.removed.has(o.id) && o.awake && o.team === team && ((isDwelling(t.s, o) && isAlive(o)) || o.summonReserved > 0))
    .reduce((n, o) => n + (o.dwelling?.reserved ?? 0) + o.summonReserved, 0)
}

/**
 * modResidents.releaseResident: newActor on the dwelling's reg point (useOffset false), with the
 * resident's own data and team. A solid tile there cancels the spawn (actorMaster's placement check)
 * but the resident still counts as released. The dwelling levels up (sound only: experience, the
 * residents' starting levels and the -1 % energy per level are not ported).
 */
function releaseResident(t: Tick, a: ActorState, def: ActorDef, d: DwellingState): void {
  const typ = def.residentGroups[d.group]!.typ
  if (!t.s.grid.solidAt(tileOfPx(a.pos.x), tileOfPx(a.pos.y))) spawn(t, typ, a.pos, {})
  playSound(t, LEVEL_UP_SOUND, DEFAULT_VOLUME)
}

/** modResidents.postReleaseResident / produceNextGroupOrDie: next release, next group, or self-destruction. */
function postReleaseResident(t: Tick, a: ActorState, def: ActorDef, d: DwellingState): DwellingState {
  if (d.groupLeft > 0) return withRng(t, releaseCountdown(def, d, t.rng))
  if (d.remaining > 0) return withRng(t, startProduction(def, d, t.rng))
  startDeath(t, a) // objDwelling.noMoreResidents
  return { ...d, phase: 'empty' }
}
