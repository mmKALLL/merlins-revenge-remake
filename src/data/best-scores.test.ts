import { describe, expect, it } from 'vitest'
import { NEW_SCORE, VOID_SCORE } from '../sim/score'
import { BEST_SCORES_KEY, loadBestScores, saveBestScores, withRunScore } from './best-scores'
import type { FavouritesStore } from './favourites'

const run = (total: number) => ({ ...NEW_SCORE, total })

const memoryStore = (): FavouritesStore & { data: Map<string, string> } => {
  const data = new Map<string, string>()
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) }
}

describe('best scores', () => {
  it('a run (a partial one ended by a death too) replaces a lower best, not a higher one', () => {
    expect(withRunScore({}, 'works/sam', run(12000))).toEqual({ 'works/sam': 12000 })
    expect(withRunScore({ 'works/sam': 12000 }, 'works/sam', run(9999))).toBeNull()
    expect(withRunScore({ 'works/sam': 12000 }, 'works/sam', run(12000))).toBeNull()
    expect(withRunScore({ 'works/sam': 12000, other: 5 }, 'works/sam', run(20000))).toEqual({ 'works/sam': 20000, other: 5 })
  })

  it('a run with no points or played in the continuous world records nothing', () => {
    expect(withRunScore({}, 'works/sam', run(0))).toBeNull()
    expect(withRunScore({}, 'works/sam', { ...VOID_SCORE, total: 5000 })).toBeNull()
  })

  it('round-trips through storage and survives blocked or unreadable storage', () => {
    const store = memoryStore()
    saveBestScores(store, { a: 1 })
    expect(loadBestScores(store)).toEqual({ a: 1 })
    store.data.set(BEST_SCORES_KEY, '["not", "a table"]')
    expect(loadBestScores(store)).toEqual({})
    const blocked: FavouritesStore = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
    expect(loadBestScores(blocked)).toEqual({})
    expect(() => saveBestScores(blocked, { a: 1 })).not.toThrow()
  })
})
