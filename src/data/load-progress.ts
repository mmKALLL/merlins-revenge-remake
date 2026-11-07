// The loading bar's progress (remake): a map's load in stages (its data files, the sprites, the
// tilesets, a generated map's build), each filling a fixed part of the bar as its own loads finish.
// Loads found later (the sprite pages, once their index is in) then never hold the bar at a number
// that counted only the loads known so far.

/** One part of a load: its weight on the bar, and its loads added and finished (or failed) so far. */
export class LoadStage {
  done = 0
  total = 0
  constructor(readonly weight: number) {}

  /** How far the stage has got (0..1); none of it until its loads are known. */
  get fraction(): number {
    return this.total === 0 ? 0 : Math.min(1, this.done / this.total)
  }

  /** For work that is not a count of loads (a generated map's build): how far it has got (0..1). */
  setFraction(fraction: number): void {
    this.total = 1
    this.done = fraction
  }
}

/**
 * How far the whole load has got (0..1): each stage fills its share of the weights by its fraction.
 * A stage's loads must all be added before any of them finishes, or its fraction could go back.
 */
export function loadedFraction(stages: readonly LoadStage[]): number {
  const weight = stages.reduce((sum, s) => sum + s.weight, 0)
  if (weight === 0) return 0
  return stages.reduce((sum, s) => sum + s.weight * s.fraction, 0) / weight
}
