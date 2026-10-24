// A roguelite run (docs/plans/2026-10-25-roguelite-mode-design.md, Run controller): its seed, the
// floor Merlin is on, the biomes chosen so far and how it stands. Pure; main.ts swaps the floors.
import { ROGUELITE_FLOORS, firstBiome, floorSeed } from '../gen/roguelite-biomes'
import type { FloorTheme } from '../gen/themes'

export type RunStatus = 'playing' | 'won' | 'dead'

export interface RunState {
  seed: number
  /** the floor Merlin is on, 0 = the first */
  floor: number
  /** the biome (theme id) of each floor reached */
  biomes: string[]
  status: RunStatus
}

/** The next floor: its number, the biomes it may be and its seed. */
export interface FloorPlan { floor: number; options: readonly FloorTheme[]; seed: number }

export const startRun = (seed: number): RunState => ({ seed, floor: 0, biomes: [firstBiome(seed).id], status: 'playing' })

/** The floor above the current one, or 'won' when Merlin has left the last floor. */
export function nextFloorPlan(run: RunState): FloorPlan | 'won' {
  const floor = run.floor + 1
  const options = ROGUELITE_FLOORS[floor]
  if (!options) return 'won'
  return { floor, options, seed: floorSeed(run.seed, floor) }
}

/** The run once Merlin is on `floor`, in `biome`. */
export const enterFloor = (run: RunState, floor: number, biome: FloorTheme): RunState => ({ ...run, floor, biomes: [...run.biomes, biome.id] })

export const endRun = (run: RunState, status: Exclude<RunStatus, 'playing'>): RunState => ({ ...run, status })
