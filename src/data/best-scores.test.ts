import { describe, expect, it } from 'vitest'
import { NEW_SCORE, VOID_SCORE } from '../sim/score'
import { BEST_SCORES_KEY, loadBestScores, NO_BEST_SCORES, ROOMS_ONLY_BEST_SCORES_KEY, saveBestScores, withRunScore } from './best-scores'
import type { FavouritesStore } from './favourites'

const run = (total: number) => ({ ...NEW_SCORE, total })
const roomBests = (rooms: Record<string, number>) => ({ ...NO_BEST_SCORES, rooms })

const memoryStore = (): FavouritesStore & { data: Map<string, string> } => {
  const data = new Map<string, string>()
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) }
}

describe('best scores', () => {
  it('a run (a partial one ended by a death too) replaces a lower best, not a higher one', () => {
    expect(withRunScore(NO_BEST_SCORES, 'works/sam', 'rooms', run(12000))).toEqual(roomBests({ 'works/sam': 12000 }))
    expect(withRunScore(roomBests({ 'works/sam': 12000 }), 'works/sam', 'rooms', run(9999))).toBeNull()
    expect(withRunScore(roomBests({ 'works/sam': 12000 }), 'works/sam', 'rooms', run(12000))).toBeNull()
    expect(withRunScore(roomBests({ 'works/sam': 12000, other: 5 }), 'works/sam', 'rooms', run(20000))).toEqual(roomBests({ 'works/sam': 20000, other: 5 }))
  })

  it('the rooms and the continuous world keep separate bests', () => {
    const bests = withRunScore(roomBests({ 'works/sam': 12000 }), 'works/sam', 'continuous', run(500))
    expect(bests).toEqual({ rooms: { 'works/sam': 12000 }, continuous: { 'works/sam': 500 } })
    expect(withRunScore(bests!, 'works/sam', 'rooms', run(600))).toBeNull()
  })

  it('a run with no points or with its world mode switched records nothing', () => {
    expect(withRunScore(NO_BEST_SCORES, 'works/sam', 'rooms', run(0))).toBeNull()
    expect(withRunScore(NO_BEST_SCORES, 'works/sam', 'continuous', { ...VOID_SCORE, total: 5000 })).toBeNull()
  })

  it('round-trips through storage and survives blocked or unreadable storage', () => {
    const store = memoryStore()
    const bests = { rooms: { a: 1 }, continuous: { a: 2 } }
    saveBestScores(store, bests)
    expect(loadBestScores(store)).toEqual(bests)
    store.data.set(BEST_SCORES_KEY, '["not", "a table"]')
    expect(loadBestScores(store)).toEqual(NO_BEST_SCORES)
    const blocked: FavouritesStore = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
    expect(loadBestScores(blocked)).toEqual(NO_BEST_SCORES)
    expect(() => saveBestScores(blocked, bests)).not.toThrow()
  })

  it('takes the first release\'s single table in as room camera bests until the new table is saved', () => {
    const store = memoryStore()
    store.data.set(ROOMS_ONLY_BEST_SCORES_KEY, JSON.stringify({ 'works/sam': 12000 }))
    expect(loadBestScores(store)).toEqual(roomBests({ 'works/sam': 12000 }))
    saveBestScores(store, { rooms: { 'works/sam': 12000 }, continuous: { 'works/sam': 1 } })
    store.data.set(ROOMS_ONLY_BEST_SCORES_KEY, JSON.stringify({ 'works/sam': 99999 }))
    expect(loadBestScores(store).rooms['works/sam']).toBe(12000)
  })
})
