// Port of the map definition layout used by objMap / objDataMap / objRoom /
// objTileLayer (see docs/notes/engine-mechanics-walking-and-rooms.md §1).
import { isSymbol, parseLingo, type LingoValue } from './mr-lingo-plist'

import type { Vec } from './mr-geometry'

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
  /** objMap.pEndRoom: clearing this room completes the map (gameMaster.teamDied); absent = #none */
  endRoom?: Vec
  layers: LayerDefinition[]
  rooms: RoomDefinition[]
}

export function roomNumToXY(num: number, mapSize: Vec): Vec {
  return { x: ((num - 1) % mapSize.x) + 1, y: Math.floor((num - 1) / mapSize.x) + 1 }
}

export function roomXYToNum(xy: Vec, mapSize: Vec): number {
  return (xy.y - 1) * mapSize.x + xy.x
}

const LAYER_NAMES: readonly LayerName[] = ['backgroundPassive', 'backgroundActive', 'objects']

export function parseMapFile(text: string): MapDefinition {
  const root = parseLingo(text)
  const map = getProp(root, 'map')
  const mapSize = asPoint(getProp(map, 'mapSize'))
  const roomSize = asPoint(getProp(map, 'roomSize'))
  const startRoom = asPoint(getProp(map, 'startRoom'))
  const endRoom = optionalPoint(map, 'endRoom')
  const layers = asList(getProp(map, 'layerDefinitions')).map((l) => ({
    name: asLayerName(asSymbol(getProp(l, 'name'))),
    tileSet: asSymbol(getProp(l, 'tileSet')),
  }))
  const roomCount = mapSize.x * mapSize.y
  const roomValues = asList(getProp(map, 'rooms'))
  if (roomValues.length > roomCount) {
    throw new Error(`map has ${roomValues.length} rooms but mapSize ${mapSize.x}x${mapSize.y} allows ${roomCount}`)
  }
  const rooms = roomValues.map((r, i) => parseRoom(r, i + 1, roomSize))
  rooms.forEach((r, i) => {
    if (r.num !== i + 1) throw new Error(`rooms must be in order; found num ${r.num} at position ${i + 1}`)
  })
  // The original engine fills rooms missing from the file with empty rooms.
  for (let num = rooms.length + 1; num <= roomCount; num++) {
    const empty: RoomDefinition = { num, layers: {} }
    for (const l of layers) empty.layers[l.name] = emptyGrid(roomSize)
    rooms.push(empty)
  }
  return { mapSize, roomSize, startRoom, ...(endRoom ? { endRoom } : {}), layers, rooms }
}

function parseRoom(r: LingoValue, position: number, roomSize: Vec): RoomDefinition {
  let num = position
  let layerName = ''
  try {
    num = asNumber(getProp(r, 'num'))
    const out: RoomDefinition = { num, layers: {} }
    for (const l of asList(getProp(r, 'layers'))) {
      layerName = asSymbol(getProp(l, 'name'))
      const name = asLayerName(layerName)
      const grid = asList(getProp(l, 'map')).map((row) => asList(row).map(asNumber))
      if (grid.length !== roomSize.y || grid.some((row) => row.length !== roomSize.x)) {
        throw new Error(`expected ${roomSize.x}x${roomSize.y} tiles`)
      }
      out.layers[name] = grid
    }
    layerName = ''
    if (!out.layers.backgroundActive) throw new Error('missing backgroundActive layer')
    return out
  } catch (err) {
    const where = layerName ? `room ${num} layer ${layerName}` : `room ${num}`
    throw new Error(`${where}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

function emptyGrid(roomSize: Vec): TileGrid {
  return Array.from({ length: roomSize.y }, () => new Array<number>(roomSize.x).fill(0))
}

function asLayerName(name: string): LayerName {
  if (!(LAYER_NAMES as readonly string[]).includes(name)) {
    throw new Error(`unknown layer name #${name} (expected one of ${LAYER_NAMES.join(', ')})`)
  }
  return name as LayerName
}

function getProp(v: LingoValue, key: string): LingoValue {
  if (typeof v !== 'object' || v === null || Array.isArray(v) || !Object.hasOwn(v, key)) throw new Error(`missing #${key}`)
  return (v as { [k: string]: LingoValue })[key]!
}
function asList(v: LingoValue): LingoValue[] {
  if (!Array.isArray(v)) throw new Error('expected list')
  return v
}
function asNumber(v: LingoValue): number {
  if (typeof v !== 'number') throw new Error('expected number')
  return v
}
function asSymbol(v: LingoValue): string {
  if (!isSymbol(v)) throw new Error('expected symbol')
  return v.sym
}
/** A point property that may be missing or #none (objMap.init: `if pDefinition[#endRoom] <> void`). */
function optionalPoint(v: LingoValue, key: string): Vec | undefined {
  if (typeof v !== 'object' || v === null || Array.isArray(v) || !Object.hasOwn(v, key)) return undefined
  const p = (v as { [k: string]: LingoValue })[key]!
  return isSymbol(p) ? undefined : asPoint(p)
}
function asPoint(v: LingoValue): Vec {
  if (typeof v !== 'object' || v === null || !('x' in v)) throw new Error('expected point')
  return { x: (v as Vec).x, y: (v as Vec).y }
}
