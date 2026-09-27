// Deaths around the continuous world's sleep transitions (regression: an enemy froze in place, became
// unhittable and left no grave). Every death must run die -> dead -> finish with a grave, however
// it lines up with falling asleep, an idle wander, a detour pause, an attack or a world mode switch.
import { describe, expect, it } from 'vitest'
import type { ActorDef } from '../mr-open/mr-actor-data'
import type { MapDefinition } from '../mr-open/mr-map-format'
import { isAlive } from './actors'
import { NO_INPUT, type ActorState, type InputSnapshot, type SimState } from './state'
import { anims, defs, teams } from './test-data'
import { createSim, stepSim } from './tick'
import { buildWorldGrid } from './world-grid'
import { switchWorldMode } from './world-mode'

const SYMBOLS = ['none', 'goblinWarrior', 'garTower']
const tileOf = (symbol: string) => SYMBOLS.indexOf(symbol) + 1
const ROOM_W = 18 * 32
const ROW_Y = 144
const PLAYER = { x: 100, y: ROW_Y }
const rules = defs['player']!
const KILL: InputSnapshot = { ...NO_INPUT, cheatKillAll: true }

/** Two open 18x9 rooms side by side with one object on row 5 at world tile column `column`. */
function world(symbol: string, column: number, defsFor: Record<string, ActorDef> = defs): SimState {
  const fill = (v: number) => Array.from({ length: 9 }, () => Array(18).fill(v))
  const obj = [fill(0), fill(0)]
  obj[column > 18 ? 1 : 0]![4]![(column - 1) % 18] = tileOf(symbol)
  const map: MapDefinition = {
    mapSize: { x: 2, y: 1 }, roomSize: { x: 18, y: 9 }, startRoom: { x: 1, y: 1 },
    layers: [{ name: 'backgroundPassive', tileSet: 'p' }, { name: 'backgroundActive', tileSet: 'a' }, { name: 'objects', tileSet: 'o' }],
    rooms: [1, 2].map((num) => ({ num, layers: { backgroundActive: fill(1), backgroundPassive: fill(1), objects: obj[num - 1]! } })),
  }
  return createSim(buildWorldGrid(map, () => false, SYMBOLS), defsFor, teams, anims, 1, PLAYER, 'continuous')
}

/** Tile column whose centre is about `px` right of Merlin. */
const columnAt = (px: number) => Math.floor((PLAYER.x + px) / 32) + 1
const enemyOf = (s: SimState): ActorState | undefined => s.actors.find((a) => a.id !== s.playerId && (a.def === 'goblinWarrior' || a.def === 'garTower'))
const graves = (s: SimState) => Object.values(s.rooms).flatMap((r) => r.graves)
const withActor = (s: SimState, id: number, over: Partial<ActorState>): SimState => ({
  ...s, actors: s.actors.map((a) => (a.id === id ? { ...a, ...over, ai: { ...a.ai, ...over.ai } } : a)),
})
const movePlayer = (s: SimState, x: number): SimState => withActor(s, s.playerId, { pos: { x, y: ROW_Y }, prevPos: { x, y: ROW_Y } })

/** Steps until the enemy has gone (or `limit` ticks); returns the state. */
function untilGone(s: SimState, limit = 120, input: InputSnapshot = NO_INPUT): SimState {
  for (let i = 0; i < limit && enemyOf(s); i++) s = stepSim(s, input)
  return s
}

/** The enemy's death finished: it left the actors and recorded its grave. */
function expectDeathFinished(s: SimState): void {
  const left = enemyOf(s)
  expect(left, left && `stuck in ${left.mode}, energy ${left.energy}, awake ${left.awake}, ai ${left.ai.mode}`).toBeUndefined()
  expect(graves(s)).toHaveLength(1)
}

/** Charges a blast at `aim` and releases it, then steps until it explodes. */
function blast(s: SimState, aim: { x: number; y: number }): SimState {
  for (let i = 0; i < 6; i++) s = stepSim(s, { ...NO_INPUT, chargeHeld: true, mouseWorld: aim })
  s = stepSim(s, { ...NO_INPUT, mouseWorld: aim })
  for (let i = 0; i < 60 && !s.events.some((e) => e.kind === 'explode'); i++) s = stepSim(s, NO_INPUT)
  return s
}

