// Roguelite rewards given to Merlin (docs/plans/2026-10-25-roguelite-mode-design.md, Rewards): each
// changes his record as its pickups would, and nothing else.
import { describe, expect, it } from 'vitest'
import type { MapDefinition } from '../mr-open/mr-map-format'
import { BONUS_ENERGY, TEMP_INVINCE_TICKS } from '../mr-open/mr-pickup'
import { playerOf } from './actors'
import { applyReward, holdsScroll } from './rewards'
import type { SimState } from './state'
import { anims, defs, teams } from './test-data'
import { createSim } from './tick'
import { buildWorldGrid } from './world-grid'

const fill = (v: number) => Array.from({ length: 9 }, () => Array<number>(18).fill(v))
const MAP: MapDefinition = {
  mapSize: { x: 1, y: 1 }, roomSize: { x: 18, y: 9 }, startRoom: { x: 1, y: 1 },
  layers: [{ name: 'backgroundPassive', tileSet: 'p' }, { name: 'backgroundActive', tileSet: 'a' }, { name: 'objects', tileSet: 'o' }],
  rooms: [{ num: 1, layers: { backgroundActive: fill(0), backgroundPassive: fill(1), objects: fill(0) } }],
}
const STARTING_ARMY = { warrior: 2 }
const rewardDefs = { ...defs, armySummon: { ...defs['armySummon']!, startingArmy: STARTING_ARMY } }
const HURT_ENERGY = 20

/** Merlin hurt, with nothing collected yet. */
function hurt(): SimState {
  const s = createSim(buildWorldGrid(MAP, () => false), rewardDefs, teams, anims, 1, { x: 100, y: 100 })
  return { ...s, actors: s.actors.map((a) => (a.id === s.playerId ? { ...a, energy: HURT_ENERGY } : a)) }
}
const maxEnergy = defs['player']!.maxEnergy

describe('applyReward', () => {
  const before = hurt()

  it('a spell: the scroll weapon, current, with its starting army and the bonus energy', () => {
    expect(holdsScroll(before, 'armySummon')).toBe(false)
    const after = applyReward(before, { kind: 'spell', scroll: 'armySummon' })
    expect(holdsScroll(after, 'armySummon')).toBe(true)
    expect(after.arsenal.current).toBe('armySummon')
    expect(after.army).not.toEqual(before.army)
    expect(playerOf(after).energy).toBe(HURT_ENERGY + BONUS_ENERGY)
    expect(after.pickups.potionsDrunk).toEqual(before.pickups.potionsDrunk)
    expect(after.pickups.medikits).toEqual(before.pickups.medikits)
  })

  it('the heal: full energy and one more medikit', () => {
    const after = applyReward(before, { kind: 'heal' })
    expect(playerOf(after).energy).toBe(maxEnergy)
    expect(after.pickups.medikits.stock).toBe(before.pickups.medikits.stock + 1)
    expect(after.arsenal).toEqual(before.arsenal)
    expect(after.pickups.potionsDrunk).toEqual(before.pickups.potionsDrunk)
  })

  it('potions: each one drunk, with its bonus energy', () => {
    const potions = [{ character: 'manaFlow', count: 3 }, { character: 'walkSpeed', count: 2 }]
    const after = applyReward(before, { kind: 'potions', potions })
    expect(after.pickups.potionsDrunk).toEqual(potions)
    expect(playerOf(after).energy).toBe(Math.min(maxEnergy, HURT_ENERGY + 5 * BONUS_ENERGY))
    expect(after.pickups.medikits).toEqual(before.pickups.medikits)
    expect(after.arsenal).toEqual(before.arsenal)
  })

  it('passes no time, and starts the pickup invincibility', () => {
    const after = applyReward(before, { kind: 'heal' })
    expect(after.tick).toBe(before.tick)
    expect(after.runTicks).toBe(before.runTicks)
    expect(after.pickups.invinceTicks).toBe(TEMP_INVINCE_TICKS)
  })
})
