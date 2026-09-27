// Switching the world mode during play (remake feature, the C key; engine notes walking-and-rooms,
// "Continuous world"). Runs between ticks and draws no random numbers.
import type { Vec } from '../mr-open/mr-geometry'
import { asleep, canSleep, navModeClear, withinWakeDistance } from './activation'
import { isUnit, playerOf, spawnAllRooms } from './actors'
import { roomKey, type ActorState, type SimState, type WorldMode } from './state'
import { EMPTY_ROOM, withExitsEvaluated } from './tick'

/** The same state played the other way: room by room, or as one continuous world. */
export function switchWorldMode(s: SimState, mode: WorldMode): SimState {
  if (s.worldMode === mode) return s
  return mode === 'continuous' ? toContinuous(s) : toRooms(s)
}

/**
 * Rooms -> continuous: the current room's actors stay as they are, visited rooms' stored units
 * rejoin the live list and never-visited rooms spawn; those units are awake only within
 * wakeDistance of Merlin, as at a continuous map start, or while they cannot sleep yet (stored
 * mid-reel, mid-attack or dying: stepActivation puts them to sleep once calm). The exits stop gating.
 */
function toContinuous(s: SimState): SimState {
  const current = new Set(s.actors.map((a) => a.id))
  const restored: ActorState[] = []
  let rooms = s.rooms
  forEachRoom(s, (room) => {
    const key = roomKey(room)
    const stored = rooms[key]
    if (!stored?.actors.length) return
    restored.push(...stored.actors)
    rooms = { ...rooms, [key]: { ...stored, actors: [] } }
  })
  const spawned = spawnAllRooms({ ...s, worldMode: 'continuous', rooms, actors: [...s.actors, ...restored] })
  const p = playerOf(spawned)
  const actors = spawned.actors.map((a) => {
    if (current.has(a.id) || !isUnit(spawned, a)) return a
    return withinWakeDistance(spawned, p, a) || !canSleep(a) ? { ...a, awake: true, wakeHold: 0 } : asleep(spawned, a)
  })
  const next: SimState = { ...spawned, actors, exitsOpen: true, events: [] }
  return { ...next, navMode: navModeClear(next) }
}

/**
 * Continuous -> rooms: Merlin's room becomes the current room and keeps its actors; units elsewhere
 * (dying ones too, whose death goes on when their room is back in play) are stored in the room their
 * position is in, and other bullets and spells are dropped.
 * The exits and nav mode then follow the room rule, as on entering the room.
 */
function toRooms(s: SimState): SimState {
  const roomOf = (a: ActorState): Vec => s.grid.roomOfPoint(a.pos.x, a.pos.y)
  const room = roomOf(playerOf(s))
  const currentKey = roomKey(room)
  const live: ActorState[] = []
  let rooms = s.rooms
  for (const a of s.actors) {
    const awake: ActorState = { ...a, awake: true, wakeHold: 0 }
    const key = roomKey(roomOf(a))
    if (key === currentKey) {
      live.push(awake)
      continue
    }
    if (!isUnit(s, a)) continue
    const stored = rooms[key] ?? EMPTY_ROOM
    rooms = { ...rooms, [key]: { ...stored, spawned: true, actors: [...stored.actors, awake] } }
  }
  return withExitsEvaluated({ ...s, worldMode: 'rooms', room, rooms, actors: live, events: [] })
}

function forEachRoom(s: SimState, fn: (room: Vec) => void): void {
  const { mapSize } = s.grid.map
  for (let y = 1; y <= mapSize.y; y++) {
    for (let x = 1; x <= mapSize.x; x++) fn({ x, y })
  }
}
