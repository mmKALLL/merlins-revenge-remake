// Remake: Merlin's damageDealtMultiplier multiplies the damage of everything he owns (tick-combat.ts withOwnerDamage).
import { describe, expect, it } from 'vitest'
import type { MapDefinition } from '../mr-open/mr-map-format'
import { defOf, playerOf } from './actors'
import type { SimState } from './state'
import { anims, defs, teams } from './test-data'
import { createSim } from './tick'
import { beginTick, spawn } from './tick-context'
import { withOwnerDamage } from './tick-combat'
import { buildWorldGrid } from './world-grid'

const SCALE = 3

function world(): SimState {
  const fill = (v: number) => Array.from({ length: 9 }, () => Array<number>(18).fill(v))
  const map: MapDefinition = {
    mapSize: { x: 1, y: 1 }, roomSize: { x: 18, y: 9 }, startRoom: { x: 1, y: 1 },
    layers: [{ name: 'backgroundPassive', tileSet: 'p' }, { name: 'backgroundActive', tileSet: 'a' }, { name: 'objects', tileSet: 'o' }],
    rooms: [{ num: 1, layers: { backgroundActive: fill(0), backgroundPassive: fill(1), objects: fill(0) } }],
  }
  const scaled = { ...defs, player: { ...defs['player']!, damageDealtMultiplier: SCALE } }
  return createSim(buildWorldGrid(map, () => false, ['none']), scaled, teams, anims, 1, { x: 100, y: 144 }, 'rooms')
}

describe("Merlin's damageDealtMultiplier", () => {
  it("scales his own attacks and what his spells leave, not anyone else's", () => {
    const t = beginTick(world())
    const p = playerOf(t.s)
    const arrowAttack = defs['goblinArrow']!.attack
    const base = arrowAttack.damageMultiplier
    expect(withOwnerDamage(t, p, defOf(t.s, p).attack).damageMultiplier).toBe(defOf(t.s, p).attack.damageMultiplier * SCALE)
    const his = spawn(t, 'goblinArrow', { x: 120, y: 144 }, { mode: 'fly', ownerId: p.id })
    expect(withOwnerDamage(t, his, arrowAttack).damageMultiplier).toBe(base * SCALE)
    const goblin = spawn(t, 'goblinArcher', { x: 300, y: 144 }, { mode: 'walk' })
    const theirs = spawn(t, 'goblinArrow', { x: 280, y: 144 }, { mode: 'fly', ownerId: goblin.id })
    expect(withOwnerDamage(t, theirs, arrowAttack).damageMultiplier).toBe(base)
    // a unit Merlin summoned fights with its own strength
    const ally = spawn(t, 'goblinWarrior', { x: 140, y: 144 }, { mode: 'walk', ownerId: p.id })
    expect(withOwnerDamage(t, ally, defOf(t.s, ally).attack).damageMultiplier).toBe(defOf(t.s, ally).attack.damageMultiplier)
  })
})
