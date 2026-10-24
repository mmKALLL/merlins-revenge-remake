// The roguelite statistics (docs/plans/2026-10-25-roguelite-mode-design.md, Statistics), kept in the
// player's storage: runs and wins (the win ratio), how often each floor was the furthest reached, and
// the current and best win streak. An abandoned run (the page left, Quit or Restart while a run was
// in progress) resets the streak and counts nowhere else: `inProgress` stays set until the next run
// starts and finds it.
import type { FavouritesStore } from './favourites'

export const ROGUELITE_STATS_KEY = 'mr-remake.rogueliteStats'

export interface RogueliteStats {
  /** finished runs: deaths and wins, not abandoned ones */
  runs: number
  wins: number
  /** by floor (0 = the first): the runs that died on it (wins are counted in `wins` only) */
  floorsReached: number[]
  streak: number
  bestStreak: number
  /** a run has started and not yet ended */
  inProgress: boolean
}

export const NO_ROGUELITE_STATS: RogueliteStats = { runs: 0, wins: 0, floorsReached: [], streak: 0, bestStreak: 0, inProgress: false }

/** A run starts; one still in progress was abandoned, which ends the streak. */
export const withRunStarted = (stats: RogueliteStats): RogueliteStats =>
  ({ ...stats, streak: stats.inProgress ? 0 : stats.streak, inProgress: true })

/** A run ends on `floor` (0 = the first), in a win or a death; a death is counted on its floor. */
export function withRunEnded(stats: RogueliteStats, floor: number, won: boolean): RogueliteStats {
  const floorsReached = [...stats.floorsReached]
  while (floorsReached.length <= floor) floorsReached.push(0)
  if (!won) floorsReached[floor]!++
  const streak = won ? stats.streak + 1 : 0
  return {
    runs: stats.runs + 1,
    wins: stats.wins + (won ? 1 : 0),
    floorsReached,
    streak,
    bestStreak: Math.max(stats.bestStreak, streak),
    inProgress: false,
  }
}

/** The statistics cleared (Settings); a run in progress stays in progress, so its end still counts. */
export const withStatsReset = (stats: RogueliteStats): RogueliteStats => ({ ...NO_ROGUELITE_STATS, inProgress: stats.inProgress })

/** Wins per finished run, 0-1; 0 before the first. */
export const winRatio = (stats: RogueliteStats): number => (stats.runs === 0 ? 0 : stats.wins / stats.runs)

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0

function isStats(v: unknown): v is RogueliteStats {
  if (typeof v !== 'object' || v === null) return false
  const s = v as RogueliteStats
  return [s.runs, s.wins, s.streak, s.bestStreak].every(isCount)
    && Array.isArray(s.floorsReached) && s.floorsReached.every(isCount)
    && typeof s.inProgress === 'boolean'
}

/** The stored statistics; none when storage is blocked or holds something else. */
export function loadRogueliteStats(store: FavouritesStore): RogueliteStats {
  try {
    const text = store.getItem(ROGUELITE_STATS_KEY)
    const v: unknown = text === null ? null : JSON.parse(text)
    return isStats(v) ? v : NO_ROGUELITE_STATS
  } catch {
    return NO_ROGUELITE_STATS // storage blocked or unreadable
  }
}

export function saveRogueliteStats(store: FavouritesStore, stats: RogueliteStats): void {
  try {
    store.setItem(ROGUELITE_STATS_KEY, JSON.stringify(stats))
  } catch {
    // storage blocked: the statistics last for this page only
  }
}
