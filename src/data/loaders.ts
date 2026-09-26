// Loads public/generated JSON and PNG (produced by tools/convert-assets.ts) into typed structures
// and PixiJS textures. Tile and frame textures are sub-rectangles of one shared sheet texture.
import { Assets, Rectangle, Texture } from 'pixi.js'
import type { ActorDef } from '../mr-open/mr-actor-data'
import { TILE_PX } from '../mr-open/mr-geometry'
import type { MapDefinition } from '../mr-open/mr-map-format'
import type { TeamDef } from '../mr-open/mr-team-data'
import type { AnimationSet } from '../sim/state'

/** Converter output under public/, resolved against Vite's `base` so the build works from any path. */
const GENERATED = `${import.meta.env.BASE_URL}generated/`

export interface TilesetData {
  tileSize: { x: number; y: number }
  tilesPerRow: number
  symbols: string[]
}

export interface LoadedTileset {
  data: TilesetData
  textures: (Texture | undefined)[] // index i -> tile index i+1; undefined past the sheet
}

export interface LoadedSprite {
  anims: AnimationSet
  frames: Record<string, Texture[]>
  /** per strip, each frame's registration point when the atlas records one (else the frame centre) */
  regs: Record<string, ({ x: number; y: number } | undefined)[]>
}

interface SpriteAtlas {
  animations: Record<string, { delay: number; frames: { x: number; y: number; w: number; h: number; delay?: number; reg?: { x: number; y: number } }[] }>
}

async function json<T>(url: string, check: (v: unknown) => v is T): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`failed to load ${url}: ${res.status}`)
  // The dev server answers unknown paths with the HTML index and status 200, so check the type too.
  const type = res.headers.get('content-type') ?? ''
  if (!type.includes('json')) throw new Error(`${url} is missing (got ${type || 'no content type'}); run pnpm assets:convert`)
  let data: unknown
  try {
    data = await res.json()
  } catch (e) {
    throw new Error(`${url} is not valid JSON: ${e instanceof Error ? e.message : String(e)}`)
  }
  if (!check(data)) throw new Error(`unexpected shape in ${url}`)
  return data
}

// Shape checks: just enough to fail early with the asset URL instead of deep inside the sim.
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const isNum = (v: unknown): v is number => typeof v === 'number'

const isMap = (v: unknown): v is MapDefinition =>
  isObj(v) && isObj(v['mapSize']) && isObj(v['roomSize']) && isObj(v['startRoom']) &&
  isNum(v['startRoom']['x']) && isNum(v['startRoom']['y']) && Array.isArray(v['layers']) && Array.isArray(v['rooms'])

const isTileset = (v: unknown): v is TilesetData =>
  isObj(v) && isObj(v['tileSize']) && isNum(v['tileSize']['x']) && isNum(v['tileSize']['y']) &&
  isNum(v['tilesPerRow']) && Array.isArray(v['symbols'])

const isSpriteAtlas = (v: unknown): v is SpriteAtlas =>
  isObj(v) && isObj(v['animations']) &&
  Object.values(v['animations']).every((a) => isObj(a) && isNum(a['delay']) && Array.isArray(a['frames']) && a['frames'].length > 0)

const isActorDef = (v: unknown): v is ActorDef =>
  isObj(v) && typeof v['key'] === 'string' && typeof v['name'] === 'string' && typeof v['objType'] === 'string' &&
  typeof v['team'] === 'string' && isNum(v['energy']) && isObj(v['friction']) && isObj(v['attack']) && isObj(v['raw'])

const isActors = (v: unknown): v is Record<string, ActorDef> => isObj(v) && Object.values(v).every(isActorDef)

const isTeamDef = (v: unknown): v is TeamDef =>
  isObj(v) && typeof v['key'] === 'string' && typeof v['teamName'] === 'string' && Array.isArray(v['hates']) && Array.isArray(v['friends'])

const isTeams = (v: unknown): v is Record<string, TeamDef> => isObj(v) && Object.values(v).every(isTeamDef)

function nearest(t: Texture): Texture {
  t.source.scaleMode = 'nearest'
  return t
}

function subTexture(sheet: Texture, x: number, y: number, w: number, h: number): Texture {
  return nearest(new Texture({ source: sheet.source, frame: new Rectangle(x, y, w, h) }))
}

export interface MapIndexEntry {
  name: string
  mapSize: { x: number; y: number } // in rooms
}

