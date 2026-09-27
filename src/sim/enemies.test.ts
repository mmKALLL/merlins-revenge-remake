// Integration tests for the enemy slice (docs/notes/engine-mechanics-enemies-2.md): the orcs'
// multi-frame attacks, the goblin mage's spell casting and kiting, and dwellings. Engine data from
// assets/actors (no tuning) and the converted atlases in public/generated/sprites (pnpm assets:convert).
import { describe, expect, it } from 'vitest'
import type { MapDefinition } from '../mr-open/mr-map-format'
import { playerOf } from './actors'
import { NO_INPUT, type ActorState, type InputSnapshot, type SimState } from './state'
import { anims, defs, teams } from './test-data'
import { createSim, stepSim } from './tick'
import { buildWorldGrid } from './world-grid'

const SYMBOLS = ['none', 'player', 'bowOrc', 'swordOrc', 'goblinMage', 'goblinHut', 'goblinMageHut', 'orcHouse', 'goblinWarrior', 'hydra3', 'plant', 'bat', 'darkGolem', 'fourArmGolem', 'ninja', 'necromancer', 'monk']
const tileOf = (symbol: string) => SYMBOLS.indexOf(symbol) + 1

/**
 * One open 18x9 room with the given objects (1-based tiles), above a second room holding a goblin
 * warrior: while that room is unvisited the map is not clear, so a room without hostiles does not
 * complete the map and still its units (map-complete.ts).
 */
function openMap(objects: { x: number; y: number; symbol: string }[]): MapDefinition {
  const fill = (v: number) => Array.from({ length: 9 }, () => Array(18).fill(v))
  const obj = fill(0)
  for (const o of objects) obj[o.y - 1]![o.x - 1] = tileOf(o.symbol)
  const guarded = fill(0)
  guarded[4]![8] = tileOf('goblinWarrior')
  return {
    mapSize: { x: 1, y: 2 }, roomSize: { x: 18, y: 9 }, startRoom: { x: 1, y: 1 },
    layers: [{ name: 'backgroundPassive', tileSet: 'p' }, { name: 'backgroundActive', tileSet: 'a' }, { name: 'objects', tileSet: 'o' }],
    rooms: [
      { num: 1, layers: { backgroundActive: fill(1), backgroundPassive: fill(1), objects: obj } },
      { num: 2, layers: { backgroundActive: fill(1), backgroundPassive: fill(1), objects: guarded } },
    ],
  }
}

function sim(objects: { x: number; y: number; symbol: string }[], playerPos = { x: 100, y: 144 }, seed = 1): SimState {
  return createSim(buildWorldGrid(openMap(objects), () => false, SYMBOLS), defs, teams, anims, seed, playerPos)
}
const ofDef = (s: SimState, key: string): ActorState[] => s.actors.filter((a) => a.def === key)
/** Keeps the player standing still, full of energy, and unhurt by pushes (a target dummy). */
const pinPlayer = (s: SimState, pos = { x: 100, y: 144 }): SimState => ({
  ...s, actors: s.actors.map((a) => (a.id === s.playerId ? { ...a, pos, prevPos: pos, knockback: { x: 0, y: 0 }, energy: 200 } : a)),
})
function run(s: SimState, ticks: number, each: (s: SimState) => SimState = (x) => x, input: InputSnapshot = NO_INPUT): SimState {
  for (let i = 0; i < ticks; i++) s = each(stepSim(s, input))
  return s
}

describe('orc archer (crossBow animframe [2,4,6])', () => {
  it('fires three bolts per weaponRanged strip', () => {
    let s = sim([{ x: 6, y: 5, symbol: 'bowOrc' }])
    let bolts = new Set<number>()
    let strips = 0
    for (let i = 0; i < 200 && strips < 2; i++) {
      const was = ofDef(s, 'bowOrc')[0]!.mode
      s = pinPlayer(stepSim(s, NO_INPUT))
      for (const b of ofDef(s, 'crossBolt')) bolts.add(b.id)
      if (was === 'weaponRanged' && ofDef(s, 'bowOrc')[0]!.mode !== 'weaponRanged') strips++
    }
    expect(strips).toBe(2)
    expect(bolts.size).toBe(6)
  })
})

