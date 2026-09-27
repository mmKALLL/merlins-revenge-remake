// The current room's exit arrows (objRoom.drawExitArrows, objRoom.txt:232-258), read from the sim
// state for the renderer. The rules are in mr-open/mr-screen-exits.ts; this file gathers their
// inputs: edge tiles from the world grid (objMap.getSurroundingInfo, objTileLayer.getScreenExitsForEdge)
// and each neighbour's hostility (objRoom.getHostile).
import type { Vec } from '../mr-open/mr-geometry'
import { TILE_PX } from '../mr-open/mr-geometry'
import {
  EDGES, EXIT_ARROWS_ON, exitArrowsForRoom, isHostileForExitArrows,
  type Edge, type EdgeLists, type ExitArrow, type ExitTile,
} from '../mr-open/mr-screen-exits'
import { isSpawnableDef } from './actors'
import { roomKey, type SimState } from './state'

/** objMap.getSurroundingInfo: the neighbour on each edge. */
const EDGE_STEP: Record<Edge, Vec> = { left: { x: -1, y: 0 }, top: { x: 0, y: -1 }, right: { x: 1, y: 0 }, bottom: { x: 0, y: 1 } }
/** ...and the neighbour's edge that faces this room. */
const FACING: Record<Edge, Edge> = { left: 'right', top: 'bottom', right: 'left', bottom: 'top' }

/**
 * The arrows drawn onto the current room, with `pos` in world pixels. objRoom.attemptOpenExits
 * draws them when the exits open (`if gExitArrows`) and they stay on the room image until it is
 * rebuilt on the next entry, so they show exactly while the exits are open. Rooms mode only: a
 * continuous world has no exits.
 */
export function exitArrowsFor(s: SimState): ExitArrow[] {
  if (!EXIT_ARROWS_ON || s.worldMode !== 'rooms' || !s.exitsOpen) return []
  const mine = {} as EdgeLists<ExitTile>
  const theirs = {} as EdgeLists<ExitTile>
  const hostiles = {} as Record<Edge, boolean>
  for (const edge of EDGES) {
    const step = EDGE_STEP[edge]
    const neighbour = { x: s.room.x + step.x, y: s.room.y + step.y }
    mine[edge] = edgeTiles(s, s.room, edge)
    const exists = s.grid.roomExists(neighbour)
    theirs[edge] = exists ? edgeTiles(s, neighbour, FACING[edge]) : []
    hostiles[edge] = exists && roomHostile(s, neighbour)
  }
  const { roomSize } = s.grid.map
  const image = { w: roomSize.x * TILE_PX, h: roomSize.y * TILE_PX }
  const origin = s.grid.roomRectPx(s.room)
  return exitArrowsForRoom(mine, theirs, hostiles, { x: TILE_PX, y: TILE_PX }, image)
    .map((a) => ({ ...a, pos: { x: origin.left + a.pos.x, y: origin.top + a.pos.y } }))
}

/** objTileLayer.getEdgeTiles + getScreenExitsForEdge: the room's first/last column or row, top to bottom or left to right. */
function edgeTiles(s: SimState, room: Vec, edge: Edge): ExitTile[] {
  const { roomSize } = s.grid.map
  const left = (room.x - 1) * roomSize.x + 1
  const top = (room.y - 1) * roomSize.y + 1
  const vertical = edge === 'left' || edge === 'right'
  const count = vertical ? roomSize.y : roomSize.x
  const tiles: ExitTile[] = []
  for (let i = 0; i < count; i++) {
    const tx = vertical ? (edge === 'left' ? left : left + roomSize.x - 1) : left + i
    const ty = vertical ? top + i : (edge === 'top' ? top : top + roomSize.y - 1)
    tiles.push(s.grid.solidAt(tx, ty) ? 'solid' : 'none')
  }
  return tiles
}

/**
 * objRoom.getHostile: a visited room (pBeenActivated) asks its saved objects (getHostileInState),
 * an unvisited one the keys placed on its objects layer (objTileMap.getMiniMapStatus via getKeyList).
 * Only keys this port spawns count, so a room does not stay red for an actor that never appears.
 */
function roomHostile(s: SimState, room: Vec): boolean {
  const status = (key: string): string | undefined => {
    const v = s.defs[key]?.raw['miniMapStatus']
    return typeof v === 'string' ? v : undefined
  }
  const stored = s.rooms[roomKey(room)]
  if (stored?.spawned) return isHostileForExitArrows(stored.actors.map((a) => status(a.def)))
  return isHostileForExitArrows(roomObjectKeys(s, room).map(status))
}

/** The spawnable actor keys on a room's objects layer. */
function roomObjectKeys(s: SimState, room: Vec): string[] {
  const { roomSize } = s.grid.map
  const keys: string[] = []
  for (let ty = 1; ty <= roomSize.y; ty++) {
    for (let tx = 1; tx <= roomSize.x; tx++) {
      const key = s.grid.objectSymbolAt((room.x - 1) * roomSize.x + tx, (room.y - 1) * roomSize.y + ty)
      const def = key === null ? undefined : s.defs[key]
      if (key !== null && def && isSpawnableDef(def)) keys.push(key)
    }
  }
  return keys
}
