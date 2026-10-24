// Moving a generated floor into a bigger map, optionally mirrored in x, so the tower can be built
// from ordinary floors (docs/plans/2026-09-28-random-floor-design.md, The tower). Mirroring moves
// every room, tile, opening and unit, so the floor's corner roles and room plan mirror with it.
import type { Vec } from '../mr-open/mr-geometry'
import { roomNumToXY, roomXYToNum, type LayerName, type RoomDefinition, type TileGrid } from '../mr-open/mr-map-format'
import { ROOM_SIZE, roomKey, type GeneratedFloor } from './floor'
import type { Opening, RoomEdges } from './room-shape'

export interface FloorPlacement {
  /** the bigger map's size in rooms */
  mapSize: Vec
  /** rooms to move the floor by, after any mirroring */
  offset: Vec
  mirrorX: boolean
}

/** An opening along a top or bottom edge, as it lies after mirroring the room in x. */
export const mirrorOpeningX = (o: Opening): Opening => ({ from: ROOM_SIZE.x - 1 - o.to, to: ROOM_SIZE.x - 1 - o.from })

const mirrorEdgesX = (e: RoomEdges): RoomEdges => ({
  left: e.right,
  right: e.left,
  top: e.top && mirrorOpeningX(e.top),
  bottom: e.bottom && mirrorOpeningX(e.bottom),
})

const mirrorLayersX = (layers: RoomDefinition['layers']): RoomDefinition['layers'] =>
  Object.fromEntries(Object.entries(layers).map(([name, grid]) => [name, grid.map((row) => [...row].reverse())])) as Partial<Record<LayerName, TileGrid>>

/** The floor in the bigger map's rooms (its map's layers are kept; the caller sets the bigger map's). */
export function placeFloor(floor: GeneratedFloor, to: FloorPlacement): GeneratedFloor {
  const size = floor.map.mapSize
  const moveRoom = (r: Vec): Vec => ({ x: (to.mirrorX ? size.x + 1 - r.x : r.x) + to.offset.x, y: r.y + to.offset.y })
  const moveTile = (t: Vec): Vec => (to.mirrorX ? { x: ROOM_SIZE.x - 1 - t.x, y: t.y } : t)
  const rooms = floor.map.rooms.map((room) => ({
    num: roomXYToNum(moveRoom(roomNumToXY(room.num, size)), to.mapSize),
    layers: to.mirrorX ? mirrorLayersX(room.layers) : room.layers,
  }))
  const edges: Record<string, RoomEdges> = {}
  for (const room of floor.map.rooms) {
    const at = roomNumToXY(room.num, size)
    const e = floor.edges[roomKey(at)]!
    edges[roomKey(moveRoom(at))] = to.mirrorX ? mirrorEdgesX(e) : e
  }
  const placements = floor.placements.map((p) => ({ ...p, room: moveRoom(p.room), tile: moveTile(p.tile) }))
  const { startRoom, endRoom } = floor.map
  const map = {
    ...floor.map,
    mapSize: to.mapSize,
    startRoom: moveRoom(startRoom),
    ...(endRoom ? { endRoom: moveRoom(endRoom) } : {}),
    rooms,
  }
  return { map, edges, placements }
}
