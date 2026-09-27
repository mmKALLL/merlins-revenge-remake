// The continuous world's activation rules (remake feature; engine notes walking-and-rooms,
// "Continuous world"): the pure wake/sleep rule, then the whole sim on a two-room map.
import { describe, expect, it } from 'vitest'
import type { MapDefinition } from '../mr-open/mr-map-format'
import { activationDistance, nextActivation } from './activation'
import { sleepingFrame } from './anim'
import { playerOf } from './actors'
import { DEFAULT_SIM_CONFIG, NO_INPUT, type ActorState, type InputSnapshot, type SimState } from './state'
import { anims, defs, teams } from './test-data'
import { createSim, stepSim } from './tick'
import { buildWorldGrid } from './world-grid'

const rules = defs['player']!
const { wakeDistance: WAKE, sleepDistance: SLEEP, hitWakeTicks: HOLD } = rules
const ASLEEP = { awake: false, wakeHold: 0 }
const AWAKE = { awake: true, wakeHold: 0 }

describe('nextActivation (wake and sleep rule)', () => {
  it('wakes a sleeping unit that comes within wakeDistance', () => {
    expect(nextActivation(ASLEEP, WAKE - 1, false, rules).awake).toBe(true)
    expect(nextActivation(ASLEEP, WAKE, false, rules).awake).toBe(false)
  })

  it('keeps each state between wakeDistance and sleepDistance (hysteresis)', () => {
    const between = (WAKE + SLEEP) / 2
    expect(nextActivation(ASLEEP, between, false, rules).awake).toBe(false)
    expect(nextActivation(AWAKE, between, false, rules).awake).toBe(true)
  })

  it('puts an awake unit to sleep at sleepDistance or farther', () => {
    expect(nextActivation(AWAKE, SLEEP, false, rules).awake).toBe(false)
  })

  it('wakes a sleeping unit on a hit', () => {
    expect(nextActivation(ASLEEP, WAKE + 1, true, rules).awake).toBe(true)
  })

  it('keeps a unit hit from sleepDistance or farther awake for hitWakeTicks, then lets it sleep', () => {
    let st = nextActivation(ASLEEP, SLEEP * 2, true, rules)
    for (let i = 0; i < HOLD; i++) {
      expect(st.awake).toBe(true)
      st = nextActivation(st, SLEEP * 2, false, rules)
    }
    expect(st.awake).toBe(false)
  })

  it('gives a hit closer than sleepDistance no hold', () => {
    const st = nextActivation(ASLEEP, SLEEP - 1, true, rules)
    expect(st.awake).toBe(true)
    expect(nextActivation(st, SLEEP, false, rules).awake).toBe(false)
  })
})

describe('activationDistance (elliptical ranges, shorter vertically)', () => {
  const k = rules.activationVerticalScale
  it('counts vertical offsets as 1 / activationVerticalScale times longer', () => {
    expect(activationDistance({ x: 0, y: 0 }, { x: 150, y: 0 }, k)).toBe(150)
    expect(activationDistance({ x: 0, y: 0 }, { x: 0, y: 150 }, k)).toBeCloseTo(150 / k)
  })

  it('puts 150 px sideways inside wakeDistance and 150 px up or down outside it (defaults)', () => {
    expect(activationDistance({ x: 0, y: 0 }, { x: 150, y: 0 }, k)).toBeLessThan(WAKE)
    expect(activationDistance({ x: 0, y: 0 }, { x: 0, y: -150 }, k)).toBeGreaterThanOrEqual(WAKE)
  })
})

describe('sleepingFrame (a sleeper\'s stand strip, animated from the tick)', () => {
  it('loops the strip by its frame delays', () => {
    const strip = { frames: 3, delay: 2, delays: [2, 1, 3], w: 10, h: 10 }
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((tick) => sleepingFrame(strip, tick))).toEqual([0, 0, 1, 2, 2, 2, 0, 0])
  })

  it('shows frame 0 without a strip', () => {
    expect(sleepingFrame(undefined, 17)).toBe(0)
  })
})

const SYMBOLS =['none', 'goblinWarrior', 'goblinMageHut', 'music']
const tileOf = (symbol: string) => SYMBOLS.indexOf(symbol) + 1
const ROOM_W = 18 * 32
const tileX = (tx: number) => (tx - 1) * 32 + 16
const ROW_Y = 144 // tile row 5 centre
const PLAYER = { x: 100, y: ROW_Y }

