// Seeded random numbers for the simulation (mulberry32). Pure: every call returns the next state
// instead of mutating, so ticks stay replayable from a seed.
import type { Vec } from '../mr-open/mr-geometry'

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

/**
 * Remake angular spread: `v` rotated by a uniform random angle in [-maxDeg, +maxDeg] degrees,
 * length unchanged. A spread of 0 or less returns `v` without drawing, so engine behaviour keeps
 * its random sequence.
 */
export function spreadVec(r: Rng, v: Vec, maxDeg: number): [Vec, Rng] {
  if (maxDeg <= 0) return [v, r]
  const [u, n] = nextRandom(r)
  const a = ((u * 2 - 1) * maxDeg * Math.PI) / 180
  const c = Math.cos(a)
  const s = Math.sin(a)
  return [{ x: v.x * c - v.y * s, y: v.x * s + v.y * c }, n]
}

/** Lingo random(n): uniform integer in [1, n]. */
export function randomInt(r: Rng, n: number): [number, Rng] {
  const [v, next] = nextRandom(r)
  return [1 + Math.floor(v * n), next]
}

/** VarRndRange([a, b]): uniform integer in [a, b]. */
export function rndRange(r: Rng, [a, b]: readonly [number, number]): [number, Rng] {
  const [v, next] = randomInt(r, b - a + 1)
  return [a + v - 1, next]
}
