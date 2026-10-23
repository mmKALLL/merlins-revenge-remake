// The remake's attack grace (attack-grace.ts): a hostile that has just become active for Merlin starts no
// ranged or magic attack for the player's activationAttackGraceTicks, but still moves. Engine data
// from assets/actors with the grace turned on.
import { describe, expect, it } from 'vitest'
import type { ActorDef } from '../mr-open/mr-actor-data'
import type { MapDefinition } from '../mr-open/mr-map-format'
import { NO_INPUT, type ActorState, type InputSnapshot, type SimState, type WorldMode } from './state'
import { anims, defs, teams } from './test-data'
import { createSim, stepSim } from './tick'
import { buildWorldGrid } from './world-grid'

const GRACE = 24
const graceDefs: Record<string, ActorDef> = { ...defs, player: { ...defs['player']!, activationAttackGraceTicks: GRACE } }

const SYMBOLS = ['none', 'goblinMage', 'bowOrc']
const tileOf = (symbol: string) => SYMBOLS.indexOf(symbol) + 1
const ROW_Y = 144 // tile row 5 centre
const ROOM_W = 18 * 32

/** Two open 18x9 rooms side by side with objects on row 5 (room 1 or 2, 1-based column). */
function twoRooms(objects: { room: 1 | 2; x: number; symbol: string }[]): MapDefinition {
  const fill = (v: number) => Array.from({ length: 9 }, () => Array(18).fill(v))
  const obj = [fill(0), fill(0)]
  for (const o of objects) obj[o.room - 1]![4]![o.x - 1] = tileOf(o.symbol)
  return {
    mapSize: { x: 2, y: 1 }, roomSize: { x: 18, y: 9 }, startRoom: { x: 1, y: 1 },
    layers: [{ name: 'backgroundPassive', tileSet: 'p' }, { name: 'backgroundActive', tileSet: 'a' }, { name: 'objects', tileSet: 'o' }],
    rooms: [1, 2].map((num) => ({ num, layers: { backgroundActive: fill(1), backgroundPassive: fill(1), objects: obj[num - 1]! } })),
  }
}

function sim(objects: { room: 1 | 2; x: number; symbol: string }[], playerX: number, mode: WorldMode = 'rooms', d = graceDefs): SimState {
  return createSim(buildWorldGrid(twoRooms(objects), () => false, SYMBOLS), d, teams, anims, 1, { x: playerX, y: ROW_Y }, mode)
}
const ofDef = (s: SimState, key: string): ActorState[] => s.actors.filter((a) => a.def === key)
/** Keeps the player in place and unhurt, so only the enemies act. */
const pin = (s: SimState, x: number): SimState => ({
  ...s, actors: s.actors.map((a) => (a.id === s.playerId ? { ...a, pos: { x, y: ROW_Y }, prevPos: { x, y: ROW_Y }, knockback: { x: 0, y: 0 }, energy: 200 } : a)),
})
/** The tick (1-based) on which `fired` first holds, stepping with Merlin pinned at x; null within `ticks`. */
function firstTick(s: SimState, x: number, fired: (s: SimState) => boolean, ticks = 120, input: InputSnapshot = NO_INPUT): number | null {
  for (let i = 1; i <= ticks; i++) {
    s = pin(stepSim(s, input), x)
    if (fired(s)) return i
  }
  return null
}
const casting = (s: SimState) => ofDef(s, 'spell').length > 0
const shooting = (s: SimState) => ofDef(s, 'crossBolt').length > 0

describe('attack grace (remake)', () => {
  it('holds a spell caster\'s first charge until the grace is over (map start)', () => {
    const mage = [{ room: 1 as const, x: 8, symbol: 'goblinMage' }]
    // without the grace the mage starts charging well inside the grace's ticks
    expect(firstTick(sim(mage, 100, 'rooms', defs), 100, casting)).toBeLessThanOrEqual(GRACE)
    expect(firstTick(sim(mage, 100), 100, casting)).toBe(GRACE + 1)
  })

  it('lets the caster move during the grace', () => {
    let s = sim([{ room: 1, x: 5, symbol: 'goblinMage' }], 100) // close: it backs off
    const start = ofDef(s, 'goblinMage')[0]!.pos
    for (let i = 0; i < GRACE - 1; i++) s = pin(stepSim(s, NO_INPUT), 100)
    expect(casting(s)).toBe(false)
    expect(ofDef(s, 'goblinMage')[0]!.pos).not.toEqual(start)
  })

  it('holds a ranged attack too', () => {
    const archer = [{ room: 1 as const, x: 7, symbol: 'bowOrc' }]
    expect(firstTick(sim(archer, 100, 'rooms', defs), 100, shooting)).toBeLessThanOrEqual(GRACE)
    expect(firstTick(sim(archer, 100), 100, shooting)).toBeGreaterThan(GRACE)
  })

  it('starts again when Merlin enters the caster\'s room', () => {
    let s = sim([{ room: 2, x: 6, symbol: 'goblinMage' }], ROOM_W - 20)
    const right = { ...NO_INPUT, move: { x: 1, y: 0 } }
    for (let i = 0; i < 60 && s.room.x === 1; i++) s = stepSim(s, right)
    expect(s.room.x).toBe(2)
    const x = s.actors.find((a) => a.id === s.playerId)!.pos.x
    expect(firstTick(s, x, casting)).toBe(GRACE + 1)
  })

  it('starts when a sleeper wakes in the continuous world', () => {
    let s = sim([{ room: 2, x: 9, symbol: 'goblinMage' }], 100, 'continuous')
    expect(ofDef(s, 'goblinMage')[0]!.awake).toBe(false)
    const near = ofDef(s, 'goblinMage')[0]!.pos.x - 120
    s = pin(stepSim(pin(s, near), NO_INPUT), near) // the wake happens at the end of this tick
    expect(ofDef(s, 'goblinMage')[0]!.awake).toBe(true)
    expect(firstTick(s, near, casting)).toBe(GRACE + 1)
  })
})
