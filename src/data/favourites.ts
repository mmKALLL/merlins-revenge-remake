// Favourite maps: a list of map ids in the order they were added, kept in the player's storage.
// The storage is passed in (localStorage in the browser) so the rules can be tested without a DOM.
import type { MapEntry } from './map-tree'

export const FAVOURITES_KEY = 'mr-remake.favourites'

/** The part of the Web Storage API the favourites use. */
export interface FavouritesStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

const isIdList = (v: unknown): v is string[] => Array.isArray(v) && v.every((id) => typeof id === 'string')

/** The stored favourites, or none when storage is blocked or holds something else. */
export function loadFavourites(store: FavouritesStore): string[] {
  try {
    const v: unknown = JSON.parse(store.getItem(FAVOURITES_KEY) ?? '[]')
    return isIdList(v) ? [...new Set(v)] : []
  } catch {
    return [] // storage blocked or unreadable
  }
}

export function saveFavourites(store: FavouritesStore, ids: readonly string[]): void {
  try {
    store.setItem(FAVOURITES_KEY, JSON.stringify(ids))
  } catch {
    // storage blocked: the favourites last for this page only
  }
}

/** Adds a map to the end of the favourites, or removes it when it is already there. */
export const toggleFavourite = (ids: readonly string[], id: string): string[] =>
  ids.includes(id) ? ids.filter((f) => f !== id) : [...ids, id]

const byId = (a: MapEntry, b: MapEntry): number => {
  const la = a.id.toLowerCase()
  const lb = b.id.toLowerCase()
  return la < lb ? -1 : la > lb ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/** The favourites to list: those still in the map index, sorted case-insensitively by id. */
export function favouriteEntries(ids: readonly string[], index: readonly MapEntry[]): MapEntry[] {
  const favourite = new Set(ids)
  return index.filter((e) => favourite.has(e.id)).sort(byId)
}
