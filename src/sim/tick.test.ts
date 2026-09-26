import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ActorDef } from '../mr-open/mr-actor-data'
import type { MapDefinition } from '../mr-open/mr-map-format'
import type { TeamDef } from '../mr-open/mr-team-data'
import { collisionRectFor, spawnRoomActors } from './actors'
import { createSim, findStartPos, stepSim } from './tick'
import { DEFAULT_SIM_CONFIG, NO_INPUT, roomKey, type SimState } from './state'
import { buildWorldGrid } from './world-grid'

// expectations below were derived for a 30x30 collision box
const CFG30 = { ...DEFAULT_SIM_CONFIG, collisionRect: { left: -15, top: -15, right: 15, bottom: 15 } }

const SOLID = 2
// objects tileset: index i+1 -> OBJECT_SYMBOLS[i]
const OBJECT_SYMBOLS = ['none', 'stones1', 'player', 'goblinWarrior', 'goblinArcher', 'magicPortal', 'goblinSword']
const PLAYER = 3
const GOBLIN = 4
const ARCHER = 5
const UNKNOWN = 6 // no def
const UNSUPPORTED = 7 // def exists but objType is not spawnable from the map

/**
 * Two 18x9 rooms side by side. `solidCol` fills that 1-based column of room 1's active layer with SOLID;
 * `playerAt` puts a PLAYER tile in room 1's objects layer; `objects` places other object tiles by room.
 */
