// Applies assets/map-patches/<map id>.json on top of a converted map, so test content can be added
// without editing the copies of the original map files. A patch places objects-layer symbols.
import type { MapDefinition } from '../src/mr-open/mr-map-format'

export interface MapPatch {
  why?: string
  objects: { room: number; col: number; row: number; symbol: string }[]
}

/** Returns a patched copy; `objectSymbols[i]` is the objects tileset's symbol for tile index i + 1. */
export function applyMapPatch(map: MapDefinition, patch: MapPatch, objectSymbols: string[], mapName: string): MapDefinition {
  const rooms = map.rooms.map((r) => ({ ...r, layers: { ...r.layers } }))
  for (const o of patch.objects) {
    const where = `map patch ${mapName}: room ${o.room} (${o.col},${o.row}) ${o.symbol}`
    const index = objectSymbols.indexOf(o.symbol) + 1
    if (index === 0) throw new Error(`${where}: symbol not in the objects tileset key`)
    const room = rooms.find((r) => r.num === o.room)
    if (!room) throw new Error(`${where}: no such room`)
    if (o.col < 1 || o.row < 1 || o.col > map.roomSize.x || o.row > map.roomSize.y) throw new Error(`${where}: outside the room`)
    const objects = (room.layers.objects ?? Array.from({ length: map.roomSize.y }, () => Array(map.roomSize.x).fill(0))).map((row) => [...row])
    objects[o.row - 1]![o.col - 1] = index
    room.layers.objects = objects
  }
  return { ...map, rooms }
}
