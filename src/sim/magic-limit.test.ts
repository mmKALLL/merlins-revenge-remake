// Magic limiters (objMagicLimit; docs/notes/engine-mechanics-spells.md "Magic limiters"): while one is
// in play, the #limitMagic spells charge to its percentage of their max; leaving its room lifts it.
import { describe, expect, it } from 'vitest'
import { DEFAULT_MAGIC_LIMIT, magicLimitAfter } from '../mr-open/mr-magic-limit'
import type { MapDefinition } from '../mr-open/mr-map-format'
import { addWeapon } from '../mr-open/mr-weapons'
import { chargeLimits } from '../mr-open/mr-spell'
import { createActor, defOf, playerOf, playerStatsOf } from './actors'
import { NO_INPUT, type ActorState, type InputSnapshot, type SimState, type WorldMode } from './state'
import { anims, defs, teams } from './test-data'
import { createSim, stepSim } from './tick'
import { buildWorldGrid } from './world-grid'

const SYMBOLS = ['none', 'magicLimit50', 'goblinWarrior']
const WALL = 1
const LIMITER_TILE = { x: 3, y: 1 } // on the room's top wall, as the test maps place them
const PLAYER = { x: 100, y: 4 * 32 + 16 }
const RIGHT: InputSnapshot = { ...NO_INPUT, move: { x: 1, y: 0 } }
const LEFT: InputSnapshot = { ...NO_INPUT, move: { x: -1, y: 0 } }
const HALF = 50

/** Three 18x9 rooms walled at the top, a 50 % limiter on room 1's wall and a goblin in room 3 (so the map is not complete). */
function world(mode: WorldMode = 'rooms'): SimState {
  const fill = (v: number) => Array.from({ length: 9 }, () => Array<number>(18).fill(v))
  const walls = fill(0)
  walls[0]!.fill(WALL)
  const room1 = fill(0)
  room1[LIMITER_TILE.y - 1]![LIMITER_TILE.x - 1] = SYMBOLS.indexOf('magicLimit50') + 1
  const room3 = fill(0)
  room3[4]![9] = SYMBOLS.indexOf('goblinWarrior') + 1
  const map: MapDefinition = {
    mapSize: { x: 3, y: 1 }, roomSize: { x: 18, y: 9 }, startRoom: { x: 1, y: 1 },
    layers: [{ name: 'backgroundPassive', tileSet: 'p' }, { name: 'backgroundActive', tileSet: 'a' }, { name: 'objects', tileSet: 'o' }],
    rooms: [room1, fill(0), room3].map((objects, i) => ({ num: i + 1, layers: { backgroundActive: walls, backgroundPassive: fill(1), objects } })),
  }
  return createSim(buildWorldGrid(map, (tile) => tile === WALL, SYMBOLS), defs, teams, anims, 1, PLAYER, mode)
}

const limiters = (s: SimState): ActorState[] => s.actors.filter((a) => a.def === 'magicLimit50')
const playerSpell = (s: SimState): ActorState | undefined => s.actors.find((a) => a.def === 'spell' && a.ownerId === s.playerId)
const chargeHeld: InputSnapshot = { ...NO_INPUT, chargeHeld: true, mouseWorld: { x: 400, y: PLAYER.y } }

/** Merlin's spell after holding the charge long enough to fill it. */
function fullCharge(s: SimState): ActorState {
  for (let i = 0; i < 120; i++) s = stepSim(s, chargeHeld)
  return playerSpell(s)!
}

function stepUntil(s: SimState, input: InputSnapshot, done: (s: SimState) => boolean, limit = 300): SimState {
  for (let i = 0; i < limit && !done(s); i++) s = stepSim(s, input)
  return s
}

describe('magicLimitMaster', () => {
  it('the last limiter created sets the limit; any one finishing resets it to the default', () => {
    expect(magicLimitAfter(DEFAULT_MAGIC_LIMIT, [], [25, 75])).toBe(75)
    expect(magicLimitAfter(25, [25], [])).toBe(DEFAULT_MAGIC_LIMIT)
    expect(magicLimitAfter(25, [], [])).toBe(25)
  })
})

describe('magic limiters in play', () => {
  it('a limiter spawns on a solid tile (createOnSolid) as a prop: the room is clear and the limit is its percentage', () => {
    const s = world()
    expect(limiters(s)).toHaveLength(1)
    expect(limiters(s)[0]!.anim).toBe('stand')
    expect(s.exitsOpen).toBe(true)
    expect(s.magicLimit).toBe(HALF)
  })

  it("Merlin's energy blast charges to half its max", () => {
    const s = world()
    const unlimited = chargeLimits(playerStatsOf(s, playerOf(s))).max
    expect(fullCharge(s).charge).toBeCloseTo(unlimited / 2)
  })

  it('a spell without limitMagic (the dark blast) charges to its full max', () => {
    const s0 = world()
    expect(defs['darkBlast']!.attack.limitMagic).toBe(false)
    const s: SimState = { ...s0, arsenal: { ...addWeapon(s0.arsenal, 'darkBlast', defs['darkBlast']!.attack), current: 'darkBlast' } }
    const unlimited = chargeLimits(playerStatsOf(s, playerOf(s))).max
    expect(fullCharge(s).charge).toBeCloseTo(unlimited)
  })

  it("a friendly wizard's energy blast charges to half its max", () => {
    let s = world()
    for (const [key, pos] of [['berlinInGame', { x: 200, y: PLAYER.y }], ['goblinWarrior', { x: 480, y: PLAYER.y }]] as const) {
      const [a, next] = createActor(s, key, pos)
      s = { ...next, actors: [...next.actors, a] }
    }
    const berlin = s.actors.find((a) => a.def === 'berlinInGame')!
    s = stepUntil(s, NO_INPUT, (n) => n.actors.some((a) => a.def === 'spell' && a.ownerId === berlin.id))
    const spell = s.actors.find((a) => a.def === 'spell' && a.ownerId === berlin.id)!
    const def = defOf(s, berlin)
    expect(def.attack.limitMagic).toBe(true)
    expect(spell.chargeMax).toBeCloseTo(chargeLimits(def).max / 2)
  })

  it("leaving the limiter's room lifts the limit, coming back restores it", () => {
    let s = stepUntil(world(), RIGHT, (n) => n.room.x === 2)
    expect(s.magicLimit).toBe(DEFAULT_MAGIC_LIMIT)
    s = stepUntil(s, LEFT, (n) => n.room.x === 1)
    expect(limiters(s)).toHaveLength(1)
    expect(s.magicLimit).toBe(HALF)
  })

  it('in a continuous world the limit follows the room Merlin walks into', () => {
    let s = world('continuous')
    expect(s.magicLimit).toBe(HALF)
    s = stepUntil(s, RIGHT, (n) => n.room.x === 2)
    expect(s.magicLimit).toBe(DEFAULT_MAGIC_LIMIT)
  })
})
