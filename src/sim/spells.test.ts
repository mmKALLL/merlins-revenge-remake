// Merlin's spells in the sim (docs/notes/engine-mechanics-spells.md): scrolls give weapons, the
// spell keys pick them, the army summon brings units from the reserve and allies go back to it,
// pulse spells fire their bullets, mines go off, the dwarf builds its tower, the sword strikes.
import { describe, expect, it } from 'vitest'
import type { ActorDef } from '../mr-open/mr-actor-data'
import { TELEPORT_TICKS } from '../mr-open/mr-army'
import type { MapDefinition } from '../mr-open/mr-map-format'
import { MINE } from '../mr-open/mr-mine'
import { addWeapon } from '../mr-open/mr-weapons'
import { createActor, playerOf } from './actors'
import { NO_INPUT, roomKey, type ActorState, type InputSnapshot, type SimState } from './state'
import { anims, defs as engineDefs, teams } from './test-data'
import { createSim, stepSim } from './tick'
import { buildWorldGrid } from './world-grid'

const SYMBOLS = ['none', 'cBlast', 'merlinSword', 'armySummon', 'dwarf', 'goblinWarrior', 'dwarfTower']
const ROW = 4 // objects on the fifth row, where Merlin starts
const PLAYER = { x: 100, y: ROW * 32 + 16 }
const RIGHT: InputSnapshot = { ...NO_INPUT, move: { x: 1, y: 0 } }
const defs: Record<string, ActorDef> = { ...engineDefs, armySummon: { ...engineDefs['armySummon']!, startingArmy: { warrior: 1 } } }

/**
 * Three open 18x9 rooms side by side, room 1 holding `objects` (symbol -> column) on ROW and a
 * goblin in room 3, so the map is not complete from the start.
 */
function world(objects: Record<string, number>): SimState {
  const fill = (v: number) => Array.from({ length: 9 }, () => Array<number>(18).fill(v))
  const layers = [fill(0), fill(0), fill(0)]
  for (const [symbol, col] of Object.entries(objects)) layers[0]![ROW]![col - 1] = SYMBOLS.indexOf(symbol) + 1
  layers[2]![ROW]![9] = SYMBOLS.indexOf('goblinWarrior') + 1
  const map: MapDefinition = {
    mapSize: { x: 3, y: 1 }, roomSize: { x: 18, y: 9 }, startRoom: { x: 1, y: 1 },
    layers: [{ name: 'backgroundPassive', tileSet: 'p' }, { name: 'backgroundActive', tileSet: 'a' }, { name: 'objects', tileSet: 'o' }],
    rooms: [1, 2, 3].map((num) => ({ num, layers: { backgroundActive: fill(0), backgroundPassive: fill(1), objects: layers[num - 1]! } })),
  }
  return createSim(buildWorldGrid(map, () => false, SYMBOLS), defs, teams, anims, 1, PLAYER, 'rooms')
}

/** Merlin holding `key`'s weapon (the scroll's attack), as if he had collected it. */
const armed = (s: SimState, key: string): SimState => ({ ...s, arsenal: addWeapon(s.arsenal, key, defs[key]!.attack) })

function stepUntil(s: SimState, input: InputSnapshot, done: (s: SimState) => boolean, limit = 300): SimState {
  for (let i = 0; i < limit && !done(s); i++) s = stepSim(s, input)
  return s
}

const ofDef = (s: SimState, def: string): ActorState[] => s.actors.filter((a) => a.def === def)
const aimAt = (at: { x: number; y: number }): InputSnapshot => ({ ...NO_INPUT, chargeHeld: true, mouseWorld: at })

