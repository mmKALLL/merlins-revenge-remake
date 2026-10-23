// Building a generated map with pauses for the loading screen must not change the map for a seed.
import { describe, expect, it } from 'vitest'
import { pageDefs } from '../debug/snapshot-test-data'
import { energyLookup } from './floor'
import { GENERATED_MAPS, TOWER_MAP_ID, generateMap, generateMapSteps } from './generated-maps'
import { runStepsAsync, type StepPacing } from './steps'

const energyOf = energyLookup(pageDefs)
const SEEDS = [1, 77, 123456789]

describe('generated maps in steps', () => {
  it('pausing at every step builds the same map as building it straight through', async () => {
    for (const { id } of GENERATED_MAPS) {
      for (const seed of SEEDS) {
        const progress: number[] = []
        const pacing: StepPacing = { onProgress: (f) => progress.push(f), pause: () => Promise.resolve(), sliceMs: 0 }
        expect(await runStepsAsync(generateMapSteps(id, seed, energyOf), pacing), `${id} seed ${seed}`).toEqual(generateMap(id, seed, energyOf))
        expect(progress.length).toBeGreaterThan(1)
        for (const f of progress) {
          expect(f).toBeGreaterThan(0)
          expect(f).toBeLessThanOrEqual(1)
        }
      }
    }
  })

  it('two builds interleaved at their pauses do not disturb each other (no shared random state)', async () => {
    const pacing: StepPacing = { onProgress: () => {}, pause: () => new Promise((r) => setTimeout(r, 0)), sliceMs: 0 }
    const [a, b] = await Promise.all([
      runStepsAsync(generateMapSteps(TOWER_MAP_ID, 5, energyOf), pacing),
      runStepsAsync(generateMapSteps(TOWER_MAP_ID, 6, energyOf), pacing),
    ])
    expect(a).toEqual(generateMap(TOWER_MAP_ID, 5, energyOf))
    expect(b).toEqual(generateMap(TOWER_MAP_ID, 6, energyOf))
  })
})
