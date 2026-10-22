// Port of the builder rules: objAiCPUBuilder (startNewConstruction, updateBuild), modBuilder
// (pBuildRange, checkBuildingInRange) and modConstruction (startBeBuilt, advanceBuildFrame)
// (docs/notes/engine-mechanics-spells.md §5, the dwarf).
import type { Vec } from './mr-geometry'

export const BUILDER_AI = 'objAiCPUBuilder'
/** modBuilder pBuildRange: the builder builds within this many px of the building. */
export const BUILD_RANGE = 50
/** startNewConstruction: a new building goes this far from the builder (useOffset false). */
export const NEW_BUILDING_OFFSET: Vec = { x: 32, y: 0 }
/** updateBuild: every 100 of build amount advances the building one frame. */
const BUILD_AMOUNT_PER_FRAME = 100
/** modConstruction.startBeBuilt: an unbuilt building starts on 1 energy. */
export const UNBUILT_ENERGY = 1

/** updateBuild: frames to advance this tick and the build amount carried over. */
export function buildStep(carried: number, buildRate: number): { frames: number; carried: number } {
  const amount = carried + buildRate
  return { frames: Math.floor(amount / BUILD_AMOUNT_PER_FRAME), carried: amount % BUILD_AMOUNT_PER_FRAME }
}

/** advanceBuildFrame: increaseEnergyByPercentage(VarPercent(1, [0, frames])), 1/frames of the max per frame. */
export const energyPerBuildFrame = (maxEnergy: number, stripFrames: number): number => maxEnergy / Math.max(1, stripFrames)
