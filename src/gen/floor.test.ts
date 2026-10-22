import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Vec } from '../mr-open/mr-geometry'
import { parseTileKey } from '../mr-open/mr-tile-key'
import { BOSS_TILE, ROOM_SIZE, cornerRoom, exitRoom, floorIsConnected, generateFloor, roomKey, startRoom, type GeneratedFloor } from './floor'
import { edgeMismatches } from './edge-check'
import { GENERATED_MAPS, floorMapId, generateMap, isGeneratedMapId } from './generated-maps'
import { THEMES } from './themes'

const key = (name: string) => parseTileKey(readFileSync(join(import.meta.dirname, '../../assets/tile-keys', `${name}.txt`), 'utf8'))
const SEEDS = Array.from({ length: 500 }, (_, i) => i * 7919 + 1)
const sameRoom = (a: Vec, b: Vec) => a.x === b.x && a.y === b.y

describe.each(THEMES)('random floor: $name', (theme) => {
  const active = key(theme.tileSets.backgroundActive)
  const objects = key(theme.tileSets.objects)
  const isSolid = (i: number) => active.isSolid(i)
  const size = theme.floorSize
  const floors = new Map<number, GeneratedFloor>(SEEDS.map((s) => [s, generateFloor(theme, s)]))
  const roomOf = (f: GeneratedFloor, room: Vec) => f.map.rooms[(room.y - 1) * size.x + room.x - 1]!
  const activeAt = (f: GeneratedFloor, room: Vec, x: number, y: number): number => roomOf(f, room).layers.backgroundActive![y]![x]!

  it('is the same map for the same seed', () => {
    expect(generateFloor(theme, 1234)).toEqual(generateFloor(theme, 1234))
    expect(generateMap(floorMapId(theme), 99)).toEqual(generateMap(floorMapId(theme), 99))
    expect(generateFloor(theme, 1)).not.toEqual(generateFloor(theme, 2))
  })

  it('connects the start to the exit and every unit, by the tile key', () => {
    for (const [seed, f] of floors) expect(floorIsConnected(f, isSolid), `seed ${seed}`).toBe(true)
  })

  it('opens every shared edge the same way on both sides, and keeps the opening clear', () => {
    const last = { x: ROOM_SIZE.x - 1, y: ROOM_SIZE.y - 1 }
    for (const f of floors.values()) {
      for (let y = 1; y <= size.y; y++) {
        for (let x = 1; x <= size.x; x++) {
          const room = { x, y }
          const e = f.edges[roomKey(room)]!
          if (x < size.x) expect(e.right).toEqual(f.edges[roomKey({ x: x + 1, y })]!.left)
          if (y < size.y) expect(e.bottom).toEqual(f.edges[roomKey({ x, y: y + 1 })]!.top)
          if (x === 1) expect(e.left).toBeNull()
          if (y === 1) expect(e.top).toBeNull()
          if (x === size.x) expect(e.right).toBeNull()
          if (y === size.y) expect(e.bottom).toBeNull()
          if (e.right) for (let r = e.right.from; r <= e.right.to; r++) {
            expect(isSolid(activeAt(f, room, last.x, r))).toBe(false)
            expect(isSolid(activeAt(f, { x: x + 1, y }, 0, r))).toBe(false)
          }
          if (e.bottom) for (let c = e.bottom.from; c <= e.bottom.to; c++) {
            expect(isSolid(activeAt(f, room, c, last.y))).toBe(false)
            expect(isSolid(activeAt(f, { x, y: y + 1 }, c, 0))).toBe(false)
          }
        }
      }
    }
  })

  it('blocks facing edge tiles together and leaves entrances at least 3 wide', () => {
    for (const [seed, f] of [...floors].slice(0, 50)) expect(edgeMismatches(f.map, isSolid), `seed ${seed}`).toEqual([])
  })

  it('places units on open tiles away from the room edges, and nothing hostile in the start room', () => {
    for (const f of floors.values()) {
      for (const p of f.placements) {
        expect(isSolid(activeAt(f, p.room, p.tile.x, p.tile.y))).toBe(false)
        expect(p.tile.x).toBeGreaterThanOrEqual(2)
        expect(p.tile.y).toBeGreaterThanOrEqual(2)
        expect(p.tile.x).toBeLessThanOrEqual(ROOM_SIZE.x - 3)
        expect(p.tile.y).toBeLessThanOrEqual(ROOM_SIZE.y - 3)
        expect(objects.symbols[roomOf(f, p.room).layers.objects![p.tile.y]![p.tile.x]! - 1]).toBe(p.key)
      }
      const start = f.placements.filter((p) => sameRoom(p.room, startRoom(size))).map((p) => p.key)
      expect(start.sort()).toEqual([theme.units.player, theme.units.startMusic].sort())
      const exitUnits = f.placements.filter((p) => sameRoom(p.room, exitRoom(size)))
      expect(exitUnits.some((p) => p.key !== theme.units.exitMusic)).toBe(true)
    }
  })

  it('keeps each room to one faction, so rival teams do not brawl', () => {
    const factionOf = new Map<string, string>()
    for (const c of [...theme.units.enemies, ...theme.units.dwellings]) if (c.faction) factionOf.set(c.key, c.faction)
    for (const f of floors.values()) {
      const perRoom = new Map<string, Set<string>>()
      for (const p of f.placements) {
        const faction = factionOf.get(p.key)
        if (!faction) continue
        const set = perRoom.get(roomKey(p.room)) ?? new Set<string>()
        set.add(faction)
        perRoom.set(roomKey(p.room), set)
      }
      for (const set of perRoom.values()) expect(set.size).toBe(1)
    }
  })

  it('puts a corner group into each special corner room, and a boss group into the exit room', () => {
    const f = floors.get(SEEDS[0]!)!
    const keysIn = (room: Vec) => new Set(f.placements.filter((p) => sameRoom(p.room, room)).map((p) => p.key))
    for (const special of theme.units.specialRooms) {
      const keys = keysIn(cornerRoom(size, special.corner))
      expect(special.groups.some((g) => Object.keys(g.units).every((k) => keys.has(k))), special.corner).toBe(true)
    }
    const exit = exitRoom(size)
    const keys = keysIn(exit)
    const boss = f.placements.find((p) => sameRoom(p.room, exit) && sameRoom(p.tile, BOSS_TILE))
    expect(theme.units.bosses.some((g) => g.boss === boss?.key && Object.keys(g.units).every((k) => keys.has(k)))).toBe(true)
  })

  it('sets the start and exit corners on the map', () => {
    const map = floors.get(SEEDS[0]!)!.map
    expect(map.mapSize).toEqual(size)
    expect(map.startRoom).toEqual(startRoom(size))
    expect(map.endRoom).toEqual(exitRoom(size))
    expect(map.rooms.map((r) => r.num)).toEqual(Array.from({ length: size.x * size.y }, (_, i) => i + 1))
    expect(map.layers.map((l) => l.tileSet)).toEqual(Object.values(theme.tileSets))
    expect(isGeneratedMapId(floorMapId(theme))).toBe(true)
  })

  it('generates a floor well under 100 ms', () => {
    const started = performance.now()
    for (let s = 0; s < 20; s++) generateFloor(theme, 5000 + s)
    expect((performance.now() - started) / 20).toBeLessThan(50)
  })

  it('lays solid obstacles and walkable decoration, by the tile key', () => {
    const obstacles = [...theme.wall, ...theme.longWall, ...theme.stumps, ...theme.materials.flatMap((m) => m.tiles)]
    for (const o of obstacles) expect(active.isSolid(o.value), `tile ${o.value}`).toBe(true)
    for (const d of theme.decorations) expect(active.isSolid(d.value), `tile ${d.value}`).toBe(false)
  })

  it('names object tiles by their key symbols, for every unit it can place', () => {
    for (const [symbol, index] of Object.entries(theme.objectTiles)) expect(objects.symbols[index - 1]).toBe(symbol)
    const u = theme.units
    const keys = [u.player, u.startMusic, u.exitMusic, ...u.enemies.map((c) => c.key), ...u.dwellings.map((c) => c.key),
      ...[...u.specialRooms.flatMap((s) => s.groups), ...u.bosses].flatMap((g) => Object.keys(g.units))]
    for (const k of keys) expect(theme.objectTiles[k], k).toBeDefined()
  })
})

describe('generated map ids', () => {
  it('lists one map per theme under random/, numbered by difficulty, then the tower', () => {
    expect(GENERATED_MAPS.map((m) => m.id)).toEqual([
      'random/1-goblin-forest', 'random/2-undead-marsh', 'random/3-dragon-canyon', 'random/4-magic-maze', 'random/sorcerers-tower',
    ])
    expect(isGeneratedMapId('random/nowhere')).toBe(false)
  })
})
