import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseMapFile, roomNumToXY, roomXYToNum } from './mr-map-format'

const tvsDemo = readFileSync('assets/maps/tvsDemo.txt', 'utf8')
const sam = readFileSync('assets/maps/sam.txt', 'utf8')

describe('roomNumToXY', () => {
  it('maps 1-based room numbers row-major', () => {
    expect(roomNumToXY(1, { x: 4, y: 1 })).toEqual({ x: 1, y: 1 })
    expect(roomNumToXY(4, { x: 4, y: 1 })).toEqual({ x: 4, y: 1 })
    expect(roomNumToXY(5, { x: 3, y: 3 })).toEqual({ x: 2, y: 2 })
    expect(roomXYToNum({ x: 2, y: 2 }, { x: 3, y: 3 })).toBe(5)
  })
})

describe('parseMapFile', () => {
  it('reads the header of tvsDemo', () => {
    const m = parseMapFile(tvsDemo)
    expect(m.mapSize).toEqual({ x: 4, y: 1 })
    expect(m.roomSize).toEqual({ x: 18, y: 9 })
    expect(m.startRoom).toEqual({ x: 1, y: 1 })
    expect(m.layers.map((l) => l.name)).toEqual(['backgroundPassive', 'backgroundActive', 'objects'])
    expect(m.layers[1]!.tileSet).toBe('merlinOpenActive')
  })

  it('reads rooms as row-major 1-based grids', () => {
    const m = parseMapFile(tvsDemo)
    expect(m.rooms).toHaveLength(4)
    const r1 = m.rooms[0]!
    expect(r1.num).toBe(1)
    const active = r1.layers['backgroundActive']!
    expect(active).toHaveLength(9)
    expect(active[0]).toHaveLength(18)
    // row 2, col 3 of the active layer is tile 2 (see tvsDemo.txt)
    expect(active[1]![2]).toBe(2)
  })

  it('reads a 3x3 map', () => {
    const m = parseMapFile(sam)
    expect(m.mapSize).toEqual({ x: 3, y: 3 })
    expect(m.rooms.map((r) => r.num)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
  })

  it('rejects a room whose layer has the wrong size', () => {
    const bad = '[#map: [#mapSize: point(1,1), #roomSize: point(2,1), #startRoom: point(1,1), #layerDefinitions: [[#name: #backgroundActive, #tileSet: #t, #displayScale: 1]], #rooms: [[#num: 1, #layers: [[#name: #backgroundActive, #map: [[1, 2, 3]]]]]]]]'
    expect(() => parseMapFile(bad)).toThrow(/room 1.*backgroundActive/)
  })
})
