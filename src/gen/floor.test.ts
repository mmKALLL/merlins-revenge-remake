import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Vec } from '../mr-open/mr-geometry'
import { parseTileKey } from '../mr-open/mr-tile-key'
import { pageDefs, pageTeams } from '../debug/snapshot-test-data'
import { BOSS_TILE, ROOM_SIZE, budgetCost, budgetEnergy, cornerRoom, drawToBudget, energyLookup, exitRoom, floorIsConnected, generateFloor, planCell, potionTiles, producerKeys as producerKeysOf, roomKey, startRoom, type GeneratedFloor } from './floor'
import { edgeMismatches } from './edge-check'
import { TOWER_FLOORS } from './tower'
import { GENERATED_MAPS, currentMapId, floorMapId, generateMap, isGeneratedMapId } from './generated-maps'
import { GOLDEN_FORT, MAGIC_MAZE, SPELL_SCROLLS, THEMES, TOWER_THEMES, type DrawSpec, type FloorTheme, type TierDraw, type UnitGroup } from './themes'

const key = (name: string) => parseTileKey(readFileSync(join(import.meta.dirname, '../../assets/tile-keys', `${name}.txt`), 'utf8'))
/** the page's resolved actor data, so a unit without a definition fails here */
const energyOf = energyLookup(pageDefs)
const SEEDS = Array.from({ length: 500 }, (_, i) => i * 7919 + 1)
const sameRoom = (a: Vec, b: Vec) => a.x === b.x && a.y === b.y

/** Every room of a theme's floor with its plan cell, and which half of the floor it is in (across the start-exit diagonal). */
const planRooms = (theme: FloorTheme) => theme.units.roomPlan.flatMap((row, r) => row.map((cell, c) => ({
  room: { x: c + 1, y: r + 1 },
  cell,
  half: r + c < row.length - 1 ? 'topLeft' : r + c > row.length - 1 ? 'bottomRight' : 'diagonal',
})))
/** Where each theme's generators gather (the owner's plan, flipped for the marsh and the maze). */
const GENERATOR_HALF: Record<string, 'topLeft' | 'bottomRight'> = {
  'goblin-forest': 'topLeft', 'undead-marsh': 'topLeft', 'dragon-canyon': 'topLeft', 'magic-maze': 'topLeft',
}
const drawsOf = (spec: DrawSpec | undefined): TierDraw[] => (spec === undefined ? [] : Array.isArray(spec) ? spec.map((o) => o.value) : [spec])