function openMap(opts: {
  solidCol?: number
  playerAt?: { x: number; y: number }
  objects?: { room: number; x: number; y: number; tile: number }[]
} = {}): MapDefinition {
  const fill = (v: number) => Array.from({ length: 9 }, () => Array(18).fill(v))
  const active = fill(1)
  if (opts.solidCol) for (const row of active) row[opts.solidCol - 1] = SOLID
  const objects = [fill(0), fill(0)]
  if (opts.playerAt) objects[0]![opts.playerAt.y - 1]![opts.playerAt.x - 1] = PLAYER
  for (const o of opts.objects ?? []) objects[o.room - 1]![o.y - 1]![o.x - 1] = o.tile
  const rooms = [1, 2].map((num) => ({
    num,
    layers: { backgroundActive: num === 1 ? active : fill(1), backgroundPassive: fill(1), objects: objects[num - 1]! },
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
const grid = (map: MapDefinition = openMap()) => buildWorldGrid(map, isSolid, OBJECT_SYMBOLS)

// Minimal resolved actor definitions: only the fields this slice reads, plus a raw bag.
function def(over: Partial<ActorDef> & Pick<ActorDef, 'key' | 'name' | 'objType' | 'team'>): ActorDef {
  return {
    aiType: null, layerZ: 'gGameObjectLayer', startOffset: { x: -16, y: -16 }, energy: 100, energyRecoverDelay: 300,
    friction: { x: 50, y: 50 }, frictionReel: { x: 10, y: 10 }, inertia: 0, damageSpeed: 5, walkSpeed: 0,
    walkAcceleration: 0.5, strength: 1, agility: 1, dexterity: 1, eyestrain: 0, mana_burst: 1, mana_capacity: 10,
    mana_flow: 1, mana_regeneration: 1, weapon: null, experienceImWorth: 0,
    attack: {
      name: 'none', type: 'none', animType: 'none', animFrame: 2, collisionLoc: { x: 25, y: 0 }, idealAttackLoc: { x: 25, y: 0 },
      reach: 25, cooldown: 0, power: { x: 5, y: -1 }, damageMultiplier: 1, bullet: null, firingType: 'proportional',
      hits: ['teamMembers'], chargeStart: 1, chargeMax: 5, chargeMaxBasic: 0, chargeMaxModifier: 1, chargeSpeed: 1,
      chargeSize: 1, chargeExplodeFactor: 4, chargeColour: { r: 255, g: 255, b: 255 }, spellSpeed: 2, limitMagic: false,
      sound: null, releaseSound: null, explodeSound: null,
    },
    raw: {},
    ...over,
  }
}
const defs: Record<string, ActorDef> = {
  player: def({ key: 'player', name: 'mer', objType: 'objPlayerMerlinCharacter', aiType: 'objAiPlayer', team: 'aldevar', energy: 200, walkAcceleration: 2, energyRecoverDelay: 30 }),
  goblinWarrior: def({ key: 'goblinWarrior', name: 'goblinWarrior', objType: 'objCPUCharacter', aiType: 'objAiCPU', team: 'goblins', walkSpeed: 4, inertia: 30 }),
  goblinArcher: def({ key: 'goblinArcher', name: 'gar', objType: 'objCPUCharacter', aiType: 'objAiCPU', team: 'goblins', walkSpeed: 3 }),
  goblinSword: def({ key: 'goblinSword', name: 'goblinSword', objType: 'objPowerUp', team: 'chatters' }),
}
const teams: Record<string, TeamDef> = {
  aldevar: { key: 'aldevar', teamName: 'aldevar', category: 'friends', hates: [['goblins']], friends: [] },
  goblins: { key: 'goblins', teamName: 'goblins', category: 'enemies', hates: [['aldevar']], friends: [] },
}
const anims = {
  mer: { walk: { frames: 8, delay: 3, w: 16, h: 16 } },
  goblinWarrior: { stand: { frames: 1, delay: 2, w: 15, h: 16 }, walk: { frames: 6, delay: 3, w: 15, h: 20 } },
  gar: { stand: { frames: 1, delay: 3, w: 16, h: 16 }, walk: { frames: 6, delay: 3, w: 16, h: 16 } },
}
const make = (map: MapDefinition = openMap(), start = { x: 100, y: 100 }) => createSim(grid(map), defs, teams, anims, 1, start)
const input = (x: number, y: number) => ({ ...NO_INPUT, move: { x, y } })
const player = (s: SimState) => s.actors[s.playerId]!
const withPlayerAt = (s: SimState, pos: { x: number; y: number }): SimState => ({
  ...s,
  actors: s.actors.map((a) => (a.id === s.playerId ? { ...a, pos, prevPos: pos } : a)),
})

describe('createSim', () => {
  it('makes the player actor 0 from the player def', () => {
    const s = make()
    const p = player(s)
    expect(s.playerId).toBe(0)
    expect(p.id).toBe(0)
    expect(p.def).toBe('player')
    expect(p.team).toBe('aldevar')
    expect(p.energy).toBe(200)
    expect(p.pos).toEqual({ x: 100, y: 100 })
    expect(p.ai.mode).toBe('none')
    expect(s.actors).toHaveLength(1)
    expect(s.room).toEqual({ x: 1, y: 1 })
    expect(s.rng).toEqual({ seed: 1 })
  })

  it('throws without a player def', () => {
    expect(() => createSim(grid(), { goblinWarrior: defs['goblinWarrior']! }, teams, anims, 1, { x: 100, y: 100 })).toThrow(/player/)
  })
})

describe('stepSim', () => {
  it('advances position by the velocity and keeps prevPos', () => {
    let s = make()
    s = stepSim(s, input(1, 0), CFG30)
    expect(player(s).prevPos).toEqual({ x: 100, y: 100 })
    expect(player(s).pos.x).toBe(101)
    expect(s.tick).toBe(1)
  })

  it('faces left only on horizontal input and keeps facing on vertical', () => {
    let s = make()
    s = stepSim(s, input(-1, 0), CFG30)
    expect(player(s).facingLeft).toBe(true)
    s = stepSim(s, input(0, 1), CFG30)
    expect(player(s).facingLeft).toBe(true)
    s = stepSim(s, input(1, 0), CFG30)
    expect(player(s).facingLeft).toBe(false)
  })

  it('plays walk while a key is held and stand otherwise, 3 ticks per frame', () => {
    let s = make()
    // tick 1 switches to walk (frame 0, counter 0); frame 1 appears after `delay` more ticks
    for (let i = 0; i < 4; i++) s = stepSim(s, input(0, 1), CFG30)
    expect(player(s).anim).toBe('walk')
    expect(player(s).animFrame).toBe(1)
    s = stepSim(s, NO_INPUT, CFG30)
    expect(player(s).anim).toBe('stand')
  })

  it('sets animLooped on the tick the walk strip wraps', () => {
    let s = make()
    // frame advances every 3 ticks after the switch tick; 8 frames wrap on tick 1 + 3*8
    for (let i = 0; i < 24; i++) s = stepSim(s, input(0, 1), CFG30)
    expect(player(s).animLooped).toBe(false)
    s = stepSim(s, input(0, 1), CFG30)
    expect(player(s).animFrame).toBe(0)
    expect(player(s).animLooped).toBe(true)
    s = stepSim(s, input(0, 1), CFG30)
    expect(player(s).animLooped).toBe(false)
  })

  it('changes room when the reg point crosses the room edge', () => {
    let s = withPlayerAt(make(), { x: 574, y: 100 })
    for (let i = 0; i < 5; i++) s = stepSim(s, input(1, 0), CFG30)
    expect(s.room).toEqual({ x: 2, y: 1 })
    expect(player(s).pos.x).toBeGreaterThanOrEqual(576)
  })

  it('cannot leave the map', () => {
    let s = withPlayerAt(make(), { x: 20, y: 100 })
    for (let i = 0; i < 30; i++) s = stepSim(s, input(-1, 0), CFG30)
    expect(s.room).toEqual({ x: 1, y: 1 })
    expect(player(s).pos.x).toBeGreaterThanOrEqual(15)
  })

  it('zeroes vel.x on a wall hit and keeps vel.y', () => {
    // wall column 5 spans x 128..160; the 30 px rect stops with its right edge at the tile's left edge (127)
    let s = make(openMap({ solidCol: 5 }))
    let hit = false
    for (let i = 0; i < 20; i++) {
      s = stepSim(s, input(1, 1), CFG30)
      if (player(s).vel.x === 0) {
        hit = true
        break
      }
    }
    expect(hit).toBe(true)
    expect(player(s).pos.x).toBe(112)
    expect(player(s).vel.y).toBeGreaterThan(0)
    expect(player(s).pos.y).toBeGreaterThan(100)
  })

  it('stops at walls and the map edge with the shipped 14x14 collision box', () => {
    // wall column 5 has left edge location (5-1)*32 - 1 = 127; rect.right (+7) rests there, so x = 120
    let s = make(openMap({ solidCol: 5 }))
    for (let i = 0; i < 30; i++) s = stepSim(s, input(1, 0), DEFAULT_SIM_CONFIG)
    expect(player(s).pos.x).toBe(120)
    expect(player(s).vel.x).toBe(0)

    // the map's left border has right edge location 0; rect.left (-7) rests there, so x >= 7
    let t = withPlayerAt(make(), { x: 20, y: 100 })
    for (let i = 0; i < 30; i++) t = stepSim(t, input(-1, 0), DEFAULT_SIM_CONFIG)
    expect(t.room).toEqual({ x: 1, y: 1 })
    expect(player(t).pos.x).toBe(7)
  })

  it('keeps the player inside the room at the right edge when exits are closed', () => {
    let s = withPlayerAt({ ...make(), exitsOpen: false }, { x: 540, y: 100 })
    for (let i = 0; i < 30; i++) s = stepSim(s, input(1, 0), CFG30)
    expect(s.room).toEqual({ x: 1, y: 1 })
    expect(player(s).pos.x).toBe(560)
    expect(player(s).vel.x).toBeGreaterThan(0)
  })

  it('does not mutate the previous state', () => {
    const s = make()
    const before = JSON.parse(JSON.stringify({ ...s, grid: undefined }))
    stepSim(s, input(1, 1), CFG30)
    expect(JSON.parse(JSON.stringify({ ...s, grid: undefined }))).toEqual(before)
  })
})

describe('spawnRoomActors', () => {
  afterEach(() => vi.restoreAllMocks())

  it('spawns a goblin warrior at the tile centre with its team, energy and AI mode', () => {
    const s = make(openMap({ objects: [{ room: 1, x: 10, y: 4, tile: GOBLIN }] }))
    expect(s.actors).toHaveLength(2)
    const g = s.actors[1]!
    expect(g.id).toBe(1)
    expect(g.def).toBe('goblinWarrior')
    expect(g.team).toBe('goblins')
    expect(g.energy).toBe(100)
    expect(g.ai.mode).toBe('findTarget')
    expect(g.mode).toBe('walk')
    expect(g.pos).toEqual({ x: 9 * 32 + 16, y: 3 * 32 + 16 })
    expect(g.frictionPercent).toEqual({ x: 50, y: 50 })
    expect(s.rooms[roomKey(s.room)]?.spawned).toBe(true)
  })

  it('skips unknown and unsupported symbols with one warning per key', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const map = openMap({ objects: [
      { room: 1, x: 2, y: 2, tile: UNKNOWN }, { room: 1, x: 3, y: 2, tile: UNKNOWN }, { room: 1, x: 4, y: 2, tile: UNSUPPORTED },
      { room: 1, x: 5, y: 2, tile: ARCHER },
    ] })
    const s = make(map)
    expect(s.actors.map((a) => a.def)).toEqual(['player', 'goblinArcher'])
    const warned = warn.mock.calls.map((c) => String(c[0]))
    expect(warned.filter((w) => w.includes('magicPortal'))).toHaveLength(1)
    expect(warned.filter((w) => w.includes('goblinSword'))).toHaveLength(1)
    // a second sim with the same symbols warns no more
    warn.mockClear()
    make(map)
    expect(warn).not.toHaveBeenCalled()
  })

  it('does not spawn a second player from a player tile', () => {
    const s = make(openMap({ playerAt: { x: 4, y: 3 } }))
    expect(s.actors).toHaveLength(1)
    expect(s.actors[0]!.def).toBe('player')
    // spawning again into an already-spawned room adds nothing either
    const again = spawnRoomActors(s, s.room)
    expect(again.actors).toHaveLength(1)
  })

  it('does not spawn on a solid tile', () => {
    const s = make(openMap({ solidCol: 10, objects: [{ room: 1, x: 10, y: 4, tile: GOBLIN }] }))
    expect(s.actors).toHaveLength(1)
  })

  it('spawns the next room on entry, stores survivors on exit and restores them by id on return', () => {
    const map = openMap({ objects: [{ room: 1, x: 2, y: 2, tile: GOBLIN }, { room: 2, x: 10, y: 4, tile: ARCHER }] })
    let s = withPlayerAt(make(map), { x: 574, y: 100 })
    expect(s.actors.map((a) => a.def)).toEqual(['player', 'goblinWarrior'])
    const goblinId = s.actors[1]!.id
    for (let i = 0; i < 5; i++) s = stepSim(s, input(1, 0), CFG30)
    expect(s.room).toEqual({ x: 2, y: 1 })
    expect(s.actors.map((a) => a.def)).toEqual(['player', 'goblinArcher'])
    expect(s.actors[1]!.id).not.toBe(goblinId)
    expect(s.rooms['1,1']!.actors.map((a) => a.id)).toEqual([goblinId])
    const archerId = s.actors[1]!.id
    // back to room 1: the same goblin comes back, nothing is spawned again
    for (let i = 0; i < 20; i++) s = stepSim(s, input(-1, 0), CFG30)
    expect(s.room).toEqual({ x: 1, y: 1 })
    expect(s.actors.map((a) => a.id)).toEqual([s.playerId, goblinId])
    expect(s.rooms['1,1']!.actors).toEqual([])
    expect(s.rooms['2,1']!.actors.map((a) => a.id)).toEqual([archerId])
    expect(s.nextId).toBe(3)
  })
})

describe('collisionRectFor', () => {
  it('uses the frame size of the actor’s current strip', () => {
    const s = make(openMap({ objects: [{ room: 1, x: 10, y: 4, tile: GOBLIN }] }))
    const g = s.actors[1]!
    expect(g.anim).toBe('stand')
    // stand 15x16: rect(-7.5,-8,7.5,8) inflated by -1
    expect(collisionRectFor(s, g)).toEqual({ left: -6.5, top: -7, right: 6.5, bottom: 7 })
    expect(collisionRectFor(s, { ...g, anim: 'walk' })).toEqual({ left: -6.5, top: -9, right: 6.5, bottom: 9 })
  })

  it('falls back to stand for a strip the atlas lacks', () => {
    const s = make(openMap({ objects: [{ room: 1, x: 10, y: 4, tile: GOBLIN }] }))
    expect(collisionRectFor(s, { ...s.actors[1]!, anim: 'reel' })).toEqual(collisionRectFor(s, s.actors[1]!))
  })
})

describe('findStartPos', () => {
  it('returns the centre of the player tile when present', () => {
    const g = grid(openMap({ playerAt: { x: 4, y: 3 } }))
    expect(findStartPos(g, PLAYER)).toEqual({ x: 3 * 32 + 16, y: 2 * 32 + 16 })
  })

  it('falls back to the start room centre without a player tile', () => {
    expect(findStartPos(grid(), PLAYER)).toEqual({ x: 288, y: 144 })
    expect(findStartPos(grid(openMap({ playerAt: { x: 4, y: 3 } })), null)).toEqual({ x: 288, y: 144 })
  })
})