/** Two open 18x9 rooms side by side with objects on row 5 (room 1 or 2, 1-based column). */
function twoRooms(objects: { room: 1 | 2; x: number; symbol: string; row?: number }[]): MapDefinition {
  const fill = (v: number) => Array.from({ length: 9 }, () => Array(18).fill(v))
  const obj = [fill(0), fill(0)]
  for (const o of objects) obj[o.room - 1]![(o.row ?? 5) - 1]![o.x - 1] = tileOf(o.symbol)
  return {
    mapSize: { x: 2, y: 1 }, roomSize: { x: 18, y: 9 }, startRoom: { x: 1, y: 1 },
    layers: [{ name: 'backgroundPassive', tileSet: 'p' }, { name: 'backgroundActive', tileSet: 'a' }, { name: 'objects', tileSet: 'o' }],
    rooms: [1, 2].map((num) => ({ num, layers: { backgroundActive: fill(1), backgroundPassive: fill(1), objects: obj[num - 1]! } })),
  }
}

function world(objects: { room: 1 | 2; x: number; symbol: string; row?: number }[], playerPos = PLAYER): SimState {
  return createSim(buildWorldGrid(twoRooms(objects), () => false, SYMBOLS), defs, teams, anims, 1, playerPos, 'continuous')
}
const ofDef = (s: SimState, key: string): ActorState[] => s.actors.filter((a) => a.def === key)
function run(s: SimState, ticks: number, input: InputSnapshot = NO_INPUT): SimState {
  for (let i = 0; i < ticks; i++) s = stepSim(s, input)
  return s
}
/** Tile column of room 1 whose centre is `px` from the player (rounded down to a tile). */
const columnAt = (px: number) => Math.floor((PLAYER.x + px) / 32) + 1

describe('continuous world', () => {
  it('spawns every room\'s units at the start', () => {
    const s = world([{ room: 2, x: 9, symbol: 'goblinWarrior' }])
    expect(s.worldMode).toBe('continuous')
    expect(ofDef(s, 'goblinWarrior')).toHaveLength(1)
  })

  it('wakes a unit 5 tiles to the side but not one 5 tiles below (elliptical range)', () => {
    const player = { x: tileX(3), y: 16 } // tile row 1
    const side = world([{ room: 1, x: 8, row: 1, symbol: 'goblinWarrior' }], player)
    expect(ofDef(side, 'goblinWarrior')[0]!.awake).toBe(true)
    const below = world([{ room: 1, x: 3, row: 6, symbol: 'goblinWarrior' }], player)
    expect(ofDef(below, 'goblinWarrior')[0]!.awake).toBe(false)
    expect(ofDef(run(below, 5), 'goblinWarrior')[0]!.awake).toBe(false)
  })

  it('leaves a unit wakeDistance or farther asleep: it stands still on its stand strip', () => {
    let s = world([{ room: 1, x: columnAt(WAKE + 40), symbol: 'goblinWarrior' }])
    const start = ofDef(s, 'goblinWarrior')[0]!.pos
    s = run(s, 60)
    const g = ofDef(s, 'goblinWarrior')[0]!
    expect(g.awake).toBe(false)
    expect(g.pos).toEqual(start)
    expect(g.anim).toBe('stand')
  })

  it('leaves a sleeping unit\'s record untouched by the tick (big maps stay cheap)', () => {
    const s = run(world([{ room: 2, x: 9, symbol: 'goblinWarrior' }]), 1)
    const before = ofDef(s, 'goblinWarrior')[0]!
    expect(ofDef(stepSim(s, NO_INPUT), 'goblinWarrior')[0]).toBe(before)
  })

  it('wakes a unit within wakeDistance, which then walks at Merlin', () => {
    let s = world([{ room: 1, x: columnAt(WAKE - 40), symbol: 'goblinWarrior' }])
    const start = ofDef(s, 'goblinWarrior')[0]!.pos
    s = run(s, 20)
    const g = ofDef(s, 'goblinWarrior')[0]!
    expect(g.awake).toBe(true)
    expect(g.pos.x).toBeLessThan(start.x)
  })

  it('wakes a sleeping unit hit by a spell', () => {
    let s = world([{ room: 1, x: columnAt(WAKE + 60), symbol: 'goblinWarrior' }])
    const g0 = ofDef(s, 'goblinWarrior')[0]!
    const aim: InputSnapshot = { ...NO_INPUT, chargeHeld: true, mouseWorld: g0.pos }
    s = run(s, 10, aim)
    s = stepSim(s, { ...aim, chargeHeld: false })
    let hit = false
    for (let i = 0; i < 400 && !hit; i++) {
      s = stepSim(s, NO_INPUT)
      hit = s.events.some((e) => e.kind === 'hit' && e.id === g0.id)
    }
    expect(hit).toBe(true)
    expect(ofDef(s, 'goblinWarrior')[0]!.awake).toBe(true)
  })

  it('keeps a sleeping dwelling from producing; an awake one produces', () => {
    const levelUps = (hutColumn: number) => {
      let s = world([{ room: 1, x: hutColumn, symbol: 'goblinMageHut' }])
      let sounds = 0
      for (let i = 0; i < 1500; i++) {
        s = stepSim(s, NO_INPUT)
        sounds += s.events.filter((e) => e.kind === 'sound' && e.name === 'level_up').length
        s = { ...s, actors: s.actors.filter((a) => a.def !== 'goblinMage' && a.def !== 'spell') }
      }
      return sounds
    }
    expect(levelUps(columnAt(SLEEP + 40))).toBe(0)
    expect(levelUps(columnAt(WAKE - 40))).toBeGreaterThan(0)
  })

  it('puts Merlin in nav mode only while no awake hostile is within navModeClearRadius', () => {
    expect(run(world([{ room: 1, x: columnAt(rules.navModeClearRadius + 40), symbol: 'goblinWarrior' }]), 2).navMode).toBe(true)
    expect(run(world([{ room: 1, x: columnAt(WAKE - 40), symbol: 'goblinWarrior' }]), 2).navMode).toBe(false)
  })

  it('lets Merlin walk into the next room past living hostiles, without exit events', () => {
    let s = world([{ room: 1, x: 18, symbol: 'goblinWarrior' }, { room: 2, x: 9, symbol: 'goblinWarrior' }], { x: ROOM_W - 40, y: 40 })
    const events: string[] = []
    for (let i = 0; i < 30; i++) {
      s = stepSim(s, { ...NO_INPUT, move: { x: 1, y: 0 } })
      events.push(...s.events.map((e) => e.kind))
    }
    expect(playerOf(s).pos.x).toBeGreaterThan(ROOM_W)
    expect(s.room).toEqual({ x: 2, y: 1 })
    expect(events).not.toContain('exitsOpened')
    expect(ofDef(s, 'goblinWarrior')).toHaveLength(2)
  })

  it('switches music when Merlin crosses into a room with a music tile', () => {
    let s = world([{ room: 2, x: 9, symbol: 'music' }], { x: ROOM_W - 20, y: ROW_Y })
    const music: unknown[] = []
    for (let i = 0; i < 20; i++) {
      s = stepSim(s, { ...NO_INPUT, move: { x: 1, y: 0 } })
      music.push(...s.events.filter((e) => e.kind === 'music'))
    }
    expect(music).toHaveLength(1)
  })

  it('stops Merlin at the map edge', () => {
    const s = run(world([], { x: 2 * ROOM_W - 40, y: ROW_Y }), 30, { ...NO_INPUT, move: { x: 1, y: 0 } })
    expect(playerOf(s).pos.x).toBeLessThan(2 * ROOM_W)
  })
})

