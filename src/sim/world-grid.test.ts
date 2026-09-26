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
})
