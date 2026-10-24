// Each map's best score (remake scoring, engine notes hud "Scoring"), by map id, kept in the
// player's storage. A generated map keeps one best for its id, whatever the layout's seed. A run
// counts as it goes, a death too: its banked total replaces the best when it is higher. A run
// played in the continuous world has no score and records nothing.
import type { ScoreState } from '../sim/score'
import type { FavouritesStore } from './favourites'

export const BEST_SCORES_KEY = 'mr-remake.bestScores'

export type BestScores = Record<string, number>

const isScoreTable = (v: unknown): v is BestScores =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && Object.values(v).every((n) => typeof n === 'number' && Number.isFinite(n))

/** The stored best scores, or none when storage is blocked or holds something else. */
export function loadBestScores(store: FavouritesStore): BestScores {
  try {
    const v: unknown = JSON.parse(store.getItem(BEST_SCORES_KEY) ?? '{}')
    return isScoreTable(v) ? v : {}
  } catch {
    return {} // storage blocked or unreadable
  }
}

export function saveBestScores(store: FavouritesStore, bests: BestScores): void {
  try {
    store.setItem(BEST_SCORES_KEY, JSON.stringify(bests))
  } catch {
    // storage blocked: the best scores last for this page only
  }
}

/** The best scores with this run's taken in, or null when the run beats nothing (or has no score). */
export function withRunScore(bests: BestScores, mapId: string, score: ScoreState): BestScores | null {
  if (!score.valid || score.total <= (bests[mapId] ?? 0)) return null
  return { ...bests, [mapId]: score.total }
}