describe('Space in a continuous world (targets on screen only)', () => {
  // a narrow 200 px view so both goblins stay awake and close: it shows x 460..660 around Merlin at 560
  const cfg = { ...DEFAULT_SIM_CONFIG, view: { w: 200, h: 288 } }
  const MERLIN = { x: 560, y: ROW_Y }
  const OFF_SCREEN = { room: 2 as const, x: 4, symbol: 'goblinWarrior' } // x 688: 128 px away, right of the view
  const ON_SCREEN = { room: 1 as const, x: 16, row: 1, symbol: 'goblinWarrior' } // (496, 16): about 143 px away
  const holdSpace: InputSnapshot = { ...NO_INPUT, shootNearest: true }
  function releasedAt(s: SimState): { x: number; y: number } | null {
    s = stepSim(s, holdSpace, cfg)
    s = stepSim(s, NO_INPUT, cfg)
    return s.actors.find((a) => a.def === 'spell')!.targetPoint
  }

  it('fires at the nearest enemy on screen, not a nearer one off screen', () => {
    const s = world([OFF_SCREEN, ON_SCREEN], MERLIN)
    const onScreen = ofDef(s, 'goblinWarrior').find((g) => g.pos.x < 600)!
    const target = releasedAt(s)!
    expect(Math.abs(target.x - onScreen.pos.x)).toBeLessThan(8)
    expect(Math.abs(target.y - onScreen.pos.y)).toBeLessThan(8)
  })

  it('fires straight ahead when no enemy is on screen', () => {
    expect(releasedAt(world([OFF_SCREEN], MERLIN))).toEqual({ x: MERLIN.x + 100, y: MERLIN.y })
  })
})
