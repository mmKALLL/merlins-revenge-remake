// When the map is complete (docs/notes/engine-mechanics-map-complete.md). In rooms mode the engine
// asks objMap.checkMapCleared from every objRoom.attemptOpenExits that finds no hostile left (room
// activation and gameMaster.teamDied), and gameMaster.teamDied also completes the map when the room
// it clears is the map's #endRoom. Both raise gameEvent(#mapClear), gGameCompleteEvent in MR4, so
// gameMaster.gameComplete runs: the game finishes, the game-complete sound plays and movieMaster
// fades to the end cut scene. The continuous world (a remake feature) has no rooms to clear: its map
// is complete once no hostile is left anywhere.
import type { Vec } from '../mr-open/mr-geometry'
import { GAME_COMPLETE_SOUND, isClearOnMiniMap, isMapClear } from '../mr-open/mr-map-clear'
import { DEFAULT_VOLUME } from '../mr-open/mr-sound'
import { roomKey, type SimState } from './state'
import { exitsOpenFor } from './tick-combat'

/**
 * objMap.isMapClear over every room's pRoomCleared. The current room's is RoomState.clear (set when
 * its exits open); a room left behind was cleared before its exits let Merlin out (or, after the
 * remake's world-mode switch, holds no hostile); a room never visited is cleared when every actor
 * key on its objects layer has minimap status #clr (modMiniMap.initMiniMapData at map start). Keys
 * without actor data in the port are skipped.
 */
export function isWholeMapClear(s: SimState): boolean {
  if (s.worldMode === 'continuous') return exitsOpenFor(s, s.actors)
  const cleared: boolean[] = []
  const { mapSize } = s.grid.map
  for (let y = 1; y <= mapSize.y; y++) {
    for (let x = 1; x <= mapSize.x; x++) cleared.push(isRoomCleared(s, { x, y }))
  }
  return isMapClear(cleared)
}

function isRoomCleared(s: SimState, room: Vec): boolean {
  const stored = s.rooms[roomKey(room)]
  if (room.x === s.room.x && room.y === s.room.y) return stored?.clear ?? false
  if (stored?.spawned) return stored.clear || exitsOpenFor(s, stored.actors)
  return isClearOnMiniMap(roomObjectKeys(s, room).map((key) => {
    const status = s.defs[key]?.raw['miniMapStatus']
    return typeof status === 'string' ? status : undefined
  }))
}

/** objTileMap.getKeyList: every actor key on the room's objects layer that has actor data. */
function roomObjectKeys(s: SimState, room: Vec): string[] {
  const { roomSize } = s.grid.map
  const keys: string[] = []
  for (let ty = 1; ty <= roomSize.y; ty++) {
    for (let tx = 1; tx <= roomSize.x; tx++) {
      const key = s.grid.objectSymbolAt((room.x - 1) * roomSize.x + tx, (room.y - 1) * roomSize.y + ty)
      if (key !== null && s.defs[key]) keys.push(key)
    }
  }
  return keys
}

/** objMap.isEndRoom: the current room is the map's #endRoom. */
export function isEndRoom(s: SimState): boolean {
  const end = s.grid.map.endRoom
  return end !== undefined && end.x === s.room.x && end.y === s.room.y
}

/**
 * gameMaster.gameComplete, once: the `mapComplete` event for the presentation and
 * gGameCompleteSound. The engine then finishes every actor (finishGame); the port keeps them for
 * the fade out but stops their AI, casting and production (stepSim).
 */
export function completeMap(s: SimState): SimState {
  if (s.mapComplete) return s
  return {
    ...s,
    mapComplete: true,
    events: [...s.events, { kind: 'mapComplete' }, { kind: 'sound', name: GAME_COMPLETE_SOUND, volume: DEFAULT_VOLUME }],
  }
}

/** objMap.checkMapCleared, called from attemptOpenExits once the room's exits are open. */
export function checkMapCleared(s: SimState): SimState {
  return isWholeMapClear(s) ? completeMap(s) : s
}
