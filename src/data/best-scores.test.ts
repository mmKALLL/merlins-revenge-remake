import { describe, expect, it } from 'vitest'
import { NEW_SCORE, VOID_SCORE } from '../sim/score'
import {
  BEST_SCORES_KEY, loadBestScores, NO_BEST_SCORES, ROOMS_ONLY_BEST_SCORES_KEY, saveBestScores, withRunScore, WITH_LOADING_BEST_SCORES_KEY, type BestScores, type ModeBests,
} from './best-scores'
import type { FavouritesStore } from './favourites'

const run = (total: number) => ({ ...NEW_SCORE, total })
const modeBests = (rooms: Record<string, number>, continuous: Record<string, number> = {}): ModeBests => ({ rooms, continuous })
/** The same bests in both tables. */
const both = (rooms: Record<string, number>, continuous: Record<string, number> = {}): BestScores =>
  ({ withLoading: modeBests(rooms, continuous), noLoading: modeBests(rooms, continuous) })

const memoryStore = (): FavouritesStore & { data: Map<string, string> } => {
  const data = new Map<string, string>()
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) }
}

describe('best scores', () => {
  it('a run (a partial one ended by a death too) replaces a lower best, not a higher one', () => {
    expect(withRunScore(NO_BEST_SCORES, 'works/sam', 'rooms', run(12000), false)).toEqual(both({ 'works/sam': 12000 }))
    expect(withRunScore(both({ 'works/sam': 12000 }), 'works/sam', 'rooms', run(9999), false)).toBeNull()
    expect(withRunScore(both({ 'works/sam': 12000 }), 'works/sam', 'rooms', run(12000), false)).toBeNull()
    expect(withRunScore(both({ 'works/sam': 12000, other: 5 }), 'works/sam', 'rooms', run(20000), false)).toEqual(both({ 'works/sam': 20000, other: 5 }))
  })

  it('the rooms and the continuous world keep separate bests', () => {
    const bests = withRunScore(both({ 'works/sam': 12000 }), 'works/sam', 'continuous', run(500), false)
    expect(bests).toEqual(both({ 'works/sam': 12000 }, { 'works/sam': 500 }))
    expect(withRunScore(bests!, 'works/sam', 'rooms', run(600), false)).toBeNull()
  })

  it('a run that loaded a save counts only "with loading"; one that never loaded counts in both', () => {
    const loaded = withRunScore(both({ 'works/sam': 100 }), 'works/sam', 'rooms', run(500), true)
    expect(loaded).toEqual({ withLoading: modeBests({ 'works/sam': 500 }), noLoading: modeBests({ 'works/sam': 100 }) })
    // a no-loading run below the with-loading best still raises its own table
    expect(withRunScore(loaded!, 'works/sam', 'rooms', run(300), false)).toEqual({ withLoading: modeBests({ 'works/sam': 500 }), noLoading: modeBests({ 'works/sam': 300 }) })
    expect(withRunScore(loaded!, 'works/sam', 'rooms', run(800), false)).toEqual(both({ 'works/sam': 800 }))
    expect(withRunScore(loaded!, 'works/sam', 'rooms', run(400), true)).toBeNull()
  })

  it('a run with no points or with its world mode switched records nothing', () => {
    expect(withRunScore(NO_BEST_SCORES, 'works/sam', 'rooms', run(0), false)).toBeNull()
    expect(withRunScore(NO_BEST_SCORES, 'works/sam', 'continuous', { ...VOID_SCORE, total: 5000 }, false)).toBeNull()
  })

  it('round-trips through storage and survives blocked or unreadable storage', () => {
    const store = memoryStore()
    const bests: BestScores = { withLoading: modeBests({ a: 3 }, { a: 4 }), noLoading: modeBests({ a: 1 }, { a: 2 }) }
    saveBestScores(store, bests)
    expect(loadBestScores(store)).toEqual(bests)
    store.data.set(BEST_SCORES_KEY, '["not", "a table"]')
    store.data.set(WITH_LOADING_BEST_SCORES_KEY, '["not", "a table"]')
    expect(loadBestScores(store)).toEqual(NO_BEST_SCORES)
    const blocked: FavouritesStore = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
    expect(loadBestScores(blocked)).toEqual(NO_BEST_SCORES)
    expect(() => saveBestScores(blocked, bests)).not.toThrow()
  })

  it('"with loading" starts as a copy of the bests from before saves existed', () => {
    const store = memoryStore()
    store.data.set(BEST_SCORES_KEY, JSON.stringify(modeBests({ 'works/sam': 12000 }, { 'works/sam': 7 })))
    expect(loadBestScores(store)).toEqual(both({ 'works/sam': 12000 }, { 'works/sam': 7 }))
  })

  it('takes the first release\'s single table in as room camera bests until the new tables are saved', () => {
    const store = memoryStore()
    store.data.set(ROOMS_ONLY_BEST_SCORES_KEY, JSON.stringify({ 'works/sam': 12000 }))
    expect(loadBestScores(store)).toEqual(both({ 'works/sam': 12000 }))
    saveBestScores(store, both({ 'works/sam': 12000 }, { 'works/sam': 1 }))
    store.data.set(ROOMS_ONLY_BEST_SCORES_KEY, JSON.stringify({ 'works/sam': 99999 }))
    expect(loadBestScores(store).noLoading.rooms['works/sam']).toBe(12000)
  })
})
