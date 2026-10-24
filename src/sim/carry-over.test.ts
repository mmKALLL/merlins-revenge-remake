// Roguelite carry-over (docs/plans/2026-10-25-roguelite-mode-design.md, Architecture): Merlin's record
// goes from one floor to the next; everything that belongs to the floor's map starts fresh.
import { describe, expect, it } from 'vitest'
import type { MapDefinition } from '../mr-open/mr-map-format'
import { addWeapon } from '../mr-open/mr-weapons'
import { playerOf } from './actors'
import { carryOver } from './carry-over'
import { NO_INPUT, type SimState } from './state'
import { VOID_SCORE } from './score'
import { anims, defs, teams } from './test-data'
import { createSim, stepSim } from './tick'
import { buildWorldGrid } from './world-grid'

const fill = (v: number) => Array.from({ length: 9 }, () => Array<number>(18).fill(v))

/** Open 18x9 rooms in a row. */
function map(rooms: number): MapDefinition {
  return {
    mapSize: { x: rooms, y: 1 }, roomSize: { x: 18, y: 9 }, startRoom: { x: 1, y: 1 },
    layers: [{ name: 'backgroundPassive', tileSet: 'p' }, { name: 'backgroundActive', tileSet: 'a' }, { name: 'objects', tileSet: 'o' }],
    rooms: Array.from({ length: rooms }, (_, i) => ({ num: i + 1, layers: { backgroundActive: fill(0), backgroundPassive: fill(1), objects: fill(0) } })),
  }
}
const simOf = (m: MapDefinition, seed: number): SimState => createSim(buildWorldGrid(m, () => false), defs, teams, anims, seed, { x: 100, y: 144 })

const PREV_TICKS = 900

/** A floor played for a while, Merlin's record changed in every way that carries over. */
function finishedFloor(): SimState {
  let s = simOf(map(2), 1)
  for (let i = 0; i < PREV_TICKS; i++) s = stepSim(s, NO_INPUT)
  const arsenal = addWeapon(s.arsenal, 'boltFan', defs['boltFan']!.attack)
  return {
    ...s,
    pickups: { potionsDrunk: [{ character: 'manaFlow', count: 2 }], medikits: { ...s.pickups.medikits, stock: 1 }, invinceTicks: 40 },
    arsenal: { ...arsenal, current: 'boltFan' },
    army: { merlin: { warrior: 3 } },
    score: { ...s.score, total: 5000 },
    actors: s.actors.map((a) => (a.id === s.playerId ? { ...a, energy: 120 } : a)),
    rooms: { ...s.rooms, '2,1': { spawned: true, actors: [], graves: [{ def: 'goblinWarrior', pos: { x: 700, y: 100 } }], clear: true } },
  }
}

describe('carryOver', () => {
  const prev = finishedFloor()
  const fresh = simOf(map(3), 2)
  const next = carryOver(prev, fresh)

  it("keeps Merlin's record: potions, medikits, weapons, army, energy, score and run time", () => {
    expect(next.pickups.potionsDrunk).toEqual(prev.pickups.potionsDrunk)
    expect(next.pickups.medikits.stock).toBe(1)
    expect(next.pickups.invinceTicks).toBe(0)
    expect(next.arsenal.weapons).toEqual(prev.arsenal.weapons)
    expect(next.arsenal.current).toBe('boltFan')
    expect(next.army).toEqual(prev.army)
    expect(playerOf(next).energy).toBe(120)
    expect(next.score.total).toBe(5000 + fresh.score.total)
    expect(next.runTicks).toBe(PREV_TICKS)
  })

  it("leaves the next floor's map as it starts: its actors, rooms, grid and tick", () => {
    expect(next.grid).toBe(fresh.grid)
    expect(next.rooms).toEqual(fresh.rooms)
    expect(next.tick).toBe(0)
    expect(next.actors.map((a) => [a.def, a.pos])).toEqual(fresh.actors.map((a) => [a.def, a.pos]))
  })

  it('keeps counting the run time on the next floor', () => {
    expect(stepSim(next, NO_INPUT).runTicks).toBe(PREV_TICKS + 1)
  })

  it('keeps a voided score void', () => {
    expect(carryOver({ ...prev, score: VOID_SCORE }, fresh).score.valid).toBe(false)
  })
})
