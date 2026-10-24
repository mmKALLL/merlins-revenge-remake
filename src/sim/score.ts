// Scoring (remake feature, owner request; engine notes hud, "Scoring"). Every room with something
// to clear is worth up to ROOM_POINTS_MAX points, counting down to 0 over ROOM_COUNTDOWN_TICKS of
// Merlin's time in it while it is not yet clear; leaving pauses the countdown, coming back resumes
// it. Once the room is clear its points left are banked into the map's total. A room that is clear
// on Merlin's first entry (no hostile in it) pays nothing. The continuous world scores the same way,
// by the map's rooms; switching the world mode during a run voids the run's score.
import type { Vec } from '../mr-open/mr-geometry'
import { roomKey, TICKS_PER_SECOND, type SimState } from './state'
import { exitsOpenFor } from './tick-combat'

export const ROOM_POINTS_MAX = 9999
const ROOM_COUNTDOWN_SECONDS = 200
export const ROOM_COUNTDOWN_TICKS = ROOM_COUNTDOWN_SECONDS * TICKS_PER_SECOND

export interface RoomScore {
  ticks: number // ticks Merlin spent in the room before it was clear (capped at ROOM_COUNTDOWN_TICKS)
  banked: boolean // the room is clear and its points are in the total
  clearOnEntry?: boolean // the room was clear when Merlin first entered it: nothing to win
}

export interface ScoreState {
  total: number // the banked points of every cleared room
  rooms: Record<string, RoomScore> // key `${x},${y}`; a room is listed from Merlin's first entry
  valid: boolean // false once the world mode has been switched during the run
}

export const NEW_SCORE: ScoreState = { total: 0, rooms: {}, valid: true }
/** A run whose world mode was switched: no score. */
export const VOID_SCORE: ScoreState = { total: 0, rooms: {}, valid: false }

const NEW_ROOM: RoomScore = { ticks: 0, banked: false }
const CLEAR_ON_ENTRY: RoomScore = { ticks: 0, banked: true, clearOnEntry: true }

/** The points a room is worth after `ticks` of countdown: linear from ROOM_POINTS_MAX to 0. */
export function roomPoints(ticks: number): number {
  const left = Math.max(0, ROOM_COUNTDOWN_TICKS - ticks)
  return Math.floor((ROOM_POINTS_MAX * left) / ROOM_COUNTDOWN_TICKS)
}

const pointsOf = (room: RoomScore): number => (room.clearOnEntry ? 0 : roomPoints(room.ticks))

/** The score at the start of a run, as Merlin enters the start room. */
export function startScore(s: SimState): ScoreState {
  return withRoomBanked(s, NEW_SCORE, s.room)
}

/**
 * One tick's score: the room Merlin was in at the start of the tick counts down if it was not
 * clear then, and the rooms of the tick's start and end are banked if they are clear now.
 */
export function stepScore(before: SimState, after: SimState): ScoreState {
  const score = after.score
  if (!score.valid) return score
  const counted = countDown(before, score)
  return withRoomBanked(after, withRoomBanked(after, counted, before.room), after.room)
}

/**
 * Whether a room has nothing left to clear. Rooms mode: RoomState.clear (its exits have opened).
 * The continuous world keeps no such flag: a room is clear while no hostile unit stands in its area.
 */
function isRoomClear(s: SimState, room: Vec): boolean {
  const key = roomKey(room)
  if (s.worldMode === 'rooms') return s.rooms[key]?.clear ?? false
  return exitsOpenFor(s, s.actors.filter((a) => roomKey(s.grid.roomOfPoint(a.pos.x, a.pos.y)) === key))
}

function countDown(s: SimState, score: ScoreState): ScoreState {
  const key = roomKey(s.room)
  const room = score.rooms[key] ?? NEW_ROOM
  if (room.banked || room.ticks >= ROOM_COUNTDOWN_TICKS || isRoomClear(s, s.room)) return score
  return { ...score, rooms: { ...score.rooms, [key]: { ...room, ticks: room.ticks + 1 } } }
}

/**
 * Banks a room once it is clear. A room not listed yet was clear on Merlin's first entry and pays
 * nothing: a room with a hostile in it is listed by its first countdown tick.
 */
function withRoomBanked(s: SimState, score: ScoreState, room: Vec): ScoreState {
  const key = roomKey(room)
  const entry = score.rooms[key]
  if (entry?.banked || !isRoomClear(s, room)) return score
  const banked = entry ? { ...entry, banked: true } : CLEAR_ON_ENTRY
  return { ...score, total: score.total + pointsOf(banked), rooms: { ...score.rooms, [key]: banked } }
}

/** The current room's points still to win (the HUD's "+1234"), or null once banked or without a score. */
export function currentRoomPoints(s: SimState): number | null {
  if (!s.score.valid) return null
  const room = s.score.rooms[roomKey(s.room)] ?? NEW_ROOM
  return room.banked ? null : roomPoints(room.ticks)
}
