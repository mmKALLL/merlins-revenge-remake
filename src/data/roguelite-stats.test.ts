import { describe, expect, it } from 'vitest'
import type { FavouritesStore } from './favourites'
import {
  loadRogueliteStats, NO_ROGUELITE_STATS, ROGUELITE_STATS_KEY, saveRogueliteStats, winRatio, withRunEnded, withRunStarted, withStatsReset, type RogueliteStats,
} from './roguelite-stats'

const LAST_FLOOR = 3

const memoryStore = (): FavouritesStore & { data: Map<string, string> } => {
  const data = new Map<string, string>()
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) }
}

const blockedStore: FavouritesStore = {
  getItem: () => { throw new Error('SecurityError') },
  setItem: () => { throw new Error('SecurityError') },
}

const win = (s: RogueliteStats) => withRunEnded(withRunStarted(s), LAST_FLOOR, true)
const death = (s: RogueliteStats, floor: number) => withRunEnded(withRunStarted(s), floor, false)

describe('roguelite statistics', () => {
  it('a win counts and extends the streak and the best streak', () => {
    const two = win(win(NO_ROGUELITE_STATS))
    expect(two).toMatchObject({ runs: 2, wins: 2, streak: 2, bestStreak: 2, inProgress: false })
    expect(winRatio(two)).toBe(1)
  })

  it('a death counts and resets the streak, keeping the best', () => {
    const s = death(win(win(NO_ROGUELITE_STATS)), 1)
    expect(s).toMatchObject({ runs: 3, wins: 2, streak: 0, bestStreak: 2, inProgress: false })
    expect(winRatio(s)).toBeCloseTo(2 / 3)
  })

  it('an abandoned run resets the streak only: no run, no win, no floor', () => {
    const before = win(win(NO_ROGUELITE_STATS))
    const abandoned = withRunStarted(before) // the page is left before the run ends
    expect(withRunStarted(abandoned)).toEqual({ ...before, streak: 0, inProgress: true })
    expect(win(abandoned)).toMatchObject({ runs: 3, wins: 3, streak: 1, bestStreak: 2 })
  })

  it('counts each death on its floor, and a win only as a win (not on the last floor)', () => {
    const s = win(death(death(death(NO_ROGUELITE_STATS, 0), 2), 0))
    expect(s.floorsReached).toEqual([2, 0, 1, 0])
    expect(s.wins).toBe(1)
    expect(winRatio(NO_ROGUELITE_STATS)).toBe(0)
  })

  it('a reset clears everything but a run in progress', () => {
    const s = withRunStarted(death(win(NO_ROGUELITE_STATS), 1))
    expect(withStatsReset(s)).toEqual({ ...NO_ROGUELITE_STATS, inProgress: true })
  })

  it('round-trips through storage; blocked or foreign storage gives none without throwing', () => {
    const store = memoryStore()
    const s = death(NO_ROGUELITE_STATS, 1)
    saveRogueliteStats(store, s)
    expect(loadRogueliteStats(store)).toEqual(s)
    store.data.set(ROGUELITE_STATS_KEY, '{"runs":"lots"}')
    expect(loadRogueliteStats(store)).toEqual(NO_ROGUELITE_STATS)
    store.data.set(ROGUELITE_STATS_KEY, 'not json')
    expect(loadRogueliteStats(store)).toEqual(NO_ROGUELITE_STATS)
    expect(() => saveRogueliteStats(blockedStore, s)).not.toThrow()
    expect(loadRogueliteStats(blockedStore)).toEqual(NO_ROGUELITE_STATS)
  })
})