describe("Merlin's weapons", () => {
  it('a scroll gives its weapon, selected at once, with +25 energy and its writing; the spell keys pick the n-th spell', () => {
    let s = world({ cBlast: 5, merlinSword: 7 })
    const hurt = { ...s, actors: s.actors.map((a) => (a.id === s.playerId ? { ...a, energy: 100 } : a)) }
    s = stepUntil(hurt, RIGHT, (n) => n.arsenal.weapons.length === 3)
    expect(s.arsenal.current).toBe('cBlast')
    expect(playerOf(s).energy).toBe(125)
    expect(s.pickups.invinceTicks).toBeGreaterThan(0)
    expect(s.actors.find((a) => a.def === 'cBlast')?.anim).toBe('writing')
    s = stepUntil(s, RIGHT, (n) => n.arsenal.weapons.length === 4)
    expect(s.arsenal.weapons.map((w) => w.key)).toEqual(['punch', 'energyBlast', 'cBlast', 'merlinSword'])
    expect(s.arsenal.current).toBe('merlinSword')
    // #spell2 is the second spell: the punch and the sword are no spells
    s = stepSim(s, { ...NO_INPUT, selectSpell: 2 })
    expect(s.arsenal.current).toBe('cBlast')
    s = stepSim(s, { ...NO_INPUT, selectSpell: 3 })
    expect(s.arsenal.current).toBe('cBlast')
    s = stepSim(s, { ...NO_INPUT, selectWeapon: 'punch' })
    expect(s.arsenal.current).toBe('punch')
  })

  it("Merlin's sword strikes the enemy under its strike point on its attack frame", () => {
    let s = armed(world({ goblinWarrior: 5 }), 'merlinSword')
    const goblin = ofDef(s, 'goblinWarrior')[0]!
    s = stepUntil(s, aimAt(goblin.pos), (n) => (ofDef(n, 'goblinWarrior')[0]?.energy ?? 0) < goblin.energy)
    const hit = ofDef(s, 'goblinWarrior')[0]!
    expect(hit.energy).toBeLessThan(goblin.energy)
    expect(hit.vel.x).toBeGreaterThan(0) // pushed away from Merlin
  })
})

describe('army summon', () => {
  it("the scroll brings its starting army; a summon takes the unit from the reserve and it teleports in; with nothing to fight it teleports back", () => {
    let s = stepUntil(world({ armySummon: 5 }), RIGHT, (n) => n.arsenal.current === 'armySummon')
    expect(s.army['aldevar']).toEqual({ warrior: 1 })
    const target = { x: playerOf(s).pos.x + 60, y: playerOf(s).pos.y }
    // held long past the warrior's stage: only a warrior is in the reserve, so the charge stays below the archer's
    for (let i = 0; i < 60; i++) s = stepSim(s, aimAt(target))
    expect(ofDef(s, 'spell')[0]!.charge).toBeCloseTo(14.9)
    s = stepUntil(s, { ...NO_INPUT, mouseWorld: target }, (n) => ofDef(n, 'warrior').length > 0)
    const warrior = ofDef(s, 'warrior')[0]!
    expect(warrior.teleport).toBe('in')
    expect(s.army['aldevar']!['warrior']).toBe(0)
    // the room is clear: the warrior's AI finds no target (#noTargetFound) and it leaves
    s = stepUntil(s, NO_INPUT, (n) => ofDef(n, 'warrior')[0]?.teleport === 'out')
    for (let i = 0; i < TELEPORT_TICKS; i++) s = stepSim(s, NO_INPUT)
    expect(ofDef(s, 'warrior')).toHaveLength(0)
    expect(s.army['aldevar']!['warrior']).toBe(1)
  })

  it('the dwarf builds a dwarf tower beside it, frame by frame from 1 energy, and the tower then stands', () => {
    // a goblin in the room keeps the fight going (allies leave once it is over)
    let s = stepUntil(world({ dwarf: 9, goblinWarrior: 18 }), NO_INPUT, (n) => ofDef(n, 'dwarfTower').length > 0)
    const tower = ofDef(s, 'dwarfTower')[0]!
    const dwarf = ofDef(s, 'dwarf')[0]!
    expect(tower.mode).toBe('beBuilt')
    expect(tower.energy).toBe(1)
    expect(tower.pos.x - dwarf.pos.x).toBe(32)
    s = stepUntil(s, NO_INPUT, (n) => ofDef(n, 'dwarfTower')[0]?.mode !== 'beBuilt', 2000)
    const built = ofDef(s, 'dwarfTower')[0]!
    expect(built.mode).not.toBe('beBuilt') // finished: it stands, or already fights the goblin
    expect(built.energy).toBeGreaterThan(defs['dwarfTower']!.energy * 0.9)
  })

  it('the dwarf tower still throws its axe where its target stood when the target dies mid-attack', () => {
    const w = world({ dwarfTower: 6, goblinWarrior: 14 })
    const tuned = { ...w, defs: { ...w.defs, dwarfTower: { ...w.defs['dwarfTower']!, keepAttackOnTargetLoss: true } } }
    let s = stepUntil(tuned, NO_INPUT, (n) => ofDef(n, 'dwarfTower')[0]?.ai.mode === 'attack')
    expect(ofDef(s, 'dwarfTower')[0]!.ai.mode).toBe('attack')
    const goblinAt = { ...ofDef(s, 'goblinWarrior')[0]!.pos }
    s = stepSim(s, { ...NO_INPUT, cheatKillAll: true })
    s = stepUntil(s, NO_INPUT, (n) => ofDef(n, 'towerAxe').length > 0 || ofDef(n, 'dwarfTower')[0]?.ai.mode !== 'attack')
    const axe = ofDef(s, 'towerAxe')[0]
    expect(axe).toBeDefined()
    expect(Math.abs(axe!.targetPoint!.x - goblinAt.x)).toBeLessThan(40)
  })

  it('a building dwarf teleports out once the fight is over, leaving its tower unfinished', () => {
    let s = stepUntil(world({ dwarf: 9 }), NO_INPUT, (n) => ofDef(n, 'dwarf')[0]?.teleport === 'out' || ofDef(n, 'dwarfTower').length > 0)
    s = stepUntil(s, NO_INPUT, (n) => ofDef(n, 'dwarf')[0]?.teleport === 'out')
    expect(ofDef(s, 'dwarf')[0]?.teleport).toBe('out')
    expect(ofDef(s, 'dwarfTower').every((tw) => tw.mode === 'beBuilt')).toBe(true)
  })
})

