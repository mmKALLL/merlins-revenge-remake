// Seeded random numbers for the simulation (mulberry32). Pure: every call returns the next state
// instead of mutating, so ticks stay replayable from a seed.
export type Rng = { seed: number }

/** Returns [value in [0,1), next rng]. */
export function nextRandom(r: Rng): [number, Rng] {
  const t = (r.seed + 0x6d2b79f5) >>> 0
  let x = Math.imul(t ^ (t >>> 15), 1 | t)
  x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x
  return [((x ^ (x >>> 14)) >>> 0) / 4294967296, { seed: t }]
}

/** VarRoughly(0, e): uniform integer in [-e, e]. */
export function roughly(r: Rng, e: number): [number, Rng] {
  const [v, n] = nextRandom(r)
  return [Math.round(v * 2 * e - e), n]
}
