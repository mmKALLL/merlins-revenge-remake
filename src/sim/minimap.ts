// What the mini-map shows (docs/notes/engine-mechanics-minimap.md): modMiniMap is on screen while
// Merlin is in nav mode, and each room's cell takes the room's minimap status. The engine caches
// the statuses (pMapData: every room at map init, the four neighbours and #cur on each display);
// rooms are frozen while Merlin is elsewhere, so computing them when drawn gives the same picture.
// The continuous world (remake feature) has no current room: every room's cell comes from the
// living units standing in it, and the renderer marks the view instead.
import type { Vec } from '../mr-open/mr-geometry'
import { miniMapStatus, type MiniMapStatus } from '../mr-open/mr-map-clear'
import type { MiniMapCell } from '../mr-open/mr-minimap'
import { isAlive, isUnit } from './actors'
import { miniMapStatusOf, roomObjectKeys } from './map-complete'
import { roomKey, type SimState } from './state'

/**
 * modMiniMap.displayMiniMap runs on gameMaster.goNavMode and miniMapOffScreen on leaveNavMode;
 * gameMaster.finishGame finishes the map and its mini-map with it once the map is complete.
 */
export const miniMapShown = (s: SimState): boolean => s.navMode && !s.mapComplete

/**
 * Every room's cell, `cells[y - 1][x - 1]` for room (x, y). Remake (roguelite): a markExit map's end
 * room shows as the exit unless Merlin stands in it.
 */
export function miniMapCells(s: SimState): MiniMapCell[][] {
  const statusOf = s.worldMode === 'continuous' ? liveRoomStatuses(s) : (room: Vec) => roomsModeCell(s, room)
  const { mapSize, endRoom, markExit } = s.grid.map
  const exit = markExit ? endRoom : undefined
  const cellOf = (room: Vec): MiniMapCell => {
    const cell = statusOf(room)
    return exit && cell !== 'cur' && room.x === exit.x && room.y === exit.y ? 'exit' : cell
  }
  return Array.from({ length: mapSize.y }, (_, y) => Array.from({ length: mapSize.x }, (_, x) => cellOf({ x: x + 1, y: y + 1 })))
}

/**
 * modMiniMap.getMiniMapData: #cur for the current room, else objRoom.getMiniMapStatus: from the
 * room's saved state once it has been activated (getMiniMapStatusFromRoomState over the stored
 * units), otherwise from the actor keys on its objects layer (objTileMap.getMiniMapStatus).
 */
function roomsModeCell(s: SimState, room: Vec): MiniMapCell {
  if (room.x === s.room.x && room.y === s.room.y) return 'cur'
  const stored = s.rooms[roomKey(room)]
  const defs = stored?.spawned ? stored.actors.map((a) => a.def) : roomObjectKeys(s, room)
  return miniMapStatus(defs.map((def) => miniMapStatusOf(s, def)))
}

/** Continuous world: each room's status over the living units whose position is in it. */
function liveRoomStatuses(s: SimState): (room: Vec) => MiniMapStatus {
  const statuses = new Map<string, (string | undefined)[]>()
  for (const a of s.actors) {
    if (!isUnit(s, a) || !isAlive(a)) continue
    const key = roomKey(s.grid.roomOfPoint(a.pos.x, a.pos.y))
    const list = statuses.get(key) ?? []
    list.push(miniMapStatusOf(s, a.def))
    statuses.set(key, list)
  }
  return (room) => miniMapStatus(statuses.get(roomKey(room)) ?? [])
}
