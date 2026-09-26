// Converts ./assets into ./public/generated for the browser. Run: pnpm assets:convert
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'
import { resolveActors, type ActorDef, type Plain, needsSprite } from '../src/mr-open/mr-actor-data'
import { parseMapFile, type MapDefinition } from '../src/mr-open/mr-map-format'
import { parseTeams } from '../src/mr-open/mr-team-data'
import { parseTileKey } from '../src/mr-open/mr-tile-key'
import { buildAtlas, parseFrameName } from './atlas'
import { applyMapPatch, type MapPatch } from './map-patch'
import { decodeBmp, type RgbaImage } from './bmp'
import { buildPlaceholderTileset, TILES_PER_ROW } from './placeholder-tileset'
import { tileCapacity, tilesPerRow, usesWhiteTransparency, whiteToAlpha } from './tileset-sheet'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const ASSETS = join(ROOT, 'assets')
const OUT = join(ROOT, 'public', 'generated')

const sortedDir = (dir: string): string[] => readdirSync(dir).sort()
const sortedTxt = (dir: string): string[] => sortedDir(dir).filter((f) => f.endsWith('.txt'))
const stripTxt = (f: string): string => f.replace(/\.txt$/, '')

/** { key: text } for every .txt in an assets subfolder. */
function readTxtDir(sub: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const f of sortedTxt(join(ASSETS, sub))) out[stripTxt(f)] = readFileSync(join(ASSETS, sub, f), 'utf8')
  return out
}

function convertMaps(): MapDefinition[] {
  const maps: MapDefinition[] = []
  for (const file of sortedTxt(join(ASSETS, 'maps'))) {
    const name = stripTxt(file)
    let def: MapDefinition
    try {
      def = parseMapFile(readFileSync(join(ASSETS, 'maps', file), 'utf8'))
    } catch (err) {
      console.log(`map ${name}: SKIPPED, failed to parse: ${err instanceof Error ? err.message : String(err)}`)
      continue
    }
    const patchFile = join(ASSETS, 'map-patches', `${name}.json`)
    let patched = ''
    if (existsSync(patchFile)) {
      const patch = JSON.parse(readFileSync(patchFile, 'utf8')) as MapPatch
      const objectsSet = def.layers.find((l) => l.name === 'objects')?.tileSet
      if (!objectsSet) throw new Error(`map patch ${name}: map has no objects layer`)
      const key = parseTileKey(readFileSync(join(ASSETS, 'tile-keys', `${objectsSet}.txt`), 'utf8'))
      def = applyMapPatch(def, patch, key.symbols, name)
      patched = ` (+${patch.objects.length} patched objects)`
    }
    maps.push(def)
    writeFileSync(join(OUT, 'maps', `${name}.json`), JSON.stringify(def))
    console.log(`map ${name}: ${def.mapSize.x}x${def.mapSize.y} rooms${patched}`)
  }
  return maps
}

/** highest tile index referenced per tileset name, across all converted maps */
function maxTileIndexByTileSet(maps: MapDefinition[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const def of maps) {
    for (const layer of def.layers) {
      let max = out.get(layer.tileSet) ?? 0
      for (const room of def.rooms) {
        for (const row of room.layers[layer.name] ?? []) for (const i of row) if (i > max) max = i
      }
      out.set(layer.tileSet, max)
    }
  }
  return out
}

/** tile keys and sheets: real art from assets/tilesets when present, else a placeholder */
function convertTileSets(maxIndexByTileSet: Map<string, number>): void {
  const converted = new Set<string>()
  for (const file of sortedTxt(join(ASSETS, 'tile-keys'))) {
    const key = parseTileKey(readFileSync(join(ASSETS, 'tile-keys', file), 'utf8'))
    const name = stripTxt(file)
    converted.add(name)
    const symbols = [...key.symbols]
    const sheetPath = join(ASSETS, 'tilesets', `${name}.png`)
    const sheet = existsSync(sheetPath) ? readPng(sheetPath) : undefined
    const perRow = sheet ? tilesPerRow(sheet.width, key.tileSize.x) : TILES_PER_ROW
    const capacity = sheet ? tileCapacity(sheet.width, sheet.height, key.tileSize) : 0
    const needed = Math.max(maxIndexByTileSet.get(name) ?? 0, capacity)
    const padded = Math.max(0, needed - symbols.length)
    while (symbols.length < needed) symbols.push('none')
    writeFileSync(
      join(OUT, 'tilesets', `${name}.json`),
      JSON.stringify({ tileSize: key.tileSize, tilesPerRow: perRow, symbols }),
    )
    const img = sheet
      ? usesWhiteTransparency(name)
        ? whiteToAlpha(sheet)
        : sheet
      : buildPlaceholderTileset(symbols, key.tileSize)
    writePng(join(OUT, 'tilesets', `${name}.png`), img)
    const art = sheet ? `real art, ${sheet.width}x${sheet.height}, ${perRow} per row` : 'placeholder art'
    console.log(`tileset ${name}: ${symbols.length} tiles (${art}${padded ? `, ${padded} padded` : ''})`)
  }
  const missing = [...maxIndexByTileSet.keys()].filter((n) => !converted.has(n)).sort()
  if (missing.length > 0) {
    console.warn(`WARNING: maps reference tilesets with no key file in assets/tile-keys: ${missing.join(', ')}`)
  }
}