describe('deaths around falling asleep (continuous world)', () => {
  it('K kills a sleeping goblin: it wakes, dies and leaves a grave', () => {
    const s = world('goblinWarrior', columnAt(rules.sleepDistance + 20))
    expect(enemyOf(s)!.awake).toBe(false)
    expectDeathFinished(untilGone(stepSim(s, KILL)))
  })

  it('a blast kills a sleeping goblin: it wakes, dies and leaves a grave', () => {
    let s = world('goblinWarrior', columnAt(rules.wakeDistance + 30))
    const g = enemyOf(s)!
    s = withActor(s, g.id, { energy: 1 })
    expect(enemyOf(s)!.awake).toBe(false)
    s = blast(s, g.pos)
    expect(enemyOf(s)?.mode ?? 'gone').not.toBe('stand')
    expectDeathFinished(untilGone(s))
  })

  it('a goblin killed on the tick it would fall asleep still dies', () => {
    let s = world('goblinWarrior', columnAt(rules.sleepDistance + 20))
    s = withActor(s, enemyOf(s)!.id, { awake: true, wakeHold: 0 })
    s = stepSim(s, KILL)
    expect(enemyOf(s)!.mode).toBe('die')
    expectDeathFinished(untilGone(s))
  })

  it('a dying goblin is not put to sleep when Merlin moves away', () => {
    let s = world('goblinWarrior', columnAt(rules.wakeDistance - 40))
    s = stepSim(s, KILL)
    expect(enemyOf(s)!.mode).toBe('die')
    s = movePlayer(s, 2 * ROOM_W - 20) // far beyond sleepDistance at once
    expectDeathFinished(untilGone(s))
  })

  it('a goblin killed while walking an idle wander dies', () => {
    let s = world('goblinWarrior', columnAt(rules.sleepDistance + 20))
    const g = enemyOf(s)!
    s = withActor(s, g.id, { ai: { ...g.ai, mode: 'idleWander', wanderGoal: { x: g.pos.x + 30, y: g.pos.y } } })
    s = stepSim(s, NO_INPUT)
    expect(enemyOf(s)!.ai.mode).toBe('idleWander')
    expectDeathFinished(untilGone(stepSim(s, KILL)))
  })

  it('a goblin killed during its detour pause dies', () => {
    const forced = { ...defs, goblinWarrior: { ...defs['goblinWarrior']!, detourChance: 1 } }
    let s = world('goblinWarrior', columnAt(rules.wakeDistance - 40), forced)
    const g = enemyOf(s)!
    s = withActor(s, g.id, { mode: 'walk', ai: { ...g.ai, mode: 'detourPause', detourTicks: 20 } })
    s = stepSim(s, NO_INPUT)
    expect(enemyOf(s)!.ai.mode).toBe('detourPause')
    s = withActor(s, g.id, { energy: 1 })
    expectDeathFinished(untilGone(blast(s, enemyOf(s)!.pos)))
  })
})

describe('deaths of reel-proof units mid-attack', () => {
  it('a tower blasted to death during its attack strip dies with a grave', () => {
    let s = world('garTower', columnAt(120))
    const t0 = enemyOf(s)!
    // wait for the attack strip, then weaken it so the blast kills it mid-attack
    for (let i = 0; i < 200 && enemyOf(s)!.ai.mode !== 'attack'; i++) s = stepSim(s, { ...NO_INPUT, cheatHeal: true })
    expect(enemyOf(s)!.ai.mode).toBe('attack')
    s = withActor(s, t0.id, { energy: 1 })
    const aim = enemyOf(s)!.pos
    // a short charge so the blast lands while the strip still runs
    s = stepSim(s, { ...NO_INPUT, chargeHeld: true, mouseWorld: aim })
    s = stepSim(s, { ...NO_INPUT, mouseWorld: aim })
    // keep it in its attack until the blast lands, so the lethal hit comes mid-attack
    for (let i = 0; i < 60 && isAlive(enemyOf(s)!); i++) {
      s = stepSim(s, NO_INPUT)
      const tower = enemyOf(s)!
      if (tower.ai.mode !== 'attack' && isAlive(tower)) s = withActor(s, t0.id, { ai: { ...tower.ai, mode: 'attack' }, mode: 'weaponRanged' })
    }
    expect(isAlive(enemyOf(s)!)).toBe(false)
    expectDeathFinished(untilGone(s, 120, { ...NO_INPUT, cheatHeal: true }))
  })
})

describe('deaths across a world mode switch', () => {
  it('a goblin dying in Merlin\'s room keeps dying through rooms and back to continuous', () => {
    let s = world('goblinWarrior', columnAt(rules.wakeDistance - 40))
    s = stepSim(s, KILL)
    expect(enemyOf(s)!.mode).toBe('die')
    s = switchWorldMode(switchWorldMode(s, 'rooms'), 'continuous')
    expectDeathFinished(untilGone(s))
  })
})

describe('dying units stored by a switch to rooms', () => {
  it('a goblin dying in another room is stored with its room and finishes when the world is continuous again', () => {
    let s = movePlayer(world('goblinWarrior', 20), ROOM_W - 40)
    s = stepSim(s, KILL)
    const g = enemyOf(s)!
    expect(g.mode).toBe('die')
    const rooms = switchWorldMode(s, 'rooms')
    expect(rooms.rooms['2,1']!.actors.map((a) => a.id)).toContain(g.id)
    expectDeathFinished(untilGone(switchWorldMode(rooms, 'continuous')))
  })
})

describe('units stored mid-action and restored in a continuous world', () => {
  it('a goblin stored mid-attack is not put to sleep on its attack strip', () => {
    let s = world('goblinWarrior', 20)
    const g = enemyOf(s)!
    s = switchWorldMode(s, 'rooms')
    const key = '2,1'
    const stored = s.rooms[key]!.actors.map((a) => (a.id === g.id ? { ...a, mode: 'weaponMelee' as const, ai: { ...a.ai, mode: 'attack' as const } } : a))
    s = switchWorldMode({ ...s, rooms: { ...s.rooms, [key]: { ...s.rooms[key]!, actors: stored } } }, 'continuous')
    for (let i = 0; i < 60; i++) s = stepSim(s, NO_INPUT)
    const after = enemyOf(s)!
    expect(after.mode === 'walk' || after.mode === 'stand').toBe(true)
    expect(after.awake).toBe(false)
  })
})

describe('dying sleepers from a loaded state', () => {
  it('a sleeper in its death modes still finishes with a grave', () => {
    for (const mode of ['die', 'dead'] as const) {
      let s = world('goblinWarrior', columnAt(rules.sleepDistance + 20))
      s = withActor(s, enemyOf(s)!.id, { mode, energy: -1, awake: false })
      expectDeathFinished(untilGone(s))
    }
  })

  it('a sleeper out of energy dies with a grave', () => {
    let s = world('goblinWarrior', columnAt(rules.sleepDistance + 20))
    s = withActor(s, enemyOf(s)!.id, { energy: 0, awake: false })
    expectDeathFinished(untilGone(s))
  })
})
