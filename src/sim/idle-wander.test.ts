// Idle wander (remake addition; engine notes combat, "Idle wander"): an enemy with nothing to
// attack now and then walks to a random point near its home.
import { describe, expect, it } from 'vitest'
import type { ActorDef } from '../mr-open/mr-actor-data'
import { distance } from '../mr-open/mr-geometry'
import type { MapDefinition } from '../mr-open/mr-map-format'
import { NO_INPUT, TICKS_PER_SECOND, type ActorState, type SimState } from './state'
import { anims, defs, teams } from './test-data'
import { createSim, stepSim } from './tick'
import { buildWorldGrid } from './world-grid'

const SYMBOLS = ['none', 'goblinWarrior', 'goblinMageHut']
const PLAYER = { x: 48, y: 144 }

/** One open 18x9 room with `symbol` at tile (12, 5). */
function oneRoom(symbol: string): MapDefinition {
  const fill = (v: number) => Array.from({ length: 9 }, () => Array(18).fill(v))
  const objects = fill(0)
  objects[4]![11] = SYMBOLS.indexOf(symbol) + 1
  return {
    mapSize: { x: 1, y: 1 }, roomSize: { x: 18, y: 9 }, startRoom: { x: 1, y: 1 },
    layers: [{ name: 'backgroundPassive', tileSet: 'p' }, { name: 'backgroundActive', tileSet: 'a' }, { name: 'objects', tileSet: 'o' }],
    rooms: [{ num: 1, layers: { backgroundActive: fill(1), backgroundPassive: fill(1), objects } }],
  }
}

/** Every idle roll starts a wander: chancePerSecond * interval / 30 = 1. */
function alwaysWander(key: string): Record<string, ActorDef> {
  const def = defs[key]!
  return { ...defs, [key]: { ...def, idleWanderChancePerSecond: TICKS_PER_SECOND / def.idleWanderIntervalTicks } }
}

function room(symbol: string, withTarget: boolean): SimState {
  const s = createSim(buildWorldGrid(oneRoom(symbol), () => false, SYMBOLS), alwaysWander(symbol), teams, anims, 1, PLAYER, 'rooms')
  if (withTarget) return s
  // Merlin joins the goblins' team, so they have nothing to attack
  const team = defs['goblinWarrior']!.team
  return { ...s, actors: s.actors.map((a) => (a.id === s.playerId ? { ...a, team } : a)) }
}

const unit = (s: SimState, key: string): ActorState => s.actors.find((a) => a.def === key)!

describe('idle wander', () => {
  it('sets home to the spawn position', () => {
    const g = unit(room('goblinWarrior', false), 'goblinWarrior')
    expect(g.home).toEqual(g.pos)
  })

  it('walks an idle goblin to a point within idleWanderRadius of home, then stops', () => {
    let s = room('goblinWarrior', false)
    const { home } = unit(s, 'goblinWarrior')
    const radius = defs['goblinWarrior']!.idleWanderRadius
    let wandered = false
    let stopped: ActorState | null = null
    for (let i = 0; i < 120 && !stopped; i++) {
      s = stepSim(s, NO_INPUT)
      const g = unit(s, 'goblinWarrior')
      if (g.ai.mode === 'idleWander') wandered = true
      else if (wandered) stopped = g
    }
    expect(stopped).not.toBeNull()
    expect(distance(stopped!.home, home)).toBe(0)
    expect(distance(stopped!.pos, home)).toBeGreaterThan(0)
    expect(distance(stopped!.pos, home)).toBeLessThanOrEqual(radius + 5)
    expect(stopped!.vel).toEqual({ x: 0, y: 0 })
  })

  it('never wanders while the goblin has a target', () => {
    let s = room('goblinWarrior', true)
    for (let i = 0; i < 120; i++) {
      s = stepSim(s, NO_INPUT)
      expect(unit(s, 'goblinWarrior').ai.mode).not.toBe('idleWander')
    }
  })

  it('never moves a dwelling', () => {
    let s = room('goblinMageHut', false)
    const start = unit(s, 'goblinMageHut').pos
    for (let i = 0; i < 120; i++) {
      s = stepSim(s, NO_INPUT)
      expect(unit(s, 'goblinMageHut').ai.mode).not.toBe('idleWander')
    }
    expect(unit(s, 'goblinMageHut').pos).toEqual(start)
  })
})