const isPlain = (v: unknown): v is Plain => typeof v === 'object' && v !== null && !Array.isArray(v)

/** assets/tuning.json: { actorKey: { field: value, ... } }; anything else is a data error named by file */
function readTuning(): Record<string, Plain> {
  const path = join(ASSETS, 'tuning.json')
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'))
  } catch (err) {
    throw new Error(`${path}: invalid JSON: ${err instanceof Error ? err.message : String(err)}`)
  }
  if (!isPlain(parsed)) throw new Error(`${path}: must be an object keyed by actor, got ${JSON.stringify(parsed)}`)
  for (const [key, overlay] of Object.entries(parsed)) {
    if (!isPlain(overlay)) throw new Error(`${path}: ${key} must be an object of fields, got ${JSON.stringify(overlay)}`)
  }
  return parsed as Record<string, Plain>
}

/** actor definitions resolved through their inheritance chain, with assets/tuning.json overlaid */
function convertActors(): Record<string, ActorDef> {
  const tuning = readTuning()
  const actors = resolveActors(readTxtDir('actors'), tuning)
  writeFileSync(join(OUT, 'actors.json'), JSON.stringify(actors))
  console.log(`actors: ${Object.keys(actors).length} resolved (${Object.keys(tuning).length} tuned)`)
  // a bullet without an actor file cannot be spawned yet; energyBlastBullet is not copied in this slice
  const danglingBullets = Object.values(actors)
    .filter((a) => a.attack.bullet !== null && !actors[a.attack.bullet])
    .map((a) => `${a.key} -> ${a.attack.bullet}`)
  if (danglingBullets.length > 0) {
    console.warn(`WARNING: attack.bullet references without an actor file: ${danglingBullets.join(', ')}`)
  }
  return actors
}

function convertTeams(): void {
  const teams = parseTeams(readTxtDir('teams'))
  writeFileSync(join(OUT, 'teams.json'), JSON.stringify(teams))
  console.log(`teams: ${Object.keys(teams).length} parsed`)
}

/**
 * One atlas per folder under assets/sprites; the folder name is the sprite name.
 * Returns the names an actor's `name` may refer to: the folder names plus the
 * `chr` part of the frame file names (folders are named after the actor `name`, e.g. "mer").
 */
function convertSprites(): Set<string> {
  const names = new Set<string>()
  for (const sprite of sortedDir(join(ASSETS, 'sprites'))) {
    const dir = join(ASSETS, 'sprites', sprite)
    const frames = sortedDir(dir)
      .filter((f) => f.endsWith('.bmp'))
      .map((f) => ({ name: f, image: decodeBmp(readFileSync(join(dir, f))) }))
    if (frames.length === 0) continue
    const atlas = buildAtlas(frames)
    writePng(join(OUT, 'sprites', `${sprite}.png`), atlas.sheet)
    writeFileSync(join(OUT, 'sprites', `${sprite}.json`), JSON.stringify({ animations: atlas.animations }))
    console.log(`sprites ${sprite}: ${Object.keys(atlas.animations).length} animations`)
    names.add(sprite)
    for (const f of frames) {
      const chr = parseFrameName(f.name)?.chr
      if (chr) names.add(chr)
    }
  }
  return names
}


/** Every character, bullet and spell that the data names must have frames; abstract bases (no #name) are skipped. */
function checkActorAtlases(actors: Record<string, ActorDef>, spriteNames: Set<string>): void {
  const missing = Object.values(actors)
    .filter((a) => needsSprite(a) && !spriteNames.has(a.name))
    .map((a) => `${a.key} (name "${a.name}", ${a.objType})`)
  if (missing.length > 0) {
    console.error(`ERROR: actors without a sprite atlas under assets/sprites: ${missing.join(', ')}`)
    process.exit(1)
  }
}

function readPng(path: string): RgbaImage {
  const png = PNG.sync.read(readFileSync(path))
  return { width: png.width, height: png.height, rgba: new Uint8Array(png.data) }
}

function writePng(path: string, img: RgbaImage): void {
  const png = new PNG({ width: img.width, height: img.height })
  png.data = Buffer.from(img.rgba)
  writeFileSync(path, PNG.sync.write(png))
}

mkdirSync(join(OUT, 'maps'), { recursive: true })
mkdirSync(join(OUT, 'tilesets'), { recursive: true })
mkdirSync(join(OUT, 'sprites'), { recursive: true })

// maps first, so tilesets can be sized to the highest index any map uses
const maps = convertMaps()
convertTileSets(maxTileIndexByTileSet(maps))
const actors = convertActors()
convertTeams()
checkActorAtlases(actors, convertSprites())
