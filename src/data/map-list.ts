// The maps the Maps menu lists: the converted map index plus entries registered at run time, for
// maps that have no converted file (e.g. generated maps, loaded by their own `?map=` id).
import { loadMapIndex } from './loaders'
import type { MapEntry } from './map-tree'

const extraEntries: MapEntry[] = []

/** Lists more maps in the Maps menu; an id already listed is skipped. Call before the menu is built. */
export function addMapEntries(entries: readonly MapEntry[]): void {
  for (const e of entries) if (!extraEntries.some((x) => x.id === e.id)) extraEntries.push(e)
}

/** Every listed map: the converted index, then the registered entries it does not already have. */
export async function loadMapList(): Promise<MapEntry[]> {
  const index = await loadMapIndex()
  const known = new Set(index.map((e) => e.id))
  return [...index, ...extraEntries.filter((e) => !known.has(e.id))]
}