describe('pulses and mines', () => {
  it('a pulse spell stays where it is released and fires floor(charge / 2) + 1 pulses', () => {
    let s = armed(world({}), 'energyPulseSpell')
    const target = { x: playerOf(s).pos.x + 200, y: playerOf(s).pos.y }
    for (let i = 0; i < 20; i++) s = stepSim(s, aimAt(target))
    const charge = ofDef(s, 'spell')[0]!.charge
    const pulses = new Set<number>()
    for (let i = 0; i < 90; i++) {
      s = stepSim(s, { ...NO_INPUT, mouseWorld: target })
      for (const p of ofDef(s, 'energyPulse')) pulses.add(p.id)
    }
    expect(pulses.size).toBe(Math.floor(charge / 2) + 1)
    expect(ofDef(s, 'spell')).toHaveLength(0)
  })

  it('an energy mine primes, then goes off when an enemy comes within its trigger radius', () => {
    let s = armed(world({}), 'energyMines')
    const target = { x: playerOf(s).pos.x + 120, y: playerOf(s).pos.y }
    for (let i = 0; i < 20; i++) s = stepSim(s, aimAt(target))
    s = stepUntil(s, { ...NO_INPUT, mouseWorld: target }, (n) => ofDef(n, 'energyMine').some((m) => m.mode === 'primed'))
    const mine = ofDef(s, 'energyMine')[0]!
    // a goblin just inside the trigger radius
    const [goblin, next] = createActor(s, 'goblinWarrior', { x: mine.pos.x + MINE.triggerRadius - 2, y: mine.pos.y })
    s = { ...next, actors: [...next.actors, goblin] }
    s = stepUntil(s, NO_INPUT, (n) => ofDef(n, 'energyMine')[0]?.mode === 'explode', MINE.timeToCheck + 1)
    expect(ofDef(s, 'energyMine')[0]?.mode).toBe('explode')
    expect(ofDef(s, 'goblinWarrior')[0]!.energy).toBeLessThan(100)
  })
})

describe("the dwarf tower's axe with a splash radius (remake)", () => {
  it('hits every hostile unit whose sprite rect meets the circle around where it lands, and no other', () => {
    const base = world({})
    let s: SimState = { ...base, defs: { ...base.defs, towerAxe: { ...base.defs['towerAxe']!, splashRadius: 16 } } }
    const impact = { x: 300, y: PLAYER.y }
    const goblinAt = [impact, { x: impact.x + 20, y: impact.y }, { x: impact.x + 60, y: impact.y }]
    for (const pos of goblinAt) {
      const [goblin, next] = createActor(s, 'goblinWarrior', pos)
      s = { ...next, actors: [...next.actors, goblin] }
    }
    // an axe standing still where it was thrown: it stalls and lands on this tick
    const [axe, next] = createActor(s, 'towerAxe', impact)
    s = { ...next, actors: [...next.actors, { ...axe, mode: 'fly', age: 1, team: playerOf(s).team }] }
    s = stepSim(s, NO_INPUT)
    const energyAt = (x: number) => ofDef(s, 'goblinWarrior').find((a) => Math.abs(a.pos.x - x) < 15)?.energy
    const full = defs['goblinWarrior']!.energy
    expect(energyAt(goblinAt[0]!.x)).toBeLessThan(full)
    expect(energyAt(goblinAt[1]!.x)).toBeLessThan(full)
    expect(energyAt(goblinAt[2]!.x)).toBe(full)
    // splashGraveOn (act_towerAxe): the axe's crack stays where it landed
    expect(s.rooms[roomKey(s.room)]!.graves).toContainEqual({ def: 'towerAxe', pos: impact })
  })
})