describe.each(THEMES)('random floor: $name', (theme) => {
  const active = key(theme.tileSets.backgroundActive)
  const objects = key(theme.tileSets.objects)
  const isSolid = (i: number) => active.isSolid(i)
  const size = theme.floorSize
  const floors = new Map<number, GeneratedFloor>(SEEDS.map((s) => [s, generateFloor(theme, s, energyOf)]))
  const roomOf = (f: GeneratedFloor, room: Vec) => f.map.rooms[(room.y - 1) * size.x + room.x - 1]!
  const activeAt = (f: GeneratedFloor, room: Vec, x: number, y: number): number => roomOf(f, room).layers.backgroundActive![y]![x]!
  const rewards = theme.units.startRewards
  const groupRooms = planRooms(theme).filter(({ cell }) => cell.groups).map(({ room, cell }): [Vec, UnitGroup[]] => [room, cell.groups!])
  const hasMidboss = planRooms(theme).some(({ cell }) => cell.kind === 'midboss')
  /** Tiles a unit could take in a room: open (no active tile) and two tiles off every edge. */
  const freeUnitTiles = (f: GeneratedFloor, room: Vec): number => {
    let n = 0
    for (let y = 2; y <= ROOM_SIZE.y - 3; y++) for (let x = 2; x <= ROOM_SIZE.x - 3; x++) if (activeAt(f, room, x, y) === 0) n++
    return n
  }
  const rewardKeys = new Set(['medikit', ...rewards.potions.map((p) => p.value), ...rewards.spellScrolls.map((s) => s.value), ...rewards.extras])

  it('is the same map for the same seed', () => {
    expect(generateFloor(theme, 1234, energyOf)).toEqual(generateFloor(theme, 1234, energyOf))
    expect(generateMap(floorMapId(theme), 99, energyOf)).toEqual(generateMap(floorMapId(theme), 99, energyOf))
    expect(generateFloor(theme, 1, energyOf)).not.toEqual(generateFloor(theme, 2, energyOf))
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
      expect(start.filter((k) => !rewardKeys.has(k)).sort()).toEqual([theme.units.player, theme.units.startMusic].sort())
      const exitUnits = f.placements.filter((p) => sameRoom(p.room, exitRoom(size)))
      expect(exitUnits.some((p) => p.key !== theme.units.exitMusic)).toBe(true)
    }
  })

  it('keeps each room to one faction (or alliance), except a share of normal rooms that mix rival teams', () => {
    const factionOf = new Map<string, string>()
    for (const c of [...theme.units.enemies, ...theme.units.dwellings]) if (c.faction) factionOf.set(c.key, c.faction)
    const alliances = theme.units.alliances
    let normalRooms = 0
    let mixedRooms = 0
    for (const f of floors.values()) {
      const perRoom = new Map<string, Set<string>>()
      for (const p of f.placements) {
        const faction = factionOf.get(p.key)
        if (!faction) continue
        const set = perRoom.get(roomKey(p.room)) ?? new Set<string>()
        set.add(faction)
        perRoom.set(roomKey(p.room), set)
      }
      for (const [key, set] of perRoom) {
        const [x, y] = key.split(',').map(Number)
        const normal = planCell(theme.units.roomPlan, { x: x!, y: y! }).kind === 'normal'
        if (normal) normalRooms++
        if (alliances) expect(alliances.some((a) => [...set].every((f) => a.factions.includes(f))), [...set].join(' ')).toBe(true)
        else if (set.size > 1) {
          expect(normal, `${key}: ${[...set].join(' ')}`).toBe(true) // never a midboss or boss room
          mixedRooms++
        }
      }
    }
    // the mixed roll is mixedFactionChance; a mixed room can still draw from one faction only
    if (!alliances && normalRooms > 0) expect(mixedRooms / normalRooms).toBeLessThan(theme.units.mixedFactionChance * 1.5 + 0.02)
  })

  it('never puts teams that hate each other into one room, outside the mixed normal rooms (assets/teams)', () => {
    const hates = (a: string, b: string) => pageTeams[a]!.hates.flat().includes(b)
    for (const [seed, f] of [...floors].slice(0, 200)) {
      const teams = new Map<string, Set<string>>()
      for (const p of f.placements) {
        const team = pageDefs[p.key]?.team
        if (!team || pageTeams[team]?.category !== 'enemies') continue
        const set = teams.get(roomKey(p.room)) ?? new Set<string>()
        set.add(team)
        teams.set(roomKey(p.room), set)
      }
      for (const [room, set] of teams) {
        const [x, y] = room.split(',').map(Number)
        if (theme.units.mixedFactionChance > 0 && planCell(theme.units.roomPlan, { x: x!, y: y! }).kind === 'normal') continue
        for (const a of set) for (const b of set) expect(hates(a, b), `seed ${seed} room ${room}: ${a} hates ${b}`).toBe(false)
      }
    }
  })

  it('puts a corner group into each special corner room, and a boss group into the exit room', () => {
    const f = floors.get(SEEDS[0]!)!
    const keysIn = (room: Vec) => new Set(f.placements.filter((p) => sameRoom(p.room, room)).map((p) => p.key))
    for (const [room, groups] of groupRooms) {
      const keys = keysIn(room)
      expect(groups.some((g) => Object.keys(g.units).every((k) => keys.has(k))), roomKey(room)).toBe(true)
    }
    const exit = exitRoom(size)
    const keys = keysIn(exit)
    const boss = f.placements.find((p) => sameRoom(p.room, exit) && sameRoom(p.tile, BOSS_TILE))
    expect(theme.units.bosses.some((g) => g.boss === boss?.key && Object.keys(g.units).every((k) => keys.has(k)))).toBe(true)
  })

  it('leaves a room with an `alone` group to that group (and its potions)', () => {
    const u = theme.units
    const potionKeys = new Set(u.potions.map((p) => p.value))
    const music = new Set([u.startMusic, u.exitMusic])
    const rooms: [Vec, UnitGroup[]][] = [...groupRooms, [exitRoom(size), u.bosses]]
    const countsOf = (keys: string[]) => {
      const counts = new Map<string, number>()
      for (const k of keys) counts.set(k, (counts.get(k) ?? 0) + 1)
      return JSON.stringify([...counts].sort())
    }
    const groupCounts = (g: UnitGroup) => JSON.stringify(Object.entries(g.units).sort())
    for (const f of floors.values()) {
      for (const [room, groups] of rooms) {
        const units = f.placements.filter((p) => sameRoom(p.room, room) && !potionKeys.has(p.key) && !music.has(p.key)).map((p) => p.key)
        // either exactly an alone group, or a group with company
        const alone = groups.some((g) => g.alone && groupCounts(g) === countsOf(units))
        const accompanied = groups.some((g) => !g.alone && Object.keys(g.units).every((k) => units.includes(k)))
        expect(alone || accompanied, `${roomKey(room)}: ${units.join(' ')}`).toBe(true)
      }
    }
  })

  describe('room plan', () => {
    const u = theme.units
    const planned: FloorTheme = { ...theme, units: { ...u, wildcardChance: 0 } }
    const planFloors = SEEDS.slice(0, 200).map((s) => generateFloor(planned, s, energyOf))
    const tierOf = new Map([...u.enemies, ...u.dwellings].map((c) => [c.key, c.tier]))
    const producerKeys = new Set([...u.dwellings, ...u.enemies.filter((c) => c.producer)].map((c) => c.key))
    const unitsIn = (f: GeneratedFloor, room: Vec) => f.placements.filter((p) => sameRoom(p.room, room) && tierOf.has(p.key)).map((p) => p.key)

    it.skipIf(!hasMidboss)('has one midboss corner, and at least two groups in each side corner', () => {
      expect(planRooms(theme).filter(({ cell }) => cell.kind === 'midboss')).toHaveLength(1)
      for (const corner of ['farX', 'farY'] as const) expect(planCell(u.roomPlan, cornerRoom(size, corner)).groups?.length, corner).toBeGreaterThanOrEqual(2)
    })

    it("draws each room without groups within its cell's counts and tiers", () => {
      const plain = planRooms(theme).filter(({ cell }) => cell.kind === 'normal' && !cell.groups)
      // the room's draws for these units (regulars and extras both draw regular enemies) add up
      const check = (units: string[], specs: (DrawSpec | undefined)[], label: string) => {
        const each = specs.map(drawsOf)
        const tiers = new Set(each.flat().flatMap((d) => Object.keys(d.tiers)))
        const most = each.reduce((sum, draws) => sum + Math.max(0, ...draws.map((d) => d.count[1])), 0)
        const least = each.reduce((sum, draws) => sum + (draws.length > 0 ? Math.min(...draws.map((d) => d.count[0])) : 0), 0)
        expect(units.length, label).toBeLessThanOrEqual(most)
        for (const k of units) expect(tiers.has(tierOf.get(k)!), `${label}: ${k}`).toBe(true)
        return units.length >= least
      }
      for (const { room, cell } of plain) {
        let filled = 0
        for (const f of planFloors) {
          const units = unitsIn(f, room)
          const producersOk = cell.mixed || check(units.filter((k) => producerKeys.has(k)), [cell.producers], `${roomKey(room)} producers`)
          const regularsOk = cell.mixed ? check(units, [cell.mixed], `${roomKey(room)} mixed`)
            : check(units.filter((k) => !producerKeys.has(k)), [cell.regulars, cell.extras], `${roomKey(room)} regulars`)
          if (producersOk && regularsOk) filled++
        }
        // draws can fall short (faction, maxPerRoom, free tiles), but not usually
        expect(filled, roomKey(room)).toBeGreaterThan(planFloors.length / 2)
      }
    })

    it.skipIf(!GENERATOR_HALF[theme.id])('keeps generators out of the regular-enemy half: at most one per room there', () => {
      const regularHalf = GENERATOR_HALF[theme.id] === 'topLeft' ? 'bottomRight' : 'topLeft'
      for (const { room } of planRooms(theme).filter((r) => r.half === regularHalf)) {
        for (const f of planFloors) expect(unitsIn(f, room).filter((k) => producerKeys.has(k)).length, roomKey(room)).toBeLessThanOrEqual(1)
      }
    })

    it('fills a budget room, group included, to its budget within its counts, unless its free tiles run out', () => {
      const budgeted = planRooms(theme).flatMap(({ room, cell }) => [cell.regulars, cell.mixed].flatMap(drawsOf).filter((d) => d.hpBudget).map((d) => ({ room, draw: d })))
      const notUnits = new Set([...u.potions.map((p) => p.value), u.startMusic, u.exitMusic])
      const aloneGroups = u.bosses.filter((g) => g.alone).map((g) => JSON.stringify(Object.entries(g.units).sort()))
      const countsOf = (keys: string[]) => JSON.stringify(Object.entries(Object.fromEntries(keys.map((k) => [k, keys.filter((x) => x === k).length]))).sort())
      for (const { room, draw } of budgeted) {
        const budget = draw.hpBudget!
        const costOf = budgetCost(budget, producerKeysOf(u), energyOf)
        const reserved = [...potionTiles(size, room), ...(sameRoom(room, exitRoom(size)) ? [BOSS_TILE] : [])]
        for (const f of planFloors) {
          const placed = f.placements.filter((p) => sameRoom(p.room, room) && !notUnits.has(p.key))
          const units = placed.map((p) => p.key)
          if (aloneGroups.includes(countsOf(units))) continue
          const cost = units.reduce((sum, k) => sum + costOf(k), 0)
          expect(units.length, roomKey(room)).toBeGreaterThanOrEqual(draw.count[0])
          expect(units.length, roomKey(room)).toBeLessThanOrEqual(draw.count[1])
          const onFreeTiles = f.placements.filter((p) => sameRoom(p.room, room) && !reserved.some((r) => sameRoom(r, p.tile))).length
          const full = onFreeTiles >= freeUnitTiles(f, room) - reserved.length
          if (!full && units.length < draw.count[1]) expect(cost, `${roomKey(room)}: ${units.join(' ')}`).toBeGreaterThanOrEqual(budgetEnergy(budget, theme.level))
          if (budget.capped) expect(cost, `${roomKey(room)}: ${units.join(' ')}`).toBeLessThanOrEqual(budgetEnergy(budget, theme.level) + (budget.spread ?? 0))
        }
      }
    })
  })

  it('puts two potions near the outer corner of each side corner room, and none elsewhere', () => {
    const outerCorner = { farX: { x: ROOM_SIZE.x - 1, y: ROOM_SIZE.y - 1 }, farY: { x: 0, y: 0 } }
    const potionKeys = new Set(theme.units.potions.map((p) => p.value))
    for (const f of floors.values()) {
      for (const corner of ['farX', 'farY'] as const) {
        const room = cornerRoom(size, corner)
        const potions = f.placements.filter((p) => sameRoom(p.room, room) && potionKeys.has(p.key))
        expect(potions.map((p) => p.tile)).toEqual(potionTiles(size, room))
        for (const p of potions) {
          const fromCorner = Math.max(Math.abs(p.tile.x - outerCorner[corner].x), Math.abs(p.tile.y - outerCorner[corner].y))
          expect(fromCorner).toBeLessThanOrEqual(3)
        }
      }
      expect(f.placements.filter((p) => potionKeys.has(p.key) && !sameRoom(p.room, startRoom(size)))).toHaveLength(4)
    }
  })

  it('gives the start rewards in the start room, off the player tile and connected to it', () => {
    const potionKeys = new Set(rewards.potions.map((p) => p.value))
    const scrollKeys = new Set(rewards.spellScrolls.map((s) => s.value))
    for (const [seed, f] of floors) {
      const inStart = f.placements.filter((p) => sameRoom(p.room, startRoom(size)))
      const player = inStart.find((p) => p.key === theme.units.player)!
      const given = inStart.filter((p) => rewardKeys.has(p.key))
      expect(given.filter((p) => potionKeys.has(p.key)), `seed ${seed}`).toHaveLength(rewards.potionCount)
      expect(given.filter((p) => p.key === 'medikit')).toHaveLength(rewards.medikits)
      expect(given.filter((p) => scrollKeys.has(p.key))).toHaveLength(1)
      for (const extra of rewards.extras) expect(given.some((p) => p.key === extra)).toBe(true)
      for (const p of given) expect(sameRoom(p.tile, player.tile)).toBe(false)
    }
    // floorIsConnected (checked above for every seed) reaches every placement from the player
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
    for (let s = 0; s < 20; s++) generateFloor(theme, 5000 + s, energyOf)
    expect((performance.now() - started) / 20).toBeLessThan(50)
  })

  it('lays solid obstacles and walkable decoration, by the tile key', () => {
    const autotiled = (theme.wallAutotile ?? []).flatMap((rule) => rule.tiles)
    const obstacles = [...theme.wall, ...theme.longWall, ...autotiled, ...theme.stumps, ...theme.materials.flatMap((m) => m.tiles)]
    for (const o of obstacles) expect(active.isSolid(o.value), `tile ${o.value}`).toBe(true)
    for (const d of theme.decorations) expect(active.isSolid(d.value), `tile ${d.value}`).toBe(false)
  })

  it('names object tiles by their key symbols, for every unit it can place', () => {
    for (const [symbol, index] of Object.entries(theme.objectTiles)) expect(objects.symbols[index - 1]).toBe(symbol)
    const u = theme.units
    const keys = [u.player, u.startMusic, u.exitMusic, ...u.enemies.map((c) => c.key), ...u.dwellings.map((c) => c.key),
      ...[...groupRooms.flatMap(([, groups]) => groups), ...u.bosses].flatMap((g) => Object.keys(g.units)), ...u.potions.map((p) => p.value), ...rewardKeys]
    for (const k of keys) expect(theme.objectTiles[k], k).toBeDefined()
  })
})

