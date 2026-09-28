// Maps built in the browser from a seed instead of loaded from converted JSON. Their ids sit under
// the "random/" folder of the map index (tools/convert-assets.ts adds them), one per floor theme.
import type { MapEntry } from '../data/map-tree'
import type { MapDefinition } from '../mr-open/mr-map-format'
import { FLOOR_SIZE, generateFloor } from './floor'
import { THEMES, type FloorTheme } from './themes'

const FOLDER = 'random/'

const idOf = (theme: FloorTheme): string => `${FOLDER}${theme.id}`

export const GENERATED_MAPS: readonly MapEntry[] = THEMES.map((t) => ({ id: idOf(t), mapSize: { ...FLOOR_SIZE } }))

export const isGeneratedMapId = (id: string): boolean => THEMES.some((t) => idOf(t) === id)

/** The floor for a generated map id and seed; the same pair always gives the same map. */
export function generateMap(id: string, seed: number): MapDefinition {
  const theme = THEMES.find((t) => idOf(t) === id)
  if (!theme) throw new Error(`no generated map "${id}"`)
  return generateFloor(theme, seed).map
}
