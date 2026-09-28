// Converts ./assets into ./public/generated for the browser. Run: pnpm assets:convert
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'
import { resolveActors, type ActorDef, type Plain, needsSprite } from '../src/mr-open/mr-actor-data'
import { parseMapFile, type MapDefinition } from '../src/mr-open/mr-map-format'
import { GAME_COMPLETE_SOUND } from '../src/mr-open/mr-map-clear'
import { ROOM_CLEARED_SOUND } from '../src/mr-open/mr-sound'
import { parseCutScene } from '../src/cutscene/script'
import { GENERATED_MAPS } from '../src/gen/generated-maps'
import { parseTeams } from '../src/mr-open/mr-team-data'
import { parseTileKey } from '../src/mr-open/mr-tile-key'
import { buildAtlas, parseFrameName, type AtlasFrame } from './atlas'
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

/** Every .txt under dir, as paths relative to it with '/' separators, sorted. */
function txtFilesUnder(dir: string, prefix = ''): string[] {
  const out: string[] = []
  for (const entry of sortedDir(dir)) {
    const rel = prefix ? `${prefix}/${entry}` : entry
    if (statSync(join(dir, entry)).isDirectory()) out.push(...txtFilesUnder(join(dir, entry), rel))
    else if (entry.endsWith('.txt')) out.push(rel)
  }
  return out
}

interface ConvertedMap {
  id: string // path under assets/maps without .txt, e.g. works/sam
  def: MapDefinition
}

/** Every map under assets/maps, keeping its subfolder: assets/maps/<id>.txt -> maps/<id>.json. */
function convertMaps(): ConvertedMap[] {
  const out = join(OUT, 'maps')
  rmSync(out, { recursive: true, force: true }) // no stale maps from an earlier layout
  const maps: ConvertedMap[] = []
  let skipped = 0
  for (const file of txtFilesUnder(join(ASSETS, 'maps'))) {
    const id = stripTxt(file)
    let def: MapDefinition
    try {
      def = parseMapFile(readFileSync(join(ASSETS, 'maps', file), 'utf8'))
    } catch (err) {
      console.log(`map ${id}: SKIPPED, failed to parse: ${err instanceof Error ? err.message : String(err)}`)
      skipped++
      continue
    }
    const patchFile = join(ASSETS, 'map-patches', `${id}.json`)
    let patched = ''
    if (existsSync(patchFile)) {
      const patch = JSON.parse(readFileSync(patchFile, 'utf8')) as MapPatch
      const objectsSet = def.layers.find((l) => l.name === 'objects')?.tileSet
      if (!objectsSet) throw new Error(`map patch ${id}: map has no objects layer`)
      const key = parseTileKey(readFileSync(join(ASSETS, 'tile-keys', `${objectsSet}.txt`), 'utf8'))
      def = applyMapPatch(def, patch, key.symbols, id)
      patched = ` (+${patch.objects.length} patched objects)`
    }
    maps.push({ id, def })
    const target = join(out, `${id}.json`)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, JSON.stringify(def))
    console.log(`map ${id}: ${def.mapSize.x}x${def.mapSize.y} rooms${patched}`)
  }
  // the map browser below the game lists every converted map
  const index = [
    ...maps.map(({ id, def }) => ({ id, mapSize: { x: def.mapSize.x, y: def.mapSize.y } })),
    ...GENERATED_MAPS, // built in the browser from ?seed= (src/gen)
  ]
  writeFileSync(join(out, 'index.json'), JSON.stringify(index))
  console.log(`maps: ${maps.length} converted, ${skipped} skipped`)
  return maps
}

