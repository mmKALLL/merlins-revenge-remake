import { describe, expect, it } from 'vitest'
import type { InputSnapshot, SimState, WorldMode } from '../sim/state'
import { anims } from '../sim/test-data'
import { stepSim } from '../sim/tick'
import { InputLog, deserializeSim, parseSnapshot, serializeSim, type LoggedInput } from './sim-snapshot'
import { pageDataHash, pageDefs, pageTeams, startSimOnMap } from './snapshot-test-data'

const MAP = 'combat_test'
const SEED = 12345
const TICKS = 300

/** A fixed script: walk about, charge and fire at the nearest enemy and at a point. */
function scriptedInput(tick: number): InputSnapshot {
  const phase = Math.floor(tick / 40) % 4
  const move = [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: -1 }, { x: -1, y: 0 }][phase]!
  return {
    move,
    mouseWorld: { x: 200 + (tick % 50), y: 120 },
    chargeHeld: tick % 60 >= 45,
    shootNearest: tick % 30 < 20,
    shootShort: false,
  }
}

function run(s: SimState, ticks: number, log?: InputLog): SimState {
  for (let i = 0; i < ticks; i++) {
    const input = scriptedInput(s.tick)
    log?.push(s.tick, input)
    s = stepSim(s, input)
  }
  return s
}

const extras = (log: InputLog) => ({ mapId: MAP, seed: SEED, dataHash: pageDataHash, inputs: log.entries() })

describe.each<WorldMode>(['rooms', 'continuous'])('state snapshot round trip (%s)', (mode) => {
  it('a deserialized sim steps on exactly like the original', () => {
    const log = new InputLog()
    const original = run(startSimOnMap(MAP, SEED, mode), TICKS, log)
    const json = serializeSim(original, extras(log))
    const copy = deserializeSim(json, original.grid, pageDefs, pageTeams, anims)
    expect(serializeSim(copy, extras(log))).toBe(json)

    const a = run(original, TICKS)
    const b = run(copy, TICKS)
    expect(b.tick).toBe(2 * TICKS)
    const empty = new InputLog()
    expect(serializeSim(b, extras(empty))).toBe(serializeSim(a, extras(empty)))
    expect(b.actors).toEqual(a.actors)
  })
})

describe('state snapshot', () => {
  it('keeps -0, NaN and Infinity exact', () => {
    const s = startSimOnMap(MAP, SEED)
    const player = { ...s.actors[0]!, vel: { x: -0, y: Number.NaN }, cooldown: Number.POSITIVE_INFINITY }
    const json = serializeSim({ ...s, actors: [player] }, { mapId: MAP, seed: SEED, dataHash: '' })
    const back = parseSnapshot(json).actors[0]!
    expect(Object.is(back.vel.x, -0)).toBe(true)
    expect(back.vel.y).toBeNaN()
    expect(back.cooldown).toBe(Number.POSITIVE_INFINITY)
  })

  it('rejects another version and unknown actor definitions', () => {
    const s = startSimOnMap(MAP, SEED)
    const snap = parseSnapshot(serializeSim(s, { mapId: MAP, seed: SEED, dataHash: '' }))
    expect(() => parseSnapshot({ ...snap, version: 99 })).toThrow(/version 99/)
    const renamed = { ...snap, actors: snap.actors.map((a) => ({ ...a, def: 'noSuchActor' })) }
    expect(() => deserializeSim(renamed, s.grid, pageDefs, pageTeams, anims)).toThrow(/noSuchActor/)
  })

  it('keeps the last inputs, oldest first', () => {
    const log = new InputLog(3)
    const input = scriptedInput(0)
    for (let tick = 0; tick < 5; tick++) log.push(tick, input)
    expect(log.entries().map((e: LoggedInput) => e.tick)).toEqual([2, 3, 4])
  })
})
