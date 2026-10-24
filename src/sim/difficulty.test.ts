import { describe, expect, it } from 'vitest'
import type { MapDefinition } from '../mr-open/mr-map-format'
import { POTION_CHARACTERS } from '../mr-open/mr-pickup'
import { playerOf } from './actors'
import { countsForRecords, DIFFICULTY_BONUS, withDifficultyDefs, withDifficultyStart, type Difficulty } from './difficulty'
import { anims, defs, teams } from './test-data'
import { createSim } from './tick'
import { buildWorldGrid } from './world-grid'

const fill = (v: number) => Array.from({ length: 9 }, () => Array<number>(18).fill(v))
const MAP: MapDefinition = {
  mapSize: { x: 1, y: 1 }, roomSize: { x: 18, y: 9 }, startRoom: { x: 1, y: 1 },
  layers: [{ name: 'backgroundPassive', tileSet: 'p' }, { name: 'backgroundActive', tileSet: 'a' }, { name: 'objects', tileSet: 'o' }],
  rooms: [{ num: 1, layers: { backgroundActive: fill(0), backgroundPassive: fill(1), objects: fill(0) } }],
}
const start = (d: Difficulty) =>
  withDifficultyStart(createSim(buildWorldGrid(MAP, () => false, ['none']), withDifficultyDefs(defs, d), teams, anims, 1, { x: 100, y: 144 }), d)

describe('difficulty (remake)', () => {
  it('Hard is the game as tuned and the only one whose runs count', () => {
    const s = start('hard')
    expect(s.defs['player']!.maxEnergy).toBe(defs['player']!.maxEnergy)
    expect(s.pickups.medikits.stock).toBe(0)
    expect(s.score.valid).toBe(true)
    expect(countsForRecords('hard')).toBe(true)
    expect(countsForRecords('normal') || countsForRecords('easy')).toBe(false)
  })

  it('easier difficulties start Merlin at the raised maximum with their medikits and potions, and keep no score', () => {
    for (const d of ['normal', 'easy'] as const) {
      const s = start(d)
      const bonus = DIFFICULTY_BONUS[d]
      expect(s.defs['player']!.maxEnergy).toBe(Math.round(defs['player']!.maxEnergy * bonus.maxEnergyFactor))
      expect(playerOf(s).energy).toBe(s.defs['player']!.maxEnergy)
      expect(s.pickups.medikits.stock).toBe(bonus.medikits)
      for (const c of POTION_CHARACTERS) expect(s.pickups.potionsDrunk.find((p) => p.character === c)?.count ?? 0).toBe(bonus.potionsOfEach)
      expect(s.score.valid).toBe(false)
    }
  })
})
