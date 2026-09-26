import { describe, expect, it } from 'vitest'
import type { MapDefinition } from '../mr-open/mr-map-format'
import { createSim, findStartPos, stepSim } from './tick'
import { NO_INPUT } from './state'
import { buildWorldGrid } from './world-grid'

const SOLID = 2
const PLAYER = 3

/**
 * Two 18x9 rooms side by side. `solidCol` fills that 1-based column of room 1's active layer with SOLID;
 * `playerAt` puts a PLAYER tile in room 1's objects layer.
 */
function openMap(opts: { solidCol?: number; playerAt?: { x: number; y: number } } = {}): MapDefinition {
  const fill = (v: number) => Array.from({ length: 9 }, () => Array(18).fill(v))
  const active = fill(1)
  if (opts.solidCol) for (const row of active) row[opts.solidCol - 1] = SOLID
  const objects = fill(0)
  if (opts.playerAt) objects[opts.playerAt.y - 1]![opts.playerAt.x - 1] = PLAYER
  const rooms = [1, 2].map((num) => ({
    num,
    layers: { backgroundActive: num === 1 ? active : fill(1), backgroundPassive: fill(1), objects: num === 1 ? objects : fill(0) },
  }))
  return {
    mapSize: { x: 2, y: 1 }, roomSize: { x: 18, y: 9 }, startRoom: { x: 1, y: 1 },
    layers: [
      { name: 'backgroundPassive', tileSet: 'p' },
      { name: 'backgroundActive', tileSet: 'a' },
      { name: 'objects', tileSet: 'o' },
    ],
    rooms,
  }
}
const isSolid = (i: number) => i === SOLID
const anims = { walk: { frames: 8, delay: 3 } }
const make = () => createSim(buildWorldGrid(openMap(), isSolid), anims, { x: 100, y: 100 })
const input = (x: number, y: number) => ({ ...NO_INPUT, move: { x, y } })

describe('stepSim', () => {
  it('advances position by the velocity and keeps prevPos', () => {
    let s = make()
    s = stepSim(s, input(1, 0))
    expect(s.player.prevPos).toEqual({ x: 100, y: 100 })
    expect(s.player.pos.x).toBe(101)
    expect(s.tick).toBe(1)
  })

  it('faces left only on horizontal input and keeps facing on vertical', () => {
    let s = make()
    s = stepSim(s, input(-1, 0))
    expect(s.player.facingLeft).toBe(true)
    s = stepSim(s, input(0, 1))
    expect(s.player.facingLeft).toBe(true)
    s = stepSim(s, input(1, 0))
    expect(s.player.facingLeft).toBe(false)
  })

  it('plays walk while a key is held and stand otherwise, 3 ticks per frame', () => {
    let s = make()
    // tick 1 switches to walk (frame 0, counter 0); frame 1 appears after `delay` more ticks
    for (let i = 0; i < 4; i++) s = stepSim(s, input(0, 1))
    expect(s.player.anim).toBe('walk')
    expect(s.player.animFrame).toBe(1)
    s = stepSim(s, NO_INPUT)
    expect(s.player.anim).toBe('stand')
  })

  it('changes room when the reg point crosses the room edge', () => {
    let s = make()
    s.player.pos = { x: 574, y: 100 }
    for (let i = 0; i < 5; i++) s = stepSim(s, input(1, 0))
    expect(s.room).toEqual({ x: 2, y: 1 })
    expect(s.player.pos.x).toBeGreaterThanOrEqual(576)
  })

  it('cannot leave the map', () => {
    let s = make()
    s.player.pos = { x: 20, y: 100 }
    for (let i = 0; i < 30; i++) s = stepSim(s, input(-1, 0))
    expect(s.room).toEqual({ x: 1, y: 1 })
    expect(s.player.pos.x).toBeGreaterThanOrEqual(15)
  })

  it('zeroes vel.x on a wall hit and keeps vel.y', () => {
    // wall column 5 spans x 128..160; the 30 px rect stops with its right edge at the tile's left edge (127)
    let s = createSim(buildWorldGrid(openMap({ solidCol: 5 }), isSolid), anims, { x: 100, y: 100 })
    let hit = false
    for (let i = 0; i < 20; i++) {
      s = stepSim(s, input(1, 1))
      if (s.player.vel.x === 0) {
        hit = true
        break
      }
    }
    expect(hit).toBe(true)
    expect(s.player.pos.x).toBe(112)
    expect(s.player.vel.y).toBeGreaterThan(0)
    expect(s.player.pos.y).toBeGreaterThan(100)
  })

  it('keeps the player inside the room at the right edge when exits are closed', () => {
    let s = { ...make(), exitsOpen: false }
    s.player.pos = { x: 540, y: 100 }
    for (let i = 0; i < 30; i++) s = stepSim(s, input(1, 0))
    expect(s.room).toEqual({ x: 1, y: 1 })
    expect(s.player.pos.x).toBe(560)
    expect(s.player.vel.x).toBeGreaterThan(0)
  })
})

describe('findStartPos', () => {
  it('returns the centre of the player tile when present', () => {
    const grid = buildWorldGrid(openMap({ playerAt: { x: 4, y: 3 } }), isSolid)
    expect(findStartPos(grid, PLAYER)).toEqual({ x: 3 * 32 + 16, y: 2 * 32 + 16 })
  })

  it('falls back to the start room centre without a player tile', () => {
    const grid = buildWorldGrid(openMap(), isSolid)
    expect(findStartPos(grid, PLAYER)).toEqual({ x: 288, y: 144 })
    expect(findStartPos(buildWorldGrid(openMap({ playerAt: { x: 4, y: 3 } }), isSolid), null)).toEqual({ x: 288, y: 144 })
  })
})
