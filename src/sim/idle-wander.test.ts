// Idle wander (remake addition; engine notes walking-and-rooms, "Continuous world"): a sleeping
// enemy near the follow camera's view now and then walks to a random point near its home, asleep.
import { describe, expect, it } from 'vitest'
import type { ActorDef } from '../mr-open/mr-actor-data'
import { distance } from '../mr-open/mr-geometry'
import { ARRIVAL_DISTANCE } from '../mr-open/mr-pathfinding'
import type { MapDefinition } from '../mr-open/mr-map-format'
import { NO_INPUT, TICKS_PER_SECOND, type ActorState, type SimState, type WorldMode } from './state'
import { anims, defs, teams } from './test-data'
import { createSim, stepSim } from './tick'
import { PLAY_VIEW } from './view'
import { buildWorldGrid } from './world-grid'

const SYMBOLS = ['none', 'goblinWarrior', 'goblinMageHut', 'goblinMage']
const TILE = 32
const ROW = 5
const PLAYER = { x: 100, y: (ROW - 1) * TILE + 16 }
const RADIUS = defs['goblinWarrior']!.idleWanderRadius
const WAKE = defs['player']!.wakeDistance

/** Three open 18x9 rooms side by side with `symbol` on row 5 at world tile column `column` (1-based). */
function threeRooms(symbol: string, column: number): MapDefinition {
  const fill = (v: number) => Array.from({ length: 9 }, () => Array(18).fill(v))
  const objects = [fill(0), fill(0), fill(0)]
  objects[Math.floor((column - 1) / 18)]![ROW - 1]![(column - 1) % 18] = SYMBOLS.indexOf(symbol) + 1
  return {
    mapSize: { x: 3, y: 1 }, roomSize: { x: 18, y: 9 }, startRoom: { x: 1, y: 1 },
    layers: [{ name: 'backgroundPassive', tileSet: 'p' }, { name: 'backgroundActive', tileSet: 'a' }, { name: 'objects', tileSet: 'o' }],
    rooms: [1, 2, 3].map((num) => ({ num, layers: { backgroundActive: fill(1), backgroundPassive: fill(1), objects: objects[num - 1]! } })),
  }
}

/** Every wander roll succeeds: chancePerSecond * interval / 30 = 1. */
function alwaysWander(key: string): Record<string, ActorDef> {
  const def = defs[key]!
  return { ...defs, [key]: { ...def, idleWanderChancePerSecond: TICKS_PER_SECOND / def.idleWanderIntervalTicks } }
}

/** The world tile column whose centre is `px` to the right of Merlin. */
const columnAt = (px: number) => Math.floor((PLAYER.x + px) / TILE) + 1

function world(symbol: string, px: number, mode: WorldMode = 'continuous'): SimState {
  return createSim(buildWorldGrid(threeRooms(symbol, columnAt(px)), () => false, SYMBOLS), alwaysWander(symbol), teams, anims, 1, PLAYER, mode)
}

const unit = (s: SimState, key: string): ActorState => s.actors.find((a) => a.def === key)!

describe('idle wander of sleeping units (continuous world)', () => {
  it('sets home to the spawn position', () => {
    const g = unit(world('goblinWarrior', 250), 'goblinWarrior')
    expect(g.home).toEqual(g.pos)
  })

  it('walks a sleeping goblin on screen to a point within idleWanderRadius of home, then stops, asleep throughout', () => {
    let s = world('goblinWarrior', 250) // on screen, beyond wake range even after a full wander
    const { home } = unit(s, 'goblinWarrior')
    let wandered = false
    let stopped: ActorState | null = null
    for (let i = 0; i < 150 && !stopped; i++) {
      s = stepSim(s, NO_INPUT)
      const g = unit(s, 'goblinWarrior')
      expect(g.awake).toBe(false)
      if (g.ai.mode === 'idleWander') {
        wandered = true
        if (g.pos.x !== g.prevPos.x || g.pos.y !== g.prevPos.y) expect(g.anim).toBe('walk')
      } else if (wandered) stopped = g
    }
    expect(stopped).not.toBeNull()
    expect(stopped!.home).toEqual(home)
    expect(distance(stopped!.pos, home)).toBeGreaterThan(0)
    expect(distance(stopped!.pos, home)).toBeLessThanOrEqual(RADIUS + ARRIVAL_DISTANCE)
    expect(stopped!.vel).toEqual({ x: 0, y: 0 })
    expect(stopped!.anim).toBe('stand')
  })

  it('wanders a sleeping spell caster (goblin mage) too', () => {
    let s = world('goblinMage', 250)
    let wandered = false
    for (let i = 0; i < 150 && !wandered; i++) {
      s = stepSim(s, NO_INPUT)
      wandered = unit(s, 'goblinMage').ai.mode === 'idleWander'
    }
    expect(wandered).toBe(true)
    expect(unit(s, 'goblinMage').awake).toBe(false)
  })

  it('wanders a sleeper off screen but within idleWanderMarginTiles of the view', () => {
    const viewRight = PLAY_VIEW.w // the camera is clamped to the map's left edge
    let s = world('goblinWarrior', viewRight + (defs['player']!.idleWanderMarginTiles * TILE) / 2 - PLAYER.x)
    let wandered = false
    for (let i = 0; i < 30 && !wandered; i++) {
      s = stepSim(s, NO_INPUT)
      wandered = unit(s, 'goblinWarrior').ai.mode === 'idleWander'
    }
    expect(wandered).toBe(true)
  })

  it('leaves a sleeper beyond the view margin untouched', () => {
    let s = world('goblinWarrior', 1400) // room 3: past the view's right edge plus the margin
    const before = unit(s, 'goblinWarrior')
    for (let i = 0; i < 60; i++) s = stepSim(s, NO_INPUT)
    expect(unit(s, 'goblinWarrior')).toBe(before)
  })

  it('wakes a wandering sleeper that walks into wake range, ending the wander', () => {
    let s = world('goblinWarrior', WAKE + RADIUS / 2)
    expect(unit(s, 'goblinWarrior').awake).toBe(false)
    let wandered = false
    for (let i = 0; i < 900 && !unit(s, 'goblinWarrior').awake; i++) {
      s = stepSim(s, NO_INPUT)
      if (unit(s, 'goblinWarrior').ai.mode === 'idleWander') wandered = true
    }
    const g = unit(s, 'goblinWarrior')
    expect(wandered).toBe(true)
    expect(g.awake).toBe(true)
    expect(g.ai.mode).not.toBe('idleWander')
  })

  it('never moves a sleeping dwelling', () => {
    let s = world('goblinMageHut', 250)
    const start = unit(s, 'goblinMageHut').pos
    for (let i = 0; i < 120; i++) s = stepSim(s, NO_INPUT)
    expect(unit(s, 'goblinMageHut').pos).toEqual(start)
  })

  it('never wanders an awake goblin without a target (rooms mode)', () => {
    let s = world('goblinWarrior', 250, 'rooms')
    // Merlin joins the goblins' team, so they have nothing to attack
    const team = defs['goblinWarrior']!.team
    s = { ...s, actors: s.actors.map((a) => (a.id === s.playerId ? { ...a, team } : a)) }
    const start = unit(s, 'goblinWarrior').pos
    for (let i = 0; i < 120; i++) {
      s = stepSim(s, NO_INPUT)
      expect(unit(s, 'goblinWarrior').ai.mode).not.toBe('idleWander')
    }
    expect(unit(s, 'goblinWarrior').pos).toEqual(start)
  })
})
