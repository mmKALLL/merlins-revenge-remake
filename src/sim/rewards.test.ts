// What Merlin holds, for the roguelite rewards (docs/plans/2026-10-25-roguelite-mode-design.md,
// Rewards): the starting kit (src/run/rewards.ts) counts on him starting a run with only his punch.
import { describe, expect, it } from 'vitest'
import { SPELL_SCROLLS } from '../gen/themes'
import type { MapDefinition } from '../mr-open/mr-map-format'
import { gmgCollected } from '../mr-open/mr-golden-machine-gun'
import { GOLDEN_MACHINE_GUN } from '../mr-open/mr-pickup'
import { addWeapon } from '../mr-open/mr-weapons'
import { withRunStartArsenal } from './carry-over'
import { collectedScrolls, holdsScroll } from './rewards'
import { anims, defs, teams } from './test-data'
import { createSim } from './tick'
import { buildWorldGrid } from './world-grid'

const fill = (v: number) => Array.from({ length: 9 }, () => Array<number>(18).fill(v))
const MAP: MapDefinition = {
  mapSize: { x: 1, y: 1 }, roomSize: { x: 18, y: 9 }, startRoom: { x: 1, y: 1 },
  layers: [{ name: 'backgroundPassive', tileSet: 'p' }, { name: 'backgroundActive', tileSet: 'a' }, { name: 'objects', tileSet: 'o' }],
  rooms: [{ num: 1, layers: { backgroundActive: fill(0), backgroundPassive: fill(1), objects: fill(0) } }],
}
const mapStart = () => createSim(buildWorldGrid(MAP, () => false), defs, teams, anims, 1, { x: 100, y: 100 })
const start = () => withRunStartArsenal(mapStart())
const weaponKeys = (s: ReturnType<typeof mapStart>) => s.arsenal.weapons.map((w) => w.key)

describe('the starting arsenal', () => {
  const punch = defs['player']!.naturalAttack.name
  it('holds the punch and the energy blast on a map, only the punch at a roguelite run\'s start', () => {
    expect(weaponKeys(mapStart())).toEqual([punch, 'energyBlast'])
    expect(weaponKeys(start())).toEqual([punch])
    expect(start().arsenal.current).toBe(punch)
  })
})

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

  it('holds the golden machine gun once found, on or off (so the reward stops offering it)', () => {
    const s = start()
    expect(holdsScroll(s, GOLDEN_MACHINE_GUN)).toBe(false)
    const found = { ...s, gmg: gmgCollected(s.gmg) }
    expect(holdsScroll(found, GOLDEN_MACHINE_GUN)).toBe(true)
    expect(holdsScroll({ ...found, gmg: { ...found.gmg, on: false } }, GOLDEN_MACHINE_GUN)).toBe(true)
  })
})

describe('collectedScrolls', () => {
  it('lists the scrolls of the weapons taken during the run, the energy blast too, in order', () => {
    const s = start()
    expect(collectedScrolls(s)).toEqual([])
    const armed = { ...s, arsenal: addWeapon(addWeapon(s.arsenal, 'armySummon', defs['armySummon']!.attack), 'energyBlast', defs['player']!.attack) }
    expect(collectedScrolls(armed)).toEqual(['armySummon', 'energyBlast'])
    expect(collectedScrolls({ ...armed, gmg: gmgCollected(armed.gmg) })).toEqual(['armySummon', 'energyBlast', GOLDEN_MACHINE_GUN])
  })
})
