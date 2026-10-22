// Maps built in the browser from a seed instead of loaded from converted JSON. Their ids sit under
// the "randomly_generated/" folder of the map index (tools/convert-assets.ts adds them): one per floor theme,
// numbered in the tower's order so the map browser lists them by difficulty, then the tower.
import type { MapEntry } from '../data/map-tree'
import type { Vec } from '../mr-open/mr-geometry'
import type { MapDefinition } from '../mr-open/mr-map-format'
import { generateFloor, type EnergyOf } from './floor'
import { THEMES, type FloorTheme } from './themes'
import { TOWER_ID, TOWER_SIZE, generateTower } from './tower'

const FOLDER = 'randomly_generated/'

/** A theme's single-floor map id, e.g. randomly_generated/1-goblin-forest. */
export const floorMapId = (theme: FloorTheme): string => `${FOLDER}${THEMES.indexOf(theme) + 1}-${theme.id}`
export const TOWER_MAP_ID = `${FOLDER}${TOWER_ID}`

interface GeneratedMapKind { id: string; mapSize: Vec; generate: (seed: number, energyOf: EnergyOf) => MapDefinition }

const KINDS: readonly GeneratedMapKind[] = [
  ...THEMES.map((t) => ({ id: floorMapId(t), mapSize: t.floorSize, generate: (seed: number, energyOf: EnergyOf) => generateFloor(t, seed, energyOf).map })),
  { id: TOWER_MAP_ID, mapSize: TOWER_SIZE, generate: (seed: number, energyOf: EnergyOf) => generateTower(seed, energyOf).map },
]

export const GENERATED_MAPS: readonly MapEntry[] = KINDS.map((k) => ({ id: k.id, mapSize: { ...k.mapSize } }))

export const isGeneratedMapId = (id: string): boolean => KINDS.some((k) => k.id === id)

/** Ids before the folder was renamed and the floors numbered ("random/goblin-forest"). */
const OLD_FOLDER = 'random/'
const unnumbered = (name: string): string => name.replace(/^\d+-/, '')

/** A generated map id from before the rename as its current id; any other id unchanged. */
export function currentMapId(id: string): string {
  if (!id.startsWith(OLD_FOLDER)) return id
  const name = id.slice(OLD_FOLDER.length)
  return KINDS.find((k) => unnumbered(k.id.slice(FOLDER.length)) === name)?.id ?? id
}

/** The map for a generated map id and seed; the same pair (and actor energies) always gives the same map. */
export function generateMap(id: string, seed: number, energyOf: EnergyOf): MapDefinition {
  const kind = KINDS.find((k) => k.id === id)
  if (!kind) throw new Error(`no generated map "${id}"`)
  return kind.generate(seed, energyOf)
}
