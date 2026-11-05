// Each map's best scores (remake scoring, engine notes hud "Scoring"), kept in the player's storage:
// one table per world mode (the room camera's rooms, the follow camera's continuous world), by map
// id. A generated map keeps one best for its id, whatever the layout's seed. A run counts as it goes,
// a death too: its banked total replaces its mode's best when it is higher. A run whose world mode
// was switched has no score and records nothing. There are two sets of tables (engine notes
// save-load): "with loading" takes every run, "no loading" only the runs that never loaded a save.
import type { ScoreState } from '../sim/score'
import type { WorldMode } from '../sim/state'
import type { FavouritesStore } from './favourites'

/** The "no loading" tables (the only ones before saves existed). */
export const BEST_SCORES_KEY = 'mr-remake.bestScoresByMode'
/** The first scoring release's single table, all of it room camera bests. */
export const ROOMS_ONLY_BEST_SCORES_KEY = 'mr-remake.bestScores'
/** The "with loading" tables; until they are first saved, a copy of the "no loading" ones. */
export const WITH_LOADING_BEST_SCORES_KEY = 'mr-remake.bestScoresWithLoading'

/** Which runs a set of tables takes: every run, or only the runs that never loaded a save. */
export const BEST_SCORE_KINDS = ['withLoading', 'noLoading'] as const
export type BestScoreKind = (typeof BEST_SCORE_KINDS)[number]

/** Map id -> best total. */
export type ScoreTable = Record<string, number>
export type ModeBests = Record<WorldMode, ScoreTable>
export type BestScores = Record<BestScoreKind, ModeBests>

const NO_MODE_BESTS: ModeBests = { rooms: {}, continuous: {} }
export const NO_BEST_SCORES: BestScores = { withLoading: NO_MODE_BESTS, noLoading: NO_MODE_BESTS }

const isScoreTable = (v: unknown): v is ScoreTable =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && Object.values(v).every((n) => typeof n === 'number' && Number.isFinite(n))

const isModeBests = (v: unknown): v is ModeBests =>
  typeof v === 'object' && v !== null && isScoreTable((v as ModeBests).rooms) && isScoreTable((v as ModeBests).continuous)

function readJson(store: FavouritesStore, key: string): unknown {
  const text = store.getItem(key)
  return text === null ? null : JSON.parse(text)
}

/** The "no loading" tables; without them the first release's table, as room camera bests. */
function loadNoLoading(store: FavouritesStore): ModeBests {
  const byMode = readJson(store, BEST_SCORES_KEY)
  if (byMode !== null) return isModeBests(byMode) ? byMode : NO_MODE_BESTS
  const roomsOnly = readJson(store, ROOMS_ONLY_BEST_SCORES_KEY)
  return isScoreTable(roomsOnly) ? { ...NO_MODE_BESTS, rooms: roomsOnly } : NO_MODE_BESTS
}

/**
 * The stored best scores; "with loading" starts as a copy of "no loading" (the bests from before
 * saves existed). None when storage is blocked or holds something else.
 */
export function loadBestScores(store: FavouritesStore): BestScores {
  try {
    const noLoading = loadNoLoading(store)
    const withLoading = readJson(store, WITH_LOADING_BEST_SCORES_KEY)
    if (withLoading === null) return { withLoading: noLoading, noLoading }
    return { withLoading: isModeBests(withLoading) ? withLoading : NO_MODE_BESTS, noLoading }
  } catch {
    return NO_BEST_SCORES // storage blocked or unreadable
  }
}

export function saveBestScores(store: FavouritesStore, bests: BestScores): void {
  try {
    store.setItem(BEST_SCORES_KEY, JSON.stringify(bests.noLoading))
    store.setItem(WITH_LOADING_BEST_SCORES_KEY, JSON.stringify(bests.withLoading))
  } catch {
    // storage blocked: the best scores last for this page only
  }
}

/** The tables a run counts in: a run that loaded a save only "with loading". */
const kindsFor = (loaded: boolean): readonly BestScoreKind[] => (loaded ? ['withLoading'] : BEST_SCORE_KINDS)

/**
 * The best scores with a run's taken in (`mode`: the world mode it was played in; `loaded`: the run
 * loaded a save), or null when the run beats nothing (or has no score).
 */
export function withRunScore(bests: BestScores, mapId: string, mode: WorldMode, score: ScoreState, loaded: boolean): BestScores | null {
  if (!score.valid) return null
  let next: BestScores | null = null
  for (const kind of kindsFor(loaded)) {
    const table = bests[kind][mode]
    if (score.total <= (table[mapId] ?? 0)) continue
    next = { ...(next ?? bests), [kind]: { ...bests[kind], [mode]: { ...table, [mapId]: score.total } } }
  }
  return next
}
