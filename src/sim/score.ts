// Scoring (remake feature, owner request; engine notes hud, "Scoring"). Every room is worth up to
// ROOM_POINTS_MAX points, counting down to 0 over ROOM_COUNTDOWN_TICKS of Merlin's time in it while
// it is not yet clear; leaving pauses the countdown, coming back resumes it. Once the room is clear
// (RoomState.clear: its exits have opened) its points left are banked into the map's total. A room
// that is clear on entry (no hostile in it) pays its full value. The continuous world has no
// rooms to count down, so starting or switching to it voids the run's score.
import type { Vec } from '../mr-open/mr-geometry'
import { roomKey, TICKS_PER_SECOND, type SimState } from './state'

export const ROOM_POINTS_MAX = 9999
const ROOM_COUNTDOWN_SECONDS = 200
export const ROOM_COUNTDOWN_TICKS = ROOM_COUNTDOWN_SECONDS * TICKS_PER_SECOND

export interface RoomScore {
  ticks: number // ticks Merlin spent in the room before it was clear (capped at ROOM_COUNTDOWN_TICKS)
  banked: boolean // the room is clear and its points are in the total
}

export interface ScoreState {
  total: number // the banked points of every cleared room
  rooms: Record<string, RoomScore> // key `${x},${y}`; a room is listed from Merlin's first entry
  valid: boolean // false once the run has been played in the continuous world
}

export const NEW_SCORE: ScoreState = { total: 0, rooms: {}, valid: true }
/** A run played in the continuous world: no score. */
export const VOID_SCORE: ScoreState = { total: 0, rooms: {}, valid: false }

const NEW_ROOM: RoomScore = { ticks: 0, banked: false }

/** The points a room is worth after `ticks` of countdown: linear from ROOM_POINTS_MAX to 0. */
export function roomPoints(ticks: number): number {
  const left = Math.max(0, ROOM_COUNTDOWN_TICKS - ticks)
  return Math.floor((ROOM_POINTS_MAX * left) / ROOM_COUNTDOWN_TICKS)
}

/** The score at the start of a run, or after the switch to the continuous world (void). */
export function startScore(s: SimState): ScoreState {
  return s.worldMode === 'continuous' ? VOID_SCORE : withRoomBanked(s, NEW_SCORE, s.room)
}

/**
 * One tick's score: the room Merlin was in at the start of the tick counts down if it was not
 * clear then, and the rooms of the tick's start and end are banked if they are clear now.
 */
export function stepScore(before: SimState, after: SimState): ScoreState {
  const score = after.score
  if (!score.valid) return score
  if (after.worldMode === 'continuous') return VOID_SCORE
  const counted = countDown(before, score)
  return withRoomBanked(after, withRoomBanked(after, counted, before.room), after.room)
}

function countDown(s: SimState, score: ScoreState): ScoreState {
  const key = roomKey(s.room)
  const room = score.rooms[key] ?? NEW_ROOM
  if (room.banked || s.rooms[key]?.clear || room.ticks >= ROOM_COUNTDOWN_TICKS) return score
  return { ...score, rooms: { ...score.rooms, [key]: { ...room, ticks: room.ticks + 1 } } }
}

function withRoomBanked(s: SimState, score: ScoreState, room: Vec): ScoreState {
  const key = roomKey(room)
  const entry = score.rooms[key] ?? NEW_ROOM
  if (entry.banked || !s.rooms[key]?.clear) return score
  return { ...score, total: score.total + roomPoints(entry.ticks), rooms: { ...score.rooms, [key]: { ...entry, banked: true } } }
}

/** The current room's points still to win (the HUD's "+1234"), or null once banked or without a score. */
export function currentRoomPoints(s: SimState): number | null {
  if (!s.score.valid) return null
  const room = s.score.rooms[roomKey(s.room)] ?? NEW_ROOM
  return room.banked ? null : roomPoints(room.ticks)
}