describe('HP budget draws', () => {
  const energies: Record<string, number> = { small: 10, big: 100 }
  const energyOf = (k: string) => energies[k]!
  /** a source of units handing out `keys` in turn (then nothing), counting what was taken */
  const source = (...keys: string[]) => {
    let taken = 0
    return { next: () => keys[taken++] ?? null, taken: () => taken }
  }
  const none = { units: 0, energy: 0 }

  it('stops once the budget is reached', () => {
    expect(drawToBudget([1, 10], 250, none, source('big', 'big', 'big', 'big').next, energyOf)).toEqual(['big', 'big', 'big'])
    expect(drawToBudget([1, 10], 300, none, source('big', 'big', 'big', 'big').next, energyOf)).toHaveLength(3)
  })

  it('draws at least the least count, however much energy that is, and never more than the most', () => {
    expect(drawToBudget([4, 10], 50, none, source('big', 'big', 'big', 'big', 'big').next, energyOf)).toHaveLength(4)
    expect(drawToBudget([1, 5], 1000, none, source(...Array<string>(10).fill('small')).next, energyOf)).toHaveLength(5)
  })

  it("counts the room's group towards the budget and the counts", () => {
    expect(drawToBudget([1, 10], 250, { units: 2, energy: 200 }, source('big', 'big').next, energyOf)).toEqual(['big'])
    expect(drawToBudget([1, 4], 1000, { units: 3, energy: 30 }, source('small', 'small').next, energyOf)).toEqual(['small'])
    expect(drawToBudget([2, 10], 100, { units: 1, energy: 500 }, source('small', 'small').next, energyOf)).toEqual(['small'])
  })

  it('stops when nothing is left to draw', () => {
    const s = source('small')
    expect(drawToBudget([4, 10], 1000, none, s.next, energyOf)).toEqual(['small'])
    expect(s.taken()).toBe(2)
  })

  it('tells the source how much the room may still take under its ceiling', () => {
    const allowances: number[] = []
    const next = (allowance: number) => {
      allowances.push(allowance)
      return allowance >= 100 ? 'big' : null
    }
    expect(drawToBudget([0, 10], 250, { units: 1, energy: 50 }, next, energyOf, 300)).toEqual(['big', 'big'])
    expect(allowances).toEqual([250, 150])
  })

  it('counts a producer by the budget rule: at least its floor, times the factor', () => {
    const costOf = budgetCost({ base: 0, perLevel: 0, producers: { factor: 3, least: 50 } }, new Set(['small']), energyOf)
    expect([costOf('small'), costOf('big')]).toEqual([150, 100])
  })

  it('scales the budget with the floor level, and names an actor without data', () => {
    expect(budgetEnergy({ base: 10, perLevel: 5 }, 3)).toBe(25)
    expect(() => energyLookup({})('nobody')).toThrow(/nobody/)
  })
})

