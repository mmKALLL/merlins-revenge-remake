// Each map's best scores (remake scoring, engine notes hud "Scoring"), kept in the player's storage:
// one table per world mode (the room camera's rooms, the follow camera's continuous world), by map
// id. A generated map keeps one best for its id, whatever the layout's seed. A run counts as it goes,
// a death too: its banked total replaces its mode's best when it is higher. A run whose world mode
// was switched has no score and records nothing.
import type { ScoreState } from '../sim/score'
import type { WorldMode } from '../sim/state'
import type { FavouritesStore } from './favourites'

export const BEST_SCORES_KEY = 'mr-remake.bestScoresByMode'
/** The first scoring release's single table, all of it room camera bests. */
export const ROOMS_ONLY_BEST_SCORES_KEY = 'mr-remake.bestScores'

/** Map id -> best total. */
export type ScoreTable = Record<string, number>
export type BestScores = Record<WorldMode, ScoreTable>

export const NO_BEST_SCORES: BestScores = { rooms: {}, continuous: {} }

const isScoreTable = (v: unknown): v is ScoreTable =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && Object.values(v).every((n) => typeof n === 'number' && Number.isFinite(n))

const isBestScores = (v: unknown): v is BestScores =>
  typeof v === 'object' && v !== null && isScoreTable((v as BestScores).rooms) && isScoreTable((v as BestScores).continuous)

function readJson(store: FavouritesStore, key: string): unknown {
  const text = store.getItem(key)
  return text === null ? null : JSON.parse(text)
}

/**
 * The stored best scores; without them the first release's table, as room camera bests. None when
 * storage is blocked or holds something else.
 */
export function loadBestScores(store: FavouritesStore): BestScores {
  try {
    const byMode = readJson(store, BEST_SCORES_KEY)
    if (byMode !== null) return isBestScores(byMode) ? byMode : NO_BEST_SCORES
    const roomsOnly = readJson(store, ROOMS_ONLY_BEST_SCORES_KEY)
    return isScoreTable(roomsOnly) ? { ...NO_BEST_SCORES, rooms: roomsOnly } : NO_BEST_SCORES
  } catch {
    return NO_BEST_SCORES // storage blocked or unreadable
  }
}

export function saveBestScores(store: FavouritesStore, bests: BestScores): void {
  try {
    store.setItem(BEST_SCORES_KEY, JSON.stringify(bests))
  } catch {
    // storage blocked: the best scores last for this page only
  }
}

/**
 * The best scores with a run's taken in (`mode`: the world mode it was played in), or null when the
 * run beats nothing (or has no score).
 */
export function withRunScore(bests: BestScores, mapId: string, mode: WorldMode, score: ScoreState): BestScores | null {
  const table = bests[mode]
  if (!score.valid || score.total <= (table[mapId] ?? 0)) return null
  return { ...bests, [mode]: { ...table, [mapId]: score.total } }
}
