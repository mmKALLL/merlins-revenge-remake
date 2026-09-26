import { roomNumToXY, type LayerName, type MapDefinition, type Vec } from '../mr-open/mr-map-format'

export const TILE_PX = 32

export interface RectPx { left: number; top: number; right: number; bottom: number }

export interface WorldGrid {
  map: MapDefinition
  widthTiles: number
  heightTiles: number
  /** 1-based world tile coords; returns 0 outside the map or for missing layers */
  tileAt(layer: LayerName, tx: number, ty: number): number
  /** outside the map is solid */
  solidAt(tx: number, ty: number): boolean
  roomOfTile(tx: number, ty: number): Vec
  roomOfPoint(px: number, py: number): Vec
  roomRectPx(room: Vec): RectPx
  roomExists(room: Vec): boolean
}

export function buildWorldGrid(map: MapDefinition, isSolid: (tileIndex: number) => boolean): WorldGrid {
  const widthTiles = map.mapSize.x * map.roomSize.x
  const heightTiles = map.mapSize.y * map.roomSize.y
  const layerNames = map.layers.map((l) => l.name)
  const grids = new Map<LayerName, Int32Array>()
  for (const name of layerNames) grids.set(name, new Int32Array(widthTiles * heightTiles))
  for (const room of map.rooms) {
    const xy = roomNumToXY(room.num, map.mapSize)
    for (const name of layerNames) {
      const src = room.layers[name]
      const dst = grids.get(name)!
      if (!src) continue
      for (let r = 0; r < map.roomSize.y; r++) {
        for (let c = 0; c < map.roomSize.x; c++) {
          const wx = (xy.x - 1) * map.roomSize.x + c
          const wy = (xy.y - 1) * map.roomSize.y + r
          dst[wy * widthTiles + wx] = src[r]![c]!
        }
      }
    }
  }
  const inside = (tx: number, ty: number) => tx >= 1 && ty >= 1 && tx <= widthTiles && ty <= heightTiles
  const tileAt = (layer: LayerName, tx: number, ty: number): number => {
    if (!inside(tx, ty)) return 0
    return grids.get(layer)?.[(ty - 1) * widthTiles + (tx - 1)] ?? 0
  }
  return {
    map, widthTiles, heightTiles, tileAt,
    solidAt: (tx, ty) => !inside(tx, ty) || isSolid(tileAt('backgroundActive', tx, ty)),
    roomOfTile: (tx, ty) => ({ x: Math.floor((tx - 1) / map.roomSize.x) + 1, y: Math.floor((ty - 1) / map.roomSize.y) + 1 }),
    roomOfPoint: (px, py) => ({
      x: Math.floor(px / (map.roomSize.x * TILE_PX)) + 1,
      y: Math.floor(py / (map.roomSize.y * TILE_PX)) + 1,
    }),
    roomRectPx: (room) => {
      const w = map.roomSize.x * TILE_PX
      const h = map.roomSize.y * TILE_PX
      return { left: (room.x - 1) * w, top: (room.y - 1) * h, right: room.x * w, bottom: room.y * h }
    },
    roomExists: (room) => room.x >= 1 && room.y >= 1 && room.x <= map.mapSize.x && room.y <= map.mapSize.y,
  }
}