describe('generated map ids', () => {
  it('lists one map per theme under randomly_generated/, numbered by difficulty, then the tower', () => {
    expect(GENERATED_MAPS.map((m) => m.id)).toEqual([
      'randomly_generated/1-goblin-forest', 'randomly_generated/2-undead-marsh', 'randomly_generated/3-dragon-canyon', 'randomly_generated/4-magic-maze', 'randomly_generated/5-golden-fort', 'randomly_generated/sorcerers-tower',
    ])
    expect(isGeneratedMapId('randomly_generated/nowhere')).toBe(false)
  })

  it('brings ids from before the rename up to date', () => {
    expect(currentMapId('random/goblin-forest')).toBe('randomly_generated/1-goblin-forest')
    expect(currentMapId('random/sorcerers-tower')).toBe('randomly_generated/sorcerers-tower')
    expect(currentMapId('combat_test')).toBe('test_maps/combat_test')
    expect(currentMapId('spells_test')).toBe('test_maps/spell_test')
    expect(currentMapId('works/sam')).toBe('works/sam')
  })
})

describe('Magic Maze necromancers (owner: a regular sight)', () => {
  it('puts necromancers outside the midboss and boss rooms on many floors', () => {
    const fixed = [cornerRoom(MAGIC_MAZE.floorSize, 'farY'), exitRoom(MAGIC_MAZE.floorSize)]
    const floors = SEEDS.slice(0, 200).map((s) => generateFloor(MAGIC_MAZE, s, energyOf))
    const featuring = floors.filter((f) => f.placements.some((p) => p.key === 'necromancer' && !fixed.some((r) => sameRoom(r, p.room))))
    expect(featuring.length).toBeGreaterThan(floors.length / 3)
  })
})

