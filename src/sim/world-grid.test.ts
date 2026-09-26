import { describe, expect, it } from 'vitest'
import type { MapDefinition } from '../mr-open/mr-map-format'
import { buildWorldGrid } from './world-grid'

function tinyMap(): MapDefinition {
  // 2x1 rooms of 3x2 tiles. tile 1 = open, tile 2 = solid
  const room = (grid: number[][]) => ({ num: 0, layers: { backgroundActive: grid, backgroundPassive: grid.map((r) => r.map(() => 1)) } })
  const r1 = room([[1, 2, 1], [1, 1, 1]]); r1.num = 1
  const r2 = room([[1, 1, 1], [2, 1, 2]]); r2.num = 2
  return {
    mapSize: { x: 2, y: 1 }, roomSize: { x: 3, y: 2 }, startRoom: { x: 1, y: 1 },
    layers: [{ name: 'backgroundPassive', tileSet: 'p' }, { name: 'backgroundActive', tileSet: 'a' }],
    rooms: [r1, r2],
  }
}
const isSolid = (i: number) => i === 2

function fullSizeMap(): MapDefinition {
  // 2x1 rooms of the original 18x9 tile size, all open
  const grid = () => Array.from({ length: 9 }, () => Array.from({ length: 18 }, () => 1))
  const room = (num: number) => ({ num, layers: { backgroundActive: grid(), backgroundPassive: grid() } })
  return {
    mapSize: { x: 2, y: 1 }, roomSize: { x: 18, y: 9 }, startRoom: { x: 1, y: 1 },
    layers: [{ name: 'backgroundPassive', tileSet: 'p' }, { name: 'backgroundActive', tileSet: 'a' }],
    rooms: [room(1), room(2)],
  }
}

describe('buildWorldGrid', () => {
  it('has the combined size of all rooms', () => {
    const g = buildWorldGrid(tinyMap(), isSolid)
    expect(g.widthTiles).toBe(6)
    expect(g.heightTiles).toBe(2)
  })

  it('looks up tiles by 1-based world tile coordinates', () => {
    const g = buildWorldGrid(tinyMap(), isSolid)
    expect(g.tileAt('backgroundActive', 2, 1)).toBe(2)
    expect(g.tileAt('backgroundActive', 4, 2)).toBe(2) // room 2, col 1, row 2
    expect(g.tileAt('backgroundActive', 5, 2)).toBe(1)
  })

  it('reports solidity and treats outside as solid', () => {
    const g = buildWorldGrid(tinyMap(), isSolid)
    expect(g.solidAt(2, 1)).toBe(true)
    expect(g.solidAt(1, 1)).toBe(false)
    expect(g.solidAt(0, 1)).toBe(true)
    expect(g.solidAt(7, 1)).toBe(true)
    expect(g.solidAt(3, 3)).toBe(true)
  })

  it('converts between rooms and world tiles', () => {
    const g = buildWorldGrid(tinyMap(), isSolid)
    expect(g.roomOfTile(4, 1)).toEqual({ x: 2, y: 1 })
    expect(g.roomRectPx({ x: 2, y: 1 })).toEqual({ left: 96, top: 0, right: 192, bottom: 64 })
  })

  it('maps pixel points to rooms at the 18x9 room boundaries', () => {
    const g = buildWorldGrid(fullSizeMap(), isSolid)
    expect(g.roomOfPoint(575, 0)).toEqual({ x: 1, y: 1 })
    expect(g.roomOfPoint(576, 0)).toEqual({ x: 2, y: 1 })
    expect(g.roomOfPoint(-1, 0)).toEqual({ x: 0, y: 1 })
  })

  it('reports whether a room exists on the map', () => {
    const g = buildWorldGrid(fullSizeMap(), isSolid)
    expect(g.roomExists({ x: 1, y: 1 })).toBe(true)
    expect(g.roomExists({ x: 2, y: 1 })).toBe(true)
    expect(g.roomExists({ x: 0, y: 1 })).toBe(false)
    expect(g.roomExists({ x: 3, y: 1 })).toBe(false)
    expect(g.roomExists({ x: 1, y: 2 })).toBe(false)
  })

  it('throws when a room number is outside the map', () => {
    const map = tinyMap()
    map.rooms[1]!.num = 3
    expect(() => buildWorldGrid(map, isSolid)).toThrow(/3/)
    map.rooms[1]!.num = 0
    expect(() => buildWorldGrid(map, isSolid)).toThrow(/0/)
  })
})