describe('orc fighter (orcSword animframe [6,10,12], stallSpeed 3)', () => {
  it('lands three hits per swing', () => {
    let s = sim([{ x: 5, y: 5, symbol: 'swordOrc' }])
    let hits = 0
    let swings = 0
    for (let i = 0; i < 300 && swings < 1; i++) {
      const was = ofDef(s, 'swordOrc')[0]!.mode
      s = stepSim(s, NO_INPUT)
      hits += s.events.filter((e) => e.kind === 'hit' && e.id === s.playerId).length
      s = pinPlayer(s)
      if (was === 'weaponMelee' && ofDef(s, 'swordOrc')[0]!.mode !== 'weaponMelee') swings++
    }
    expect(swings).toBe(1)
    expect(hits).toBe(3)
  })
})

describe('goblin mage (objAiCPUSpellCaster)', () => {
  it('charges a goblin-team spell over its head and releases it at the target', () => {
    let s = sim([{ x: 7, y: 5, symbol: 'goblinMage' }])
    let spell: ActorState | undefined
    for (let i = 0; i < 100 && !spell; i++) {
      s = pinPlayer(stepSim(s, NO_INPUT))
      spell = ofDef(s, 'spell').find((a) => a.mode === 'fly')
    }
    expect(spell).toBeDefined()
    expect(spell!.team).toBe('goblins')
    expect(spell!.charge).toBe(12.5) // mana_capacity 10 * 0.75 + 5, like Merlin's
    expect(spell!.targetPoint).toEqual({ x: 100, y: 144 })
    expect(ofDef(s, 'goblinMage')[0]!.mode).toBe('release')
  })

  it('keeps about 100 px from the player', () => {
    let s = sim([{ x: 15, y: 5, symbol: 'goblinMage' }])
    s = run(s, 150, (x) => pinPlayer(x))
    const d = Math.hypot(ofDef(s, 'goblinMage')[0]!.pos.x - 100, ofDef(s, 'goblinMage')[0]!.pos.y - 144)
    expect(d).toBeGreaterThan(90)
    expect(d).toBeLessThan(130)
  })

  it('backs off from Merlin when he comes within 100 px', () => {
    let s = sim([{ x: 6, y: 5, symbol: 'goblinMage' }]) // 76 px away
    const d0 = Math.hypot(ofDef(s, 'goblinMage')[0]!.pos.x - 100, 0)
    s = run(s, 10, (x) => pinPlayer(x))
    const mage = ofDef(s, 'goblinMage')[0]!
    expect(Math.hypot(mage.pos.x - 100, mage.pos.y - 144)).toBeGreaterThan(d0)
  })

  it('does not hurt goblins with its blast', () => {
    let s = sim([{ x: 10, y: 5, symbol: 'goblinMage' }, { x: 4, y: 5, symbol: 'goblinWarrior' }])
    const warrior = ofDef(s, 'goblinWarrior')[0]!.id
    s = run(s, 200, (x) => pinPlayer(x))
    const w = s.actors.find((a) => a.id === warrior)
    expect(w?.energy).toBe(defs['goblinWarrior']!.energy)
  })
})