const isMapIndex = (v: unknown): v is MapIndexEntry[] =>
  Array.isArray(v) &&
  v.every((e) => isObj(e) && typeof e['name'] === 'string' && isObj(e['mapSize']) && isNum(e['mapSize']['x']) && isNum(e['mapSize']['y']))

/** Every converted map (maps/index.json, written by tools/convert-assets.ts). */
export async function loadMapIndex(): Promise<MapIndexEntry[]> {
  return json(`${GENERATED}maps/index.json`, isMapIndex)
}

export async function loadMap(name: string): Promise<MapDefinition> {
  return json(`${GENERATED}maps/${name}.json`, isMap)
}

/** Resolved actor definitions keyed by act_<key> name (tools/convert-assets.ts). */
export async function loadActors(): Promise<Record<string, ActorDef>> {
  const actors = await json(`${GENERATED}actors.json`, isActors)
  if (!actors['player']) throw new Error(`${GENERATED}actors.json has no "player" definition`)
  return actors
}

export async function loadTeams(): Promise<Record<string, TeamDef>> {
  return json(`${GENERATED}teams.json`, isTeams)
}

export interface AudioIndex {
  sounds: string[] // effect names, files at soundUrl(name)
  music: string[] // track names, files at musicUrl(name)
}

const isStrings = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string')
const isAudioIndex = (v: unknown): v is AudioIndex => isObj(v) && isStrings(v['sounds']) && isStrings(v['music'])

/** audio/index.json (tools/convert-assets.ts): every sound effect and music track. */
export async function loadAudioIndex(): Promise<AudioIndex> {
  return json(`${GENERATED}audio/index.json`, isAudioIndex)
}

export const soundUrl = (name: string): string => `${GENERATED}audio/${encodeURIComponent(name)}.wav`
export const musicUrl = (name: string): string => `${GENERATED}audio/${encodeURIComponent(name)}.mp3`

export async function loadTileset(name: string): Promise<LoadedTileset> {
  const url = `${GENERATED}tilesets/${name}.json`
  const data = await json(url, isTileset)
  if (data.tileSize.x !== TILE_PX || data.tileSize.y !== TILE_PX) throw new Error(`${url}: tileSize must be ${TILE_PX}`)
  const sheet = nearest(await Assets.load<Texture>(`${GENERATED}tilesets/${name}.png`))
  // Keys can list more slots than the sheet holds (objTileSet sizes the grid from the bitmap);
  // indices past the sheet get no texture and draw nothing.
  const textures = data.symbols.map((_, i) => {
    const x = (i % data.tilesPerRow) * data.tileSize.x
    const y = Math.floor(i / data.tilesPerRow) * data.tileSize.y
    if (y + data.tileSize.y > sheet.height) return undefined
    return subTexture(sheet, x, y, data.tileSize.x, data.tileSize.y)
  })
  return { data, textures }
}

export async function loadSprite(name: string): Promise<LoadedSprite> {
  const atlas = await json(`${GENERATED}sprites/${name}.json`, isSpriteAtlas)
  const sheet = nearest(await Assets.load<Texture>(`${GENERATED}sprites/${name}.png`))
  const anims: AnimationSet = {}
  const frames: Record<string, Texture[]> = {}
  const regs: LoadedSprite['regs'] = {}
  for (const [anim, def] of Object.entries(atlas.animations)) {
    const first = def.frames[0]!
    const delays = def.frames.map((f) => f.delay ?? def.delay)
    anims[anim] = {
      frames: def.frames.length, delay: def.delay, w: first.w, h: first.h,
      ...(delays.some((d) => d !== def.delay) ? { delays } : {}),
      ...(first.reg ? { reg: first.reg } : {}),
    }
    frames[anim] = def.frames.map((f) => subTexture(sheet, f.x, f.y, f.w, f.h))
    regs[anim] = def.frames.map((f) => f.reg)
  }
  // objAnimSet.symExistsOrDefault falls back to #stand; Merlin's export has no stand strip, so alias walk frame 1
  const walk = anims['walk']
  if (!frames['stand'] && frames['walk'] && walk) {
    frames['stand'] = [frames['walk'][0]!]
    anims['stand'] = { frames: 1, delay: 1, w: walk.w, h: walk.h, ...(walk.reg ? { reg: walk.reg } : {}) }
    regs['stand'] = [regs['walk']?.[0]]
  }
  return { anims, frames, regs }
}
