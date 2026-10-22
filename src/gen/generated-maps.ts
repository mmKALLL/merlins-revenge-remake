// Maps built in the browser from a seed instead of loaded from converted JSON. Their ids sit under
// the "random/" folder of the map index (tools/convert-assets.ts adds them): one per floor theme,
// numbered in the tower's order so the map browser lists them by difficulty, then the tower.
import type { MapEntry } from '../data/map-tree'
import type { Vec } from '../mr-open/mr-geometry'
import type { MapDefinition } from '../mr-open/mr-map-format'
import { generateFloor } from './floor'
import { THEMES, type FloorTheme } from './themes'
import { TOWER_ID, TOWER_SIZE, generateTower } from './tower'

const FOLDER = 'random/'

/** A theme's single-floor map id, e.g. random/1-goblin-forest. */
export const floorMapId = (theme: FloorTheme): string => `${FOLDER}${THEMES.indexOf(theme) + 1}-${theme.id}`
export const TOWER_MAP_ID = `${FOLDER}${TOWER_ID}`

interface GeneratedMapKind { id: string; mapSize: Vec; generate: (seed: number) => MapDefinition }

const KINDS: readonly GeneratedMapKind[] = [
  ...THEMES.map((t) => ({ id: floorMapId(t), mapSize: t.floorSize, generate: (seed: number) => generateFloor(t, seed).map })),
  { id: TOWER_MAP_ID, mapSize: TOWER_SIZE, generate: (seed: number) => generateTower(seed).map },
]

export const GENERATED_MAPS: readonly MapEntry[] = KINDS.map((k) => ({ id: k.id, mapSize: { ...k.mapSize } }))

export const isGeneratedMapId = (id: string): boolean => KINDS.some((k) => k.id === id)

/** The map for a generated map id and seed; the same pair always gives the same map. */
export function generateMap(id: string, seed: number): MapDefinition {
  const kind = KINDS.find((k) => k.id === id)
  if (!kind) throw new Error(`no generated map "${id}"`)
  return kind.generate(seed)
}
