// Seeded random numbers for map generation. Mutable (unlike the sim's pure Rng), since a generator
// draws thousands of values in one go; the sequence is the sim's mulberry32.
import { nextRandom, type Rng } from '../sim/rng'

export class GenRandom {
  private rng: Rng

  constructor(seed: number) {
    this.rng = { seed: seed >>> 0 }
  }

  /** Uniform in [0, 1). */
  next(): number {
    const [v, r] = nextRandom(this.rng)
    this.rng = r
    return v
  }

  /** Uniform integer in [lo, hi]. */
  int(lo: number, hi: number): number {
    return lo + Math.floor(this.next() * (hi - lo + 1))
  }

  chance(p: number): boolean {
    return this.next() < p
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('pick from an empty list')
    return items[Math.floor(this.next() * items.length)]!
  }

  /** One item, chosen with probability proportional to its weight. */
  weighted<T>(items: readonly { value: T; weight: number }[]): T {
    const total = items.reduce((s, i) => s + i.weight, 0)
    if (total <= 0) throw new Error('weighted pick needs a positive total weight')
    let r = this.next() * total
    for (const i of items) {
      r -= i.weight
      if (r < 0) return i.value
    }
    return items[items.length - 1]!.value
  }

  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1))
      ;[items[i], items[j]] = [items[j]!, items[i]!]
    }
    return items
  }
}
