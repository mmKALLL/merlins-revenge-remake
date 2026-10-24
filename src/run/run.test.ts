// The roguelite run's floor flow (docs/plans/2026-10-25-roguelite-mode-design.md, Run flow): floor by
// floor up the biome table, each with its own seed, won after the last one.
import { describe, expect, it } from 'vitest'
import { ROGUELITE_FLOORS, firstBiome, floorSeed } from '../gen/roguelite-biomes'
import { enterFloor, nextFloorPlan, startRun } from './run'

const SEED = 11

describe('roguelite run', () => {
  it('starts on the first floor in the biome the seed picks', () => {
    const run = startRun(SEED)
    expect(run).toEqual({ seed: SEED, floor: 0, biomes: [firstBiome(SEED).id], status: 'playing' })
  })

  it('plans each next floor with its biome options and seed, then reports the win after the last', () => {
    let run = startRun(SEED)
    for (let floor = 1; floor < ROGUELITE_FLOORS.length; floor++) {
      const plan = nextFloorPlan(run)
      if (plan === 'won') throw new Error(`won before floor ${floor}`)
      expect(plan).toEqual({ floor, options: ROGUELITE_FLOORS[floor], seed: floorSeed(SEED, floor) })
      run = enterFloor(run, plan.floor, plan.options[0]!)
    }
    expect(run.floor).toBe(ROGUELITE_FLOORS.length - 1)
    expect(run.biomes).toHaveLength(ROGUELITE_FLOORS.length)
    expect(nextFloorPlan(run)).toBe('won')
  })
})
