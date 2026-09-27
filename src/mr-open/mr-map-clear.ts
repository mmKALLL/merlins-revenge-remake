// When a map counts as complete: objMap.isMapClear / checkMapCleared / isEndRoom, objRoom.isCleared
// and getMiniMapStatus, gameMaster.gameEvent / gameComplete, and the MR4 GameInitGlobals
// (docs/notes/engine-mechanics-map-complete.md).

/** GameInitGlobals gGameCompleteSound: played by gameMaster.gameComplete. */
export const GAME_COMPLETE_SOUND = 'end_level'

/** structMaster.structMiniMapStatusProgression: a room's status only moves up this list. */
const MINI_MAP_STATUS_PROGRESSION = ['clr', 'inf', 'fre', 'spe'] as const
export type MiniMapStatus = (typeof MINI_MAP_STATUS_PROGRESSION)[number]

const rank = (status: string | undefined): number => MINI_MAP_STATUS_PROGRESSION.indexOf(status as MiniMapStatus)

/**
 * objTileMap.getMiniMapStatus(#miniMap) over a room's actor keys (each key's actor data
 * #miniMapStatus): the highest status on the progression, starting at #clr. A status not on the
 * list (or none) ranks lowest and never counts.
 */
export function miniMapStatus(statuses: Iterable<string | undefined>): MiniMapStatus {
  let best: MiniMapStatus = MINI_MAP_STATUS_PROGRESSION[0]
  for (const status of statuses) if (rank(status) > rank(best)) best = status as MiniMapStatus
  return best
}

/**
 * objMap.init -> modMiniMap.initMiniMapData asks every room for its minimap status, and
 * objRoom.getMiniMapStatus sets pRoomCleared when it is #clr: "rooms that start clear are recognised
 * as such". A room holding only #clr actors (or none) is cleared before it is ever visited; any
 * hostile (#inf), friendly (#fre) or special (#spe, scrolls) actor leaves it to attemptOpenExits.
 */
export function isClearOnMiniMap(statuses: Iterable<string | undefined>): boolean {
  return miniMapStatus(statuses) === 'clr'
}

/** objMap.isMapClear: every room's pRoomCleared is set. */
export function isMapClear(roomsCleared: Iterable<boolean>): boolean {
  for (const cleared of roomsCleared) if (!cleared) return false
  return true
}
