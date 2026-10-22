// The Sorcerer's Tower against the converted tower tilesets (pnpm assets:convert): floors join only
// through the stairs, the whole tower connects, and the player starts on the bottom floor only.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { Vec } from '../mr-open/mr-geometry'
import { roomXYToNum } from '../mr-open/mr-map-format'
import { BOSS_TILE, ROOM_SIZE, floorIsConnected } from './floor'
import { edgeMismatches } from './edge-check'
import { generateTower, TOWER_FLOORS, TOWER_SIZE } from './tower'

const symbols = (name: string): string[] =>
  (JSON.parse(readFileSync(`public/generated/tilesets/${name}.json`, 'utf8')) as { symbols: string[] }).symbols
const active = symbols('towerActive')
const objects = symbols('towerObjects')
const isSolid = (i: number) => i >= 1 && active[i - 1] === 'solid'
const SEEDS = Array.from({ length: 40 }, (_, i) => i * 104729 + 3)
const towers = SEEDS.map((seed) => ({ seed, tower: generateTower(seed) }))
const FLOOR_ROWS = TOWER_FLOORS[0]!.floorSize.y
const sameVec = (a: Vec, b: Vec) => a.x === b.x && a.y === b.y

/** Floor k (0 = bottom)'s start and exit rooms in tower coordinates: the corners snake. */
function corners(k: number): { start: Vec; exit: Vec } {
  const bottom = TOWER_SIZE.y - k * FLOOR_ROWS
  const left = k % 2 === 0
  return { start: { x: left ? 1 : TOWER_SIZE.x, y: bottom }, exit: { x: left ? TOWER_SIZE.x : 1, y: bottom - FLOOR_ROWS + 1 } }
}

describe("The Sorcerer's Tower", () => {
  it('is the same tower for the same seed', () => {
    expect(generateTower(77)).toEqual(generateTower(77))
  })

  it('connects the player to every unit and the end room, by the converted tile key', () => {
    for (const { seed, tower } of towers) expect(floorIsConnected(tower, isSolid), `seed ${seed}`).toBe(true)
  })

  it('keeps facing edge tiles together, entrances 3 wide and the border closed', () => {
    for (const { seed, tower } of towers.slice(0, 10)) expect(edgeMismatches(tower.map, isSolid), `seed ${seed}`).toEqual([])
  })

  it("joins floors only from one floor's exit room up into the next one's start room", () => {
    for (const { tower } of towers) {
      for (let k = 0; k + 1 < TOWER_FLOORS.length; k++) {
        const { exit } = corners(k)
        expect(corners(k + 1).start).toEqual({ x: exit.x, y: exit.y - 1 })
        for (let x = 1; x <= TOWER_SIZE.x; x++) {
          const top = tower.edges[`${x},${exit.y}`]!.top
          if (x === exit.x) expect(top).toEqual(tower.edges[`${x},${exit.y - 1}`]!.bottom)
          else expect(top).toBeNull()
          const room = tower.map.rooms.find((r) => r.num === roomXYToNum({ x, y: exit.y }, TOWER_SIZE))!
          const open = room.layers.backgroundActive![0]!.some((i) => !isSolid(i))
          expect(open).toBe(x === exit.x)
        }
      }
    }
  })

  it('starts the player on the bottom floor, plays each later floor its start music, and ends at the top exit', () => {
    for (const { tower } of towers) {
      expect(tower.placements.filter((p) => p.key === 'player').map((p) => p.room)).toEqual([corners(0).start])
      expect(tower.map.startRoom).toEqual(corners(0).start)
      expect(tower.map.endRoom).toEqual(corners(TOWER_FLOORS.length - 1).exit)
      TOWER_FLOORS.forEach((theme, k) => {
        const { start, exit } = corners(k)
        expect(tower.placements.some((p) => sameVec(p.room, start) && p.key === theme.units.startMusic)).toBe(true)
        const bossTile = k % 2 === 0 ? BOSS_TILE : { x: ROOM_SIZE.x - 1 - BOSS_TILE.x, y: BOSS_TILE.y }
        const boss = tower.placements.find((p) => sameVec(p.room, exit) && sameVec(p.tile, bossTile))
        expect(theme.units.bosses.map((b) => b.boss)).toContain(boss?.key)
      })
    }
  })

  it("keeps each floor's potions at its side corners' outer corners, mirrored floors included", () => {
    for (const { tower } of towers) {
      TOWER_FLOORS.forEach((theme, k) => {
        const { start, exit } = corners(k)
        const potionKeys = new Set(theme.units.potions.map((p) => p.value))
        // the side corners: the start's column with the exit's row, and the exit's column with the start's row
        for (const room of [{ x: start.x, y: exit.y }, { x: exit.x, y: start.y }]) {
          const potions = tower.placements.filter((p) => sameVec(p.room, room) && potionKeys.has(p.key))
          expect(potions).toHaveLength(2)
          const outer = { x: room.x === 1 ? 0 : ROOM_SIZE.x - 1, y: room.y === exit.y ? 0 : ROOM_SIZE.y - 1 }
          for (const p of potions) expect(Math.max(Math.abs(p.tile.x - outer.x), Math.abs(p.tile.y - outer.y))).toBeLessThanOrEqual(3)
        }
      })
    }
  })

  it("gives each floor's start rewards in its start room, with a different spell scroll on every floor", () => {
    for (const { seed, tower } of towers) {
      const scrolls = TOWER_FLOORS.map((theme, k) => {
        const rewards = theme.units.startRewards
        const inStart = tower.placements.filter((p) => sameVec(p.room, corners(k).start))
        const potions = inStart.filter((p) => rewards.potions.some((r) => r.value === p.key))
        const scroll = inStart.filter((p) => rewards.spellScrolls.some((s) => s.value === p.key))
        expect(potions, `seed ${seed} floor ${k}`).toHaveLength(rewards.potionCount)
        expect(inStart.filter((p) => p.key === 'medikit')).toHaveLength(rewards.medikits)
        expect(scroll).toHaveLength(1)
        if (k === 0) {
          const player = inStart.find((p) => p.key === 'player')!
          for (const p of [...potions, ...scroll]) expect(sameVec(p.tile, player.tile)).toBe(false)
        }
        return scroll[0]!.key
      })
      expect(new Set(scrolls).size).toBe(scrolls.length)
    }
  })

  it('names every unit by its symbol in the combined objects key', () => {
    const { tower } = towers[0]!
    for (const p of tower.placements) {
      const room = tower.map.rooms.find((r) => r.num === roomXYToNum(p.room, TOWER_SIZE))!
      expect(objects[room.layers.objects![p.tile.y]![p.tile.x]! - 1]).toBe(p.key)
    }
    expect(objects.indexOf('player') + 1).toBe(TOWER_FLOORS[0]!.objectTiles['player'])
  })
})
