// Port of the map definition layout used by objMap / objDataMap / objRoom /
// objTileLayer (see docs/notes/engine-mechanics-walking-and-rooms.md §1).
import { isSymbol, parseLingo, type LingoValue } from './mr-lingo-plist'

export type Vec = { x: number; y: number }

export type LayerName = 'backgroundPassive' | 'backgroundActive' | 'objects'

export interface LayerDefinition {
  name: LayerName
  tileSet: string
}

/** rows[rowIndex][colIndex], 0-based arrays holding 1-based tile indices; 0 = empty */
export type TileGrid = number[][]

export interface RoomDefinition {
  num: number
  layers: Partial<Record<LayerName, TileGrid>>
}

export interface MapDefinition {
  mapSize: Vec
  roomSize: Vec
  startRoom: Vec
  layers: LayerDefinition[]
  rooms: RoomDefinition[]
}

export function roomNumToXY(num: number, mapSize: Vec): Vec {
  return { x: ((num - 1) % mapSize.x) + 1, y: Math.floor((num - 1) / mapSize.x) + 1 }
}

export function roomXYToNum(xy: Vec, mapSize: Vec): number {
  return (xy.y - 1) * mapSize.x + xy.x
}

export function parseMapFile(text: string): MapDefinition {
  const root = parseLingo(text)
  const map = prop(root, 'map')
  const mapSize = point(prop(map, 'mapSize'))
  const roomSize = point(prop(map, 'roomSize'))
  const startRoom = point(prop(map, 'startRoom'))
  const layers = list(prop(map, 'layerDefinitions')).map((l) => ({
    name: sym(prop(l, 'name')) as LayerName,
    tileSet: sym(prop(l, 'tileSet')),
  }))
  const rooms = list(prop(map, 'rooms')).map((r) => {
    const num = num_(prop(r, 'num'))
    const out: RoomDefinition = { num, layers: {} }
    for (const l of list(prop(r, 'layers'))) {
      const name = sym(prop(l, 'name')) as LayerName
      const grid = list(prop(l, 'map')).map((row) => list(row).map(num_))
      if (grid.length !== roomSize.y || grid.some((row) => row.length !== roomSize.x)) {
        throw new Error(`room ${num} layer ${name}: expected ${roomSize.x}x${roomSize.y} tiles`)
      }
      out.layers[name] = grid
    }
    return out
  })
  rooms.forEach((r, i) => {
    if (r.num !== i + 1) throw new Error(`rooms must be in order; found num ${r.num} at position ${i + 1}`)
  })
  return { mapSize, roomSize, startRoom, layers, rooms }
}

function prop(v: LingoValue, key: string): LingoValue {
  if (typeof v !== 'object' || v === null || Array.isArray(v) || !(key in v)) throw new Error(`missing #${key}`)
  return (v as { [k: string]: LingoValue })[key]!
}
function list(v: LingoValue): LingoValue[] {
  if (!Array.isArray(v)) throw new Error('expected list')
  return v
}
function num_(v: LingoValue): number {
  if (typeof v !== 'number') throw new Error('expected number')
  return v
}
function sym(v: LingoValue): string {
  if (!isSymbol(v)) throw new Error('expected symbol')
  return v.sym
}
function point(v: LingoValue): Vec {
  if (typeof v !== 'object' || v === null || !('x' in v)) throw new Error('expected point')
  return { x: (v as Vec).x, y: (v as Vec).y }
}
