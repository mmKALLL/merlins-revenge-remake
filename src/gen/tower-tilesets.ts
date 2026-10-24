// The Sorcerer's Tower's tilesets. A map has one tileset per layer, but the Goblin Forest draws
// from merlin4 and the other floors from merlinOpen, so each tower tileset holds merlinOpen's tiles
// followed by merlin4's, with their keys concatenated the same way (tools/convert-assets.ts builds
// the sheets and keys from TOWER_TILESET_PARTS). A floor in the tower moves its tile numbers by
// its part's offset (inTowerTilesets).
import type { LayerName } from '../mr-open/mr-map-format'
import { MERLIN4_OBJECTS, MERLIN4_TILESETS, MERLIN_OPEN_OBJECTS, MERLIN_OPEN_TILESETS, type FloorTheme, type SignTiles, type Weighted } from './themes'

export const TOWER_TILESETS: Record<LayerName, string> = {
  backgroundPassive: 'towerPassive',
  backgroundActive: 'towerActive',
  objects: 'towerObjects',
}

/** Tiles per row in the tower sheets, as in merlinOpen's. */
export const TOWER_TILES_PER_ROW = 10

export interface TowerTilesetPart {
  tileSets: Record<LayerName, string>
  /** object key symbol -> index in the part's own objects tileset */
  objectTiles: Record<string, number>
  /** the part's tile i is tower tile `offset + i`, in every layer */
  offset: number
}

/**
 * merlin4's tiles start after this many tower tiles in every layer: past merlinOpen's longest key
 * (merlinOpenActive, 261 symbols), on a row boundary. convert-assets fails if a part overruns the next.
 */
const MERLIN4_OFFSET = 300

export const TOWER_TILESET_PARTS: readonly TowerTilesetPart[] = [
  { tileSets: MERLIN_OPEN_TILESETS, objectTiles: MERLIN_OPEN_OBJECTS, offset: 0 },
  { tileSets: MERLIN4_TILESETS, objectTiles: MERLIN4_OBJECTS, offset: MERLIN4_OFFSET },
]

/**
 * The tower tile for an object key, from the first part that has it: units in both sets use
 * merlinOpen's tile, so the player is on the key's first `player` tile, where the page looks for
 * the start position.
 */
export function towerObjectTile(key: string): number {
  for (const part of TOWER_TILESET_PARTS) {
    const index = part.objectTiles[key]
    if (index !== undefined) return part.offset + index
  }
  throw new Error(`tower tilesets: no objects tile for "${key}"`)
}

/**
 * A location sign's tiles in the tower's active tileset, from the part holding its own tileset
 * (the Goblin Forest draws from merlin4 but its sign is merlinOpen's).
 */
export function towerSignTiles(sign: SignTiles): SignTiles {
  const part = TOWER_TILESET_PARTS.find((p) => p.tileSets.backgroundActive === sign.tileSet)
  if (!part) throw new Error(`tower tilesets: the sign's tileset ${sign.tileSet} is not part of the tower's`)
  return { tileSet: TOWER_TILESETS.backgroundActive, tiles: sign.tiles.map((t) => t + part.offset) }
}

/** The theme drawing the same tiles from the tower tilesets. */
export function inTowerTilesets(theme: FloorTheme): FloorTheme {
  const part = TOWER_TILESET_PARTS.find((p) => p.tileSets.objects === theme.tileSets.objects)
  if (!part) throw new Error(`theme ${theme.id}: its tilesets are not part of the tower's`)
  const move = (tiles: readonly Weighted<number>[]): Weighted<number>[] => tiles.map((t) => ({ value: t.value + part.offset, weight: t.weight }))
  return {
    ...theme,
    tileSets: TOWER_TILESETS,
    objectTiles: Object.fromEntries(Object.keys(theme.objectTiles).map((key) => [key, towerObjectTile(key)])),
    ground: move(theme.ground),
    wall: move(theme.wall),
    longWall: move(theme.longWall),
    ...(theme.wallAutotile ? { wallAutotile: theme.wallAutotile.map((rule) => ({ ...rule, tiles: move(rule.tiles) })) } : {}),
    materials: theme.materials.map((m) => ({ ...m, tiles: move(m.tiles) })),
    stumps: move(theme.stumps),
    decorations: move(theme.decorations),
    ...(theme.locationSign ? { locationSign: towerSignTiles(theme.locationSign) } : {}),
  }
}
