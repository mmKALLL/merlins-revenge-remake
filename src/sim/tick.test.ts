import { describe, expect, it } from 'vitest'
import type { MapDefinition } from '../mr-open/mr-map-format'
import { createSim, stepSim } from './tick'
import { NO_INPUT } from './state'
import { buildWorldGrid } from './world-grid'

function openMap(): MapDefinition {
  const grid = Array.from({ length: 9 }, () => Array(18).fill(1))
  const rooms = [1, 2].map((num) => ({ num, layers: { backgroundActive: grid, backgroundPassive: grid } }))
  return {
    mapSize: { x: 2, y: 1 }, roomSize: { x: 18, y: 9 }, startRoom: { x: 1, y: 1 },
    layers: [{ name: 'backgroundPassive', tileSet: 'p' }, { name: 'backgroundActive', tileSet: 'a' }], rooms,
  }
}
const anims = { walk: { frames: 8, delay: 3 } }
const make = () => createSim(buildWorldGrid(openMap(), () => false), anims, { x: 100, y: 100 })
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
})
