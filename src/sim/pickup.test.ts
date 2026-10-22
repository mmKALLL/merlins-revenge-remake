// Pickups in the sim (engine-mechanics-potions.md §2-5): Merlin collects a potion by touching it,
// the potion's writing fades out, the potion raises his stats and makes him briefly invincible,
// and a room keeps the pickups he left behind.
import { describe, expect, it } from 'vitest'
import type { MapDefinition } from '../mr-open/mr-map-format'
import { WRITING_FADE_TICKS } from '../mr-open/mr-pickup'
import { defOf, playerOf, playerStatsOf } from './actors'
import { NO_INPUT, type InputSnapshot, type SimState } from './state'
import { anims, defs, teams } from './test-data'
import { createSim, stepSim } from './tick'
import { applyHit } from './tick-combat'
import { beginTick, playerIn } from './tick-context'
import { buildWorldGrid } from './world-grid'

const SYMBOLS = ['none', 'manaFlow', 'medikit', 'goblinWarrior']
const ROW = 4 // objects on the fifth row, where Merlin starts
const PLAYER = { x: 100, y: ROW * 32 + 16 }
const RIGHT: InputSnapshot = { ...NO_INPUT, move: { x: 1, y: 0 } }
const LEFT: InputSnapshot = { ...NO_INPUT, move: { x: -1, y: 0 } }

/**
 * Three open 18x9 rooms side by side, with `symbol` in room 1's column `x` (1-based) on ROW and a
 * goblin in room 3, so the map is not complete from the start.
 */
function threeRooms(symbol: string, x: number): MapDefinition {
  const fill = (v: number) => Array.from({ length: 9 }, () => Array<number>(18).fill(v))
  const objects = [fill(0), fill(0), fill(0)]
  objects[0]![ROW]![x - 1] = SYMBOLS.indexOf(symbol) + 1
  objects[2]![ROW]![9] = SYMBOLS.indexOf('goblinWarrior') + 1
  return {
    mapSize: { x: 3, y: 1 }, roomSize: { x: 18, y: 9 }, startRoom: { x: 1, y: 1 },
    layers: [{ name: 'backgroundPassive', tileSet: 'p' }, { name: 'backgroundActive', tileSet: 'a' }, { name: 'objects', tileSet: 'o' }],
    rooms: [1, 2, 3].map((num) => ({ num, layers: { backgroundActive: fill(0), backgroundPassive: fill(1), objects: objects[num - 1]! } })),
  }
}

const world = (symbol: string, x: number): SimState =>
  createSim(buildWorldGrid(threeRooms(symbol, x), () => false, SYMBOLS), defs, teams, anims, 1, PLAYER, 'rooms')

const pickupIn = (s: SimState) => s.actors.find((a) => a.id !== s.playerId)

/** Steps with `input` until `done` (or a limit), returning the state. */
function stepUntil(s: SimState, input: InputSnapshot, done: (s: SimState) => boolean): SimState {
  for (let i = 0; i < 300 && !done(s); i++) s = stepSim(s, input)
  return s
}

describe('pickups', () => {
  it('Merlin drinks a potion he walks into: +25 energy, the collect sound, its stat, then the writing fades', () => {
    let s = world('manaFlow', 5)
    const hurt: SimState = { ...s, actors: s.actors.map((a) => (a.id === s.playerId ? { ...a, energy: 100 } : a)) }
    s = stepUntil(hurt, RIGHT, (n) => n.pickups.potionsDrunk.length > 0)
    expect(s.pickups.potionsDrunk).toEqual([{ character: 'manaFlow', count: 1 }])
    expect(playerOf(s).energy).toBe(125)
    expect(s.events).toContainEqual(expect.objectContaining({ kind: 'sound', name: 'collect_powerup_02' }))
    expect(pickupIn(s)?.mode).toBe('collected')
    expect(playerStatsOf(s, playerOf(s)).mana_flow).toBe(defOf(s, playerOf(s)).mana_flow + 0.5)
    for (let i = 0; i < WRITING_FADE_TICKS; i++) s = stepSim(s, NO_INPUT)
    expect(pickupIn(s)).toBeUndefined()
    expect(s.pickups.potionsDrunk).toHaveLength(1)
  })

  it('a pickup leaves Merlin invincible for a while: hits push him but take no energy', () => {
    const s = stepUntil(world('medikit', 5), RIGHT, (n) => n.pickups.invinceTicks > 0)
    expect(s.pickups.medikits.stock).toBe(1)
    const t = beginTick(s)
    const p = playerIn(t)
    applyHit(t, p, { x: 5, y: 0 }, 2)
    expect(p.energy).toBe(playerOf(s).energy)
    expect(p.knockback.x).toBeGreaterThan(0)
    const later = { ...s, pickups: { ...s.pickups, invinceTicks: 0 } }
    const t2 = beginTick(later)
    applyHit(t2, playerIn(t2), { x: 5, y: 0 }, 2)
    expect(playerIn(t2).energy).toBeLessThan(playerOf(s).energy)
  })

  it('a room keeps the pickups Merlin leaves behind', () => {
    const start = world('manaFlow', 17)
    const atEdge: SimState = { ...start, actors: start.actors.map((a) => (a.id === start.playerId ? { ...a, pos: { x: 540, y: 60 }, prevPos: { x: 540, y: 60 } } : a)) }
    let s = stepUntil(atEdge, RIGHT, (n) => n.room.x === 2)
    expect(s.rooms['1,1']!.actors.map((a) => a.def)).toEqual(['manaFlow'])
    s = stepUntil(s, LEFT, (n) => n.room.x === 1)
    expect(pickupIn(s)?.def).toBe('manaFlow')
    expect(s.pickups.potionsDrunk).toEqual([])
  })
})