describe('Golden Fort (owner rules)', () => {
  const u = GOLDEN_FORT.units
  const floors = SEEDS.slice(0, 100).map((s) => generateFloor(GOLDEN_FORT, s, energyOf))

  it('gives 10 potions, 2 medikits and one spell scroll of any kind in the start room', () => {
    const potionKeys = new Set(u.startRewards.potions.map((p) => p.value))
    expect(new Set(u.startRewards.spellScrolls.map((s) => s.value))).toEqual(new Set(SPELL_SCROLLS))
    for (const f of floors) {
      const start = f.placements.filter((p) => sameRoom(p.room, startRoom(GOLDEN_FORT.floorSize))).map((p) => p.key)
      expect(start.filter((k) => potionKeys.has(k))).toHaveLength(10)
      expect(start.filter((k) => k === 'medikit')).toHaveLength(2)
      expect(start.filter((k) => (SPELL_SCROLLS as readonly string[]).includes(k))).toHaveLength(1)
    }
  })

  it('draws from every tower floor\'s enemies and dwellings, each with its team as its faction', () => {
    const fortKeys = new Set([...u.enemies, ...u.dwellings].map((c) => c.key))
    for (const theme of TOWER_THEMES) for (const c of [...theme.units.enemies, ...theme.units.dwellings]) expect(fortKeys.has(c.key), c.key).toBe(true)
    for (const c of [...u.enemies, ...u.dwellings]) expect(c.faction, c.key).toBe(pageDefs[c.key]!.team)
    for (const b of u.bosses) expect(b.faction, b.label).toBe(pageDefs[b.boss]!.team)
  })

  it('makes alliances of teams that do not hate each other', () => {
    for (const a of u.alliances!) {
      for (const x of a.factions) for (const y of a.factions) expect(pageTeams[x]!.hates.flat(), `${a.name}: ${x} -> ${y}`).not.toContain(y)
    }
  })

  it('is not part of the tower', () => {
    expect(TOWER_FLOORS.map((t) => t.id)).not.toContain(GOLDEN_FORT.id)
  })
})
