import { describe, expect, it } from 'vitest'
import { nextRandom, roughly, type Rng } from './rng'

function sequence(seed: number, n: number): number[] {
  let r: Rng = { seed }
  const out: number[] = []
  for (let i = 0; i < n; i++) {
    const [v, next] = nextRandom(r)
    out.push(v)
    r = next
  }
  return out
}

describe('nextRandom', () => {
  it('gives the same sequence for the same seed and does not mutate its input', () => {
    const r: Rng = { seed: 42 }
    expect(sequence(42, 5)).toEqual(sequence(42, 5))
    nextRandom(r)
    expect(r.seed).toBe(42)
    expect(sequence(42, 5)).not.toEqual(sequence(43, 5))
  })

  it('stays in [0, 1) and varies', () => {
    const vals = sequence(7, 200)
    for (const v of vals) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
    expect(new Set(vals).size).toBeGreaterThan(190)
  })
})

describe('roughly', () => {
  it('returns integers within [-e, e] and reaches both ends', () => {
    let r: Rng = { seed: 1 }
    const seen = new Set<number>()
    for (let i = 0; i < 500; i++) {
      const [v, next] = roughly(r, 3)
      expect(Number.isInteger(v)).toBe(true)
      expect(Math.abs(v)).toBeLessThanOrEqual(3)
      seen.add(v)
      r = next
    }
    expect(seen).toEqual(new Set([-3, -2, -1, 0, 1, 2, 3]))
  })

  it('is 0 for e = 0', () => {
    expect(roughly({ seed: 99 }, 0)[0]).toBe(0)
  })
})
