// What Merlin holds, for the roguelite rewards (docs/plans/2026-10-25-roguelite-mode-design.md,
// Rewards): the starting kit (src/run/rewards.ts) counts on him starting a run with no scroll's spell.
import { describe, expect, it } from 'vitest'
import { SPELL_SCROLLS } from '../gen/themes'
import type { MapDefinition } from '../mr-open/mr-map-format'
import { addWeapon } from '../mr-open/mr-weapons'
import { holdsScroll } from './rewards'
import { anims, defs, teams } from './test-data'
import { createSim } from './tick'
import { buildWorldGrid } from './world-grid'

const fill = (v: number) => Array.from({ length: 9 }, () => Array<number>(18).fill(v))
const MAP: MapDefinition = {
  mapSize: { x: 1, y: 1 }, roomSize: { x: 18, y: 9 }, startRoom: { x: 1, y: 1 },
  layers: [{ name: 'backgroundPassive', tileSet: 'p' }, { name: 'backgroundActive', tileSet: 'a' }, { name: 'objects', tileSet: 'o' }],
  rooms: [{ num: 1, layers: { backgroundActive: fill(0), backgroundPassive: fill(1), objects: fill(0) } }],
}
const start = () => createSim(buildWorldGrid(MAP, () => false), defs, teams, anims, 1, { x: 100, y: 100 })

describe('holdsScroll', () => {
  it('holds no scroll\'s spell at the start', () => {
    const s = start()
    expect(SPELL_SCROLLS.filter((scroll) => holdsScroll(s, scroll))).toEqual([])
  })

  it('holds a scroll\'s spell once its weapon is in the arsenal', () => {
    const s = start()
    const armed = { ...s, arsenal: addWeapon(s.arsenal, 'armySummon', defs['armySummon']!.attack) }
    expect(holdsScroll(armed, 'armySummon')).toBe(true)
  })
})