describe('dwellings (objDwelling + modResidents)', () => {
  it('release their residents on the dwelling, keep the exits shut, and destroy themselves after totalResidents', () => {
    let s = sim([{ x: 15, y: 5, symbol: 'goblinMageHut' }], { x: 40, y: 144 })
    expect(s.exitsOpen).toBe(false)
    const hut = ofDef(s, 'goblinMageHut')[0]!
    const released = new Set<number>()
    let sounds = 0
    let died = -1
    for (let i = 0; i < 2000 && died < 0; i++) {
      s = stepSim(s, NO_INPUT)
      // residents are cleared away as they appear, so the team cap never blocks
      for (const m of ofDef(s, 'goblinMage')) {
        released.add(m.id)
        expect(m.team).toBe('goblins')
      }
      sounds += s.events.filter((e) => e.kind === 'sound' && e.name === 'level_up').length
      s = { ...s, actors: s.actors.filter((a) => a.def !== 'goblinMage' && a.def !== 'spell') }
      if (s.events.some((e) => e.kind === 'died' && e.id === hut.id)) died = i
    }
    expect(released.size).toBe(5) // goblinMageHut #totalResidents: 5
    expect(sounds).toBe(5)
    expect(died).toBeGreaterThan(0)
    s = run(s, 10)
    expect(ofDef(s, 'goblinMageHut')).toHaveLength(0)
    expect(s.rooms['1,1']!.graves.map((g) => g.def)).toContain('goblinMageHut')
    expect(s.exitsOpen).toBe(true)
  })

  it('wait while the whole group would exceed the team cap', () => {
    // goblins cap 16: fill the room with 16 warriors, then no release happens
    const warriors = Array.from({ length: 16 }, (_, i) => ({ x: 2 + (i % 8) * 2, y: i < 8 ? 2 : 8, symbol: 'goblinWarrior' }))
    let s = sim([{ x: 15, y: 5, symbol: 'goblinHut' }, ...warriors], { x: 40, y: 144 })
    const freeze = (x: SimState): SimState => ({ ...x, actors: x.actors.map((a) => (a.def === 'goblinWarrior' && warriors.length ? { ...a, ai: { ...a.ai, mode: 'none' as const } } : a)) })
    s = run(s, 1000, (x) => pinPlayer(freeze(x), { x: 40, y: 144 }))
    expect(ofDef(s, 'goblinWarrior').length + ofDef(s, 'goblinArcher').length).toBe(16)
    expect(ofDef(s, 'goblinHut')[0]!.dwelling!.phase).toBe('awaitPermission')
  })

  it('are hit by the energy blast (teamBuildings) and slide', () => {
    let s = sim([{ x: 8, y: 5, symbol: 'goblinHut' }], { x: 100, y: 144 })
    const hut = ofDef(s, 'goblinHut')[0]!
    const holdE: InputSnapshot = { ...NO_INPUT, shootNearest: true }
    s = run(s, 13, (x) => x, holdE)
    s = run(s, 1)
    const [after] = [run(s, 12)]
    const h = after.actors.find((a) => a.id === hut.id)
    expect(h === undefined || h.energy < defs['goblinHut']!.energy).toBe(true)
    if (h) expect(h.pos).not.toEqual(hut.pos)
  })
})

describe('every spawnable actor', () => {
  const spawnable = Object.values(defs).filter((d) => (d.objType === 'objCPUCharacter' || d.objType === 'objDwelling') && typeof d.raw['name'] === 'string')
  const symbols = ['none', 'player', ...spawnable.map((d) => d.key)]

  it.each(spawnable.map((d) => d.key))('%s spawns and fights for 600 ticks', (key) => {
    const fill = (v: number) => Array.from({ length: 9 }, () => Array(18).fill(v))
    const obj = fill(0)
    obj[4]![7] = symbols.indexOf(key) + 1
    const map: MapDefinition = {
      mapSize: { x: 1, y: 1 }, roomSize: { x: 18, y: 9 }, startRoom: { x: 1, y: 1 },
      layers: [{ name: 'backgroundPassive', tileSet: 'p' }, { name: 'backgroundActive', tileSet: 'a' }, { name: 'objects', tileSet: 'o' }],
      rooms: [{ num: 1, layers: { backgroundActive: fill(1), backgroundPassive: fill(1), objects: obj } }],
    }
    let s = createSim(buildWorldGrid(map, () => false, symbols), defs, teams, anims, 3, { x: 100, y: 144 })
    expect(s.actors.some((a) => a.def === key)).toBe(true)
    let hurt = false
    for (let i = 0; i < 600; i++) {
      s = stepSim(s, NO_INPUT)
      hurt ||= s.events.some((e) => e.kind === 'hit' && e.id === s.playerId)
      s = pinPlayer(s)
    }
    const hatesPlayer = (teams[defs[key]!.team]?.hates[0] ?? []).includes('aldevar')
    const fights = defs[key]!.attack.targetAllegiance === 'enemy' && defs[key]!.objType === 'objCPUCharacter'
    if (hatesPlayer && fights) expect(hurt).toBe(true)
  })
})