/** highest tile index referenced per tileset name, across all converted maps */
function maxTileIndexByTileSet(maps: ConvertedMap[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const { def } of maps) {
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

/**
 * Tile keys and sheets: real art from assets/tilesets when present, else a placeholder. A map whose
 * tileset has no key is still converted (the page names the missing tileset when it is opened).
 */
function convertTileSets(maps: ConvertedMap[]): void {
  const maxIndexByTileSet = maxTileIndexByTileSet(maps)
  const converted = new Set<string>()
  const placeholders = new Set<string>()
  for (const file of sortedTxt(join(ASSETS, 'tile-keys'))) {
    const key = parseTileKey(readFileSync(join(ASSETS, 'tile-keys', file), 'utf8'))
    const name = stripTxt(file)
    converted.add(name)
    const symbols = [...key.symbols]
    const sheetPath = join(ASSETS, 'tilesets', `${name}.png`)
    const sheet = existsSync(sheetPath) ? readPng(sheetPath) : undefined
    if (!sheet) placeholders.add(name)
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
  warnMapsUsing(maps, (n) => !converted.has(n), 'tilesets with no key file in assets/tile-keys (the page will not load them)')
  warnMapsUsing(maps, (n) => placeholders.has(n), 'tilesets with no sheet in assets/tilesets (drawn with placeholder art)')
}

/** One warning line per map that uses a tileset matching `lacks`. */
function warnMapsUsing(maps: ConvertedMap[], lacks: (tileSet: string) => boolean, what: string): void {
  const affected = maps
    .map(({ id, def }) => ({ id, sets: [...new Set(def.layers.map((l) => l.tileSet))].filter(lacks) }))
    .filter((m) => m.sets.length > 0)
  if (affected.length === 0) return
  console.warn(`WARNING: ${affected.length} maps use ${what}:`)
  for (const m of affected) console.warn(`  ${m.id}: ${m.sets.join(', ')}`)
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
  const actors = withPortedResidents(resolveActors(readTxtDir('actors'), tuning))
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

/**
 * Dwelling resident groups whose actor is not ported yet (orcHouse's mageOrc) are dropped with a
 * warning, so the dwelling produces its other groups; they come back once the actor file is copied.
 */
function withPortedResidents(actors: Record<string, ActorDef>): Record<string, ActorDef> {
  for (const a of Object.values(actors)) {
    const missing = a.residentGroups.filter((g) => !actors[g.typ]).map((g) => g.typ)
    if (missing.length === 0) continue
    console.warn(`WARNING: ${a.key}: resident groups without an actor file dropped: ${missing.join(', ')}`)
    a.residentGroups = a.residentGroups.filter((g) => actors[g.typ])
  }
  return actors
}

function convertTeams(): void {
  const teams = parseTeams(readTxtDir('teams'))
  writeFileSync(join(OUT, 'teams.json'), JSON.stringify(teams))
  console.log(`teams: ${Object.keys(teams).length} parsed`)
}

/**
 * regpoints.tsv next to extracted PNG frames (tools/director-extract dump_bitmaps.py): frame name
 * (without extension) -> the Director member's registration point.
 */
function readRegPoints(dir: string): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>()
  const path = join(dir, 'regpoints.tsv')
  if (!existsSync(path)) return out
  const [header, ...rows] = readFileSync(path, 'utf8').split('\n').filter((l) => l.trim() !== '')
  const cols = header!.split('\t')
  const [name, regX, regY] = ['name', 'regX', 'regY'].map((c) => cols.indexOf(c))
  if (name! < 0 || regX! < 0 || regY! < 0) throw new Error(`${path}: needs name, regX and regY columns`)
  for (const row of rows) {
    const f = row.split('\t')
    out.set(f[name!]!, { x: Number(f[regX!]), y: Number(f[regY!]) })
  }
  return out
}

/** A sprite frame file: BMP (white is transparent), or an extracted PNG whose white is transparent too. */
function readFrame(dir: string, file: string, regs: Map<string, { x: number; y: number }>): AtlasFrame {
  const path = join(dir, file)
  const image = file.endsWith('.png') ? whiteToAlpha(readPng(path)) : decodeBmp(readFileSync(path))
  const reg = regs.get(file.replace(/\.\w+$/, ''))
  return { name: file, image, ...(reg ? { reg } : {}) }
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
    const regs = readRegPoints(dir)
    const frames = sortedDir(dir)
      .filter((f) => f.endsWith('.bmp') || f.endsWith('.png'))
      .map((f) => readFrame(dir, f, regs))
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

/**
 * assets/sounds/*.wav and assets/music/*.mp3 -> public/generated/audio/, plus index.json
 * { sounds, music } (names without extension). Warns (does not fail) when actor data names a
 * sound or track that has no file.
 */
function convertAudio(actors: Record<string, ActorDef>): void {
  const out = join(OUT, 'audio')
  mkdirSync(out, { recursive: true })
  const copyAll = (sub: string, ext: string): string[] => {
    const names: string[] = []
    for (const f of sortedDir(join(ASSETS, sub)).filter((n) => n.endsWith(ext))) {
      copyFileSync(join(ASSETS, sub, f), join(out, f))
      names.push(f.slice(0, -ext.length))
    }
    return names
  }
  const sounds = copyAll('sounds', '.wav')
  const music = copyAll('music', '.mp3')
  writeFileSync(join(out, 'index.json'), JSON.stringify({ sounds, music }))
  console.log(`audio: ${sounds.length} sounds, ${music.length} music tracks`)
  const soundSet = new Set(sounds)
  const musicSet = new Set(music)
  const missing: string[] = []
  const want = (name: string | null, set: Set<string>, where: string) => {
    if (name !== null && !set.has(name)) missing.push(`${where} -> ${name}`)
  }
  want(ROOM_CLEARED_SOUND, soundSet, 'objRoom.pRoomClearedSound')
  want(GAME_COMPLETE_SOUND, soundSet, 'gGameCompleteSound')
  for (const a of Object.values(actors)) {
    want(a.attack.sound, soundSet, `${a.key}.attack.sound`)
    want(a.attack.releaseSound, soundSet, `${a.key}.attack.releaseSound`)
    want(a.attack.explodeSound, soundSet, `${a.key}.attack.explodeSound`)
    want(a.takeHitSound, soundSet, `${a.key}.takeHitSound`)
    want(a.dieSound, soundSet, `${a.key}.dieSound`)
    want(a.musicTrack, musicSet, `${a.key}.musicName`)
  }
  if (missing.length > 0) console.warn(`WARNING: sounds referenced without a file in assets/sounds or assets/music: ${missing.join(', ')}`)
}

/** assets/exit-arrows/arrow_<colour>_<dir>.bmp -> exit-arrows/<same name>.png, white transparent (ink 36). */
function convertExitArrows(): void {
  const dir = join(ASSETS, 'exit-arrows')
  mkdirSync(join(OUT, 'exit-arrows'), { recursive: true })
  const files = sortedDir(dir).filter((f) => f.endsWith('.bmp'))
  for (const f of files) writePng(join(OUT, 'exit-arrows', f.replace(/\.bmp$/, '.png')), decodeBmp(readFileSync(join(dir, f))))
  console.log(`exit arrows: ${files.length}`)
}

/** assets/title/<letter>.png -> title/<letter>.png, white transparent: the title screen's lettering. */
function convertTitleLetters(): void {
  const dir = join(ASSETS, 'title')
  mkdirSync(join(OUT, 'title'), { recursive: true })
  const files = sortedDir(dir).filter((f) => f.endsWith('.png'))
  for (const f of files) writePng(join(OUT, 'title', f), whiteToAlpha(readPng(join(dir, f))))
  console.log(`title letters: ${files.length}`)
}

/** assets/cut-scenes/<name>.txt -> cut-scenes/<name>.json, parsed (src/cutscene/script.ts). */
function convertCutScenes(): void {
  mkdirSync(join(OUT, 'cut-scenes'), { recursive: true })
  const scenes = readTxtDir('cut-scenes')
  for (const [name, text] of Object.entries(scenes)) {
    const script = parseCutScene(text)
    if (script.lines.length === 0) throw new Error(`cut scene ${name} has no lines`)
    writeFileSync(join(OUT, 'cut-scenes', `${name}.json`), JSON.stringify(script))
  }
  console.log(`cut scenes: ${Object.keys(scenes).length}`)
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

mkdirSync(join(OUT, 'tilesets'), { recursive: true })
mkdirSync(join(OUT, 'sprites'), { recursive: true })

// maps first, so tilesets can be sized to the highest index any map uses
const maps = convertMaps()
convertTileSets(maps)
const actors = convertActors()
convertTeams()
checkActorAtlases(actors, convertSprites())
convertAudio(actors)
convertExitArrows()
convertCutScenes()
convertTitleLetters()
