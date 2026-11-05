// The autosaves (docs/plans/2026-11-06-save-load-design.md): one per map id, each under its own key,
// holding the sim snapshot (debug/sim-snapshot.ts) and what the page needs besides to carry the run
// on. An index lists the saves by the time they were written, so at most MAX_SAVES are kept. A save
// that no longer parses, or holds a snapshot of another version, reads as none and is dropped.
// Storage may be blocked or full; then a save is quietly not kept.
import { DIFFICULTIES, type Difficulty } from '../sim/difficulty'
import { fromSnapshotJson, parseSnapshot, toSnapshotJson, type SimSnapshot } from '../debug/sim-snapshot'
import type { RemovableStore } from './favourites'

export const SAVE_KEY_PREFIX = 'mr-remake.save.'
export const SAVE_INDEX_KEY = 'mr-remake.saves'
/** Saves kept at most; writing another map's drops the least recently written. */
export const MAX_SAVES = 20

export interface MapSave {
  snapshot: SimSnapshot
  /** the run had loaded a save before this one was written (scoring: "with loading") */
  loaded: boolean
  /** a generated map's layout seed (the layout is rebuilt from it); null for a map from a file */
  layoutSeed: number | null
  /** the run's difficulty: Merlin's energy and maximum come from it */
  difficulty: Difficulty
  /** the music playing (soundMaster's track, saved by the original too) */
  music: string | null
}

interface IndexEntry {
  mapId: string
  writtenAt: number
}

export const saveKey = (mapId: string): string => `${SAVE_KEY_PREFIX}${mapId}`

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

const isIndexEntry = (v: unknown): v is IndexEntry => isObj(v) && typeof v['mapId'] === 'string' && typeof v['writtenAt'] === 'number'

/** The index, oldest first; empty when storage is blocked or holds something else. */
function readIndex(store: RemovableStore): IndexEntry[] {
  try {
    const v: unknown = JSON.parse(store.getItem(SAVE_INDEX_KEY) ?? '[]')
    return Array.isArray(v) ? v.filter(isIndexEntry).sort((a, b) => a.writtenAt - b.writtenAt) : []
  } catch {
    return []
  }
}

function writeIndex(store: RemovableStore, index: readonly IndexEntry[]): void {
  try {
    store.setItem(SAVE_INDEX_KEY, JSON.stringify(index))
  } catch {
    // storage blocked or full: the saves stay, the index keeps its old entries
  }
}

function removeSaveItem(store: RemovableStore, mapId: string): void {
  try {
    store.removeItem(saveKey(mapId))
  } catch {
    // storage blocked
  }
}

/** A stored save's fields checked; the snapshot by parseSnapshot, which throws on another version. */
function parseSave(text: string, mapId: string): MapSave | null {
  const v = fromSnapshotJson(text)
  if (!isObj(v)) return null
  const snapshot = parseSnapshot(v['snapshot'] as SimSnapshot)
  const { loaded, layoutSeed, difficulty, music } = v
  if (snapshot.mapId !== mapId || typeof loaded !== 'boolean') return null
  if (layoutSeed !== null && typeof layoutSeed !== 'number') return null
  if (!DIFFICULTIES.some((d) => d === difficulty) || (music !== null && typeof music !== 'string')) return null
  return { snapshot, loaded, layoutSeed, difficulty: difficulty as Difficulty, music }
}

/** The map's save, or null. One that does not parse or is of another snapshot version is dropped. */
export function readSave(store: RemovableStore, mapId: string): MapSave | null {
  let text: string | null
  try {
    text = store.getItem(saveKey(mapId))
  } catch {
    return null // storage blocked
  }
  if (text === null) return null
  let save: MapSave | null = null
  try {
    save = parseSave(text, mapId)
  } catch {
    // unreadable, or another snapshot version
  }
  if (save === null) dropSave(store, mapId)
  return save
}

/**
 * Writes a map's save (`writtenAt`: the time, for the cap). Beyond MAX_SAVES the least recently
 * written are dropped; a write that fails (storage full) drops the oldest other save and tries once more.
 */
export function writeSave(store: RemovableStore, save: MapSave, writtenAt: number = Date.now()): void {
  const { mapId } = save.snapshot
  const index = readIndex(store)
  const previous = index.filter((e) => e.mapId === mapId) // kept with its save when the write fails
  const others = index.filter((e) => e.mapId !== mapId)
  while (others.length >= MAX_SAVES) removeSaveItem(store, others.shift()!.mapId)
  const text = toSnapshotJson(save)
  const attempt = (): boolean => {
    try {
      store.setItem(saveKey(mapId), text)
      return true
    } catch {
      return false
    }
  }
  let written = attempt()
  if (!written && others.length > 0) {
    removeSaveItem(store, others.shift()!.mapId)
    written = attempt()
  }
  writeIndex(store, [...others, ...(written ? [{ mapId, writtenAt }] : previous)])
}

/** Removes the map's save, if it has one. */
export function dropSave(store: RemovableStore, mapId: string): void {
  removeSaveItem(store, mapId)
  const index = readIndex(store)
  if (index.some((e) => e.mapId === mapId)) writeIndex(store, index.filter((e) => e.mapId !== mapId))
}

/** The ids of the maps with a save (as the index lists them). */
export const savedMapIds = (store: RemovableStore): Set<string> => new Set(readIndex(store).map((e) => e.mapId))
