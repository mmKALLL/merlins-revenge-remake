// Loads public/generated JSON and PNG (produced by tools/convert-assets.ts) into typed structures
// and PixiJS textures. Tile and frame textures are sub-rectangles of one shared sheet texture.
import { Assets, Rectangle, Texture } from 'pixi.js'
import type { MapDefinition } from '../mr-open/mr-map-format'
import type { AnimationSet } from '../sim/state'

export interface TilesetData {
  tileSize: { x: number; y: number }
  tilesPerRow: number
  symbols: string[]
}

export interface LoadedTileset {
  data: TilesetData
  textures: Texture[] // index i -> tile index i+1
}

export interface LoadedSprite {
  anims: AnimationSet
  frames: Record<string, Texture[]>
}

interface SpriteAtlas {
  animations: Record<string, { delay: number; frames: { x: number; y: number; w: number; h: number }[] }>
}

async function json<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`failed to load ${url}: ${res.status}`)
  return (await res.json()) as T
}

function nearest(t: Texture): Texture {
  t.source.scaleMode = 'nearest'
  return t
}

function subTexture(sheet: Texture, x: number, y: number, w: number, h: number): Texture {
  return nearest(new Texture({ source: sheet.source, frame: new Rectangle(x, y, w, h) }))
}

export async function loadMap(name: string): Promise<MapDefinition> {
  return json<MapDefinition>(`/generated/maps/${name}.json`)
}

export async function loadTileset(name: string): Promise<LoadedTileset> {
  const data = await json<TilesetData>(`/generated/tilesets/${name}.json`)
  const sheet = nearest(await Assets.load<Texture>(`/generated/tilesets/${name}.png`))
  const textures = data.symbols.map((_, i) => {
    const x = (i % data.tilesPerRow) * data.tileSize.x
    const y = Math.floor(i / data.tilesPerRow) * data.tileSize.y
    return subTexture(sheet, x, y, data.tileSize.x, data.tileSize.y)
  })
  return { data, textures }
}

export async function loadSprite(name: string): Promise<LoadedSprite> {
  const atlas = await json<SpriteAtlas>(`/generated/sprites/${name}.json`)
  const sheet = nearest(await Assets.load<Texture>(`/generated/sprites/${name}.png`))
  const anims: AnimationSet = {}
  const frames: Record<string, Texture[]> = {}
  for (const [anim, def] of Object.entries(atlas.animations)) {
    anims[anim] = { frames: def.frames.length, delay: def.delay }
    frames[anim] = def.frames.map((f) => subTexture(sheet, f.x, f.y, f.w, f.h))
  }
  // objAnimSet.symExistsOrDefault falls back to #stand; the export has no stand strip, so alias walk frame 1
  if (!frames['stand'] && frames['walk']) {
    frames['stand'] = [frames['walk'][0]!]
    anims['stand'] = { frames: 1, delay: 1 }
  }
  return { anims, frames }
}