describe('multistage and special units', () => {
  /** Sets one actor's fields directly (a quick way to deal damage or place it). */
  const patch = (s: SimState, key: string, over: Partial<ActorState>): SimState => ({
    ...s, actors: s.actors.map((a) => (a.def === key ? { ...a, ...over } : a)),
  })
  const holdE: InputSnapshot = { ...NO_INPUT, shootNearest: true }

  it('hydra3 dies at its minEnergy and comes back as a hydra2 on the same spot (modReincarnate)', () => {
    let s = sim([{ x: 7, y: 5, symbol: 'hydra3' }])
    // one blast more than takes it below 1000
    s = patch(s, 'hydra3', { energy: 1001, ai: { ...ofDef(s, 'hydra3')[0]!.ai, mode: 'none' } })
    let hydra2: ActorState | undefined
    for (let i = 0; i < 120 && !hydra2; i++) {
      s = stepSim(s, i < 13 ? holdE : NO_INPUT)
      hydra2 = ofDef(s, 'hydra2')[0]
    }
    expect(hydra2).toBeDefined()
    expect(hydra2!.energy).toBe(defs['hydra2']!.energy)
    expect(ofDef(s, 'hydra3')).toHaveLength(0)
    expect(s.exitsOpen).toBe(false)
  })

  it('a dark golem\'s rock explodes on the player (modExploder, explodeCharge 40)', () => {
    let s = sim([{ x: 8, y: 5, symbol: 'darkGolem' }])
    let exploded = false
    let hurt = false
    for (let i = 0; i < 400 && !(exploded && hurt); i++) {
      s = stepSim(s, NO_INPUT)
      exploded ||= s.events.some((e) => e.kind === 'explode' && e.radius === 20)
      hurt ||= s.events.some((e) => e.kind === 'hit' && e.id === s.playerId)
      s = pinPlayer(s)
    }
    expect(exploded).toBe(true)
    expect(hurt).toBe(true)
  })

  it('a four-arm golem comes back as two dark golems', () => {
    let s = sim([{ x: 7, y: 5, symbol: 'fourArmGolem' }])
    s = patch(s, 'fourArmGolem', { energy: 1, ai: { ...ofDef(s, 'fourArmGolem')[0]!.ai, mode: 'none' } })
    for (let i = 0; i < 120 && ofDef(s, 'darkGolem').length === 0; i++) s = stepSim(s, i < 13 ? holdE : NO_INPUT)
    expect(ofDef(s, 'darkGolem')).toHaveLength(2)
  })

  it('a multiAttack ninja throws shuriken from afar and draws its sword within bufferDist', () => {
    let far = sim([{ x: 12, y: 5, symbol: 'ninja' }]) // 288 px away
    far = stepSim(far, NO_INPUT)
    expect(ofDef(far, 'ninja')[0]!.useNatural).toBe(true)
    let near = sim([{ x: 5, y: 5, symbol: 'ninja' }]) // 64 px away; Merlin's blast is not melee
    near = stepSim(near, NO_INPUT)
    expect(ofDef(near, 'ninja')[0]!.useNatural).toBe(false)
  })

  it('a necromancer summons undead where its spell lands (modSpellMultistage)', () => {
    let s = sim([{ x: 12, y: 5, symbol: 'necromancer' }])
    const summonable = new Set(defs['undeadSummon']!.attack.multistage.map((m) => m.payload))
    let summoned: ActorState | undefined
    for (let i = 0; i < 1500 && !summoned; i++) {
      s = pinPlayer(stepSim(s, NO_INPUT))
      summoned = s.actors.find((a) => summonable.has(a.def))
    }
    expect(summoned).toBeDefined()
    expect(summoned!.team).toBe('undead')
  })

  it('a monk (team aldevar) heals a hurt Merlin with its heal blast', () => {
    let s = sim([{ x: 7, y: 5, symbol: 'monk' }])
    s = { ...s, actors: s.actors.map((a) => (a.id === s.playerId ? { ...a, energy: 60 } : a)) }
    let healed = false
    for (let i = 0; i < 300 && !healed; i++) {
      s = stepSim(s, NO_INPUT)
      healed = playerOf(s).energy > 70
    }
    expect(healed).toBe(true)
  })

  it('a reelProof plant takes damage from the blast but never reels', () => {
    let s = sim([{ x: 7, y: 5, symbol: 'plant' }])
    const before = ofDef(s, 'plant')[0]!.energy
    const modes = new Set<string>()
    for (let i = 0; i < 40; i++) {
      s = pinPlayer(stepSim(s, i < 13 ? holdE : NO_INPUT))
      for (const p of ofDef(s, 'plant')) modes.add(p.mode)
    }
    expect(ofDef(s, 'plant')[0]!.energy).toBeLessThan(before)
    expect(modes.has('reel')).toBe(false)
  })

  it('a runReload bat backs away from its target after attacking', () => {
    let s = sim([{ x: 6, y: 5, symbol: 'bat' }])
    let backedOff = false
    for (let i = 0; i < 300 && !backedOff; i++) {
      s = pinPlayer(stepSim(s, NO_INPUT))
      const bat = ofDef(s, 'bat')[0]!
      if (bat.ai.mode === 'runReload' && bat.vel.x !== 0) backedOff = Math.sign(bat.vel.x) === Math.sign(bat.pos.x - 100)
    }
    expect(backedOff).toBe(true)
  })
})
