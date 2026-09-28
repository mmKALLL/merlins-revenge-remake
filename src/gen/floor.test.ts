import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseTileKey } from '../mr-open/mr-tile-key'
import { EXIT_ROOM, FLOOR_SIZE, START_ROOM, floorIsConnected, generateFloor, roomKey, type GeneratedFloor } from './floor'
import { generateMap, isGeneratedMapId } from './generated-maps'
import { GOBLIN_FOREST } from './themes'

const key = (name: string) => parseTileKey(readFileSync(join(import.meta.dirname, '../../assets/tile-keys', `${name}.txt`), 'utf8'))
const active = key(GOBLIN_FOREST.tileSets.backgroundActive)
const objects = key(GOBLIN_FOREST.tileSets.objects)
const isSolid = (i: number) => active.isSolid(i)
const SEEDS = Array.from({ length: 500 }, (_, i) => i * 7919 + 1)
const floors = new Map<number, GeneratedFloor>(SEEDS.map((s) => [s, generateFloor(GOBLIN_FOREST, s)]))

const activeAt = (f: GeneratedFloor, room: { x: number; y: number }, x: number, y: number): number =>
  f.map.rooms[(room.y - 1) * FLOOR_SIZE.x + room.x - 1]!.layers.backgroundActive![y]![x]!

describe('random floor', () => {
  it('is the same map for the same seed', () => {
    expect(generateFloor(GOBLIN_FOREST, 1234)).toEqual(generateFloor(GOBLIN_FOREST, 1234))
    expect(generateMap('random/goblin-forest', 99)).toEqual(generateMap('random/goblin-forest', 99))
    expect(generateFloor(GOBLIN_FOREST, 1)).not.toEqual(generateFloor(GOBLIN_FOREST, 2))
  })

  it('connects the start to the exit and every unit, by the tile key', () => {
    for (const [seed, f] of floors) expect(floorIsConnected(f, isSolid), `seed ${seed}`).toBe(true)
  })

  it('opens every shared edge the same way on both sides, and keeps the opening clear', () => {
    for (const f of floors.values()) {
      for (let y = 1; y <= FLOOR_SIZE.y; y++) {
        for (let x = 1; x <= FLOOR_SIZE.x; x++) {
          const room = { x, y }
          const e = f.edges[roomKey(room)]!
          if (x < FLOOR_SIZE.x) expect(e.right).toEqual(f.edges[roomKey({ x: x + 1, y })]!.left)
          if (y < FLOOR_SIZE.y) expect(e.bottom).toEqual(f.edges[roomKey({ x, y: y + 1 })]!.top)
          if (x === 1) expect(e.left).toBeNull()
          if (y === 1) expect(e.top).toBeNull()
          if (x === FLOOR_SIZE.x) expect(e.right).toBeNull()
          if (y === FLOOR_SIZE.y) expect(e.bottom).toBeNull()
          if (e.right) for (let r = e.right.from; r <= e.right.to; r++) {
            expect(isSolid(activeAt(f, room, 17, r))).toBe(false)
            expect(isSolid(activeAt(f, { x: x + 1, y }, 0, r))).toBe(false)
          }
          if (e.bottom) for (let c = e.bottom.from; c <= e.bottom.to; c++) {
            expect(isSolid(activeAt(f, room, c, 8))).toBe(false)
            expect(isSolid(activeAt(f, { x, y: y + 1 }, c, 0))).toBe(false)
          }
        }
      }
    }
  })

  it('places units on open tiles away from the room edges, and nothing hostile in the start room', () => {
    for (const f of floors.values()) {
      for (const p of f.placements) {
        expect(isSolid(activeAt(f, p.room, p.tile.x, p.tile.y))).toBe(false)
        expect(p.tile.x).toBeGreaterThanOrEqual(2)
        expect(p.tile.y).toBeGreaterThanOrEqual(2)
        expect(p.tile.x).toBeLessThanOrEqual(15)
        expect(p.tile.y).toBeLessThanOrEqual(6)
        const symbol = objects.symbols[f.map.rooms[(p.room.y - 1) * FLOOR_SIZE.x + p.room.x - 1]!.layers.objects![p.tile.y]![p.tile.x]! - 1]
        expect(symbol).toBe(p.key)
      }
      const start = f.placements.filter((p) => p.room.x === START_ROOM.x && p.room.y === START_ROOM.y).map((p) => p.key)
      expect(start.sort()).toEqual([GOBLIN_FOREST.units.player, GOBLIN_FOREST.units.startMusic].sort())
      const exitUnits = f.placements.filter((p) => p.room.x === EXIT_ROOM.x && p.room.y === EXIT_ROOM.y)
      expect(exitUnits.some((p) => p.key !== GOBLIN_FOREST.units.exitMusic)).toBe(true)
    }
  })

  it('sets the start and exit corners on the map', () => {
    const map = floors.get(SEEDS[0]!)!.map
    expect(map.startRoom).toEqual(START_ROOM)
    expect(map.endRoom).toEqual(EXIT_ROOM)
    expect(map.rooms.map((r) => r.num)).toEqual(Array.from({ length: 16 }, (_, i) => i + 1))
    expect(isGeneratedMapId('random/goblin-forest')).toBe(true)
  })

  it('generates a floor well under 100 ms', () => {
    const started = performance.now()
    for (let s = 0; s < 20; s++) generateFloor(GOBLIN_FOREST, 5000 + s)
    expect((performance.now() - started) / 20).toBeLessThan(50)
  })
})

describe('Goblin Forest theme', () => {
  it('lays solid obstacles and walkable decoration, by the tile key', () => {
    const t = GOBLIN_FOREST
    const obstacles = [...t.wall, ...t.longWall, ...t.stumps, ...t.materials.flatMap((m) => m.tiles)]
    for (const o of obstacles) expect(active.isSolid(o.value), `tile ${o.value}`).toBe(true)
    for (const d of t.decorations) expect(active.isSolid(d.value), `tile ${d.value}`).toBe(false)
  })

  it('names object tiles by their key symbols', () => {
    for (const [symbol, index] of Object.entries(GOBLIN_FOREST.objectTiles)) expect(objects.symbols[index - 1]).toBe(symbol)
  })
})
