// Converts ./assets into ./public/generated for the browser. Run: pnpm assets:convert
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'
import { parseMapFile, type MapDefinition } from '../src/mr-open/mr-map-format'
import { parseTileKey } from '../src/mr-open/mr-tile-key'
import { buildAtlas } from './atlas'
import { decodeBmp, type RgbaImage } from './bmp'
import { buildPlaceholderTileset, TILES_PER_ROW } from './placeholder-tileset'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const ASSETS = join(ROOT, 'assets')
const OUT = join(ROOT, 'public', 'generated')
mkdirSync(join(OUT, 'maps'), { recursive: true })
mkdirSync(join(OUT, 'tilesets'), { recursive: true })
mkdirSync(join(OUT, 'sprites'), { recursive: true })

const sortedDir = (dir: string): string[] => readdirSync(dir).sort()

// maps (first, so tilesets can be sized to the highest index any map uses)
const maps: MapDefinition[] = []
for (const file of sortedDir(join(ASSETS, 'maps'))) {
  const name = file.replace(/\.txt$/, '')
  let def: MapDefinition
  try {
    def = parseMapFile(readFileSync(join(ASSETS, 'maps', file), 'utf8'))
  } catch (err) {
    console.log(`map ${name}: SKIPPED, failed to parse: ${err instanceof Error ? err.message : String(err)}`)
    continue
  }
  maps.push(def)
  writeFileSync(join(OUT, 'maps', `${name}.json`), JSON.stringify(def))
  console.log(`map ${name}: ${def.mapSize.x}x${def.mapSize.y} rooms`)
}

// highest tile index referenced per tileset name, across all converted maps
const maxIndexByTileSet = new Map<string, number>()
for (const def of maps) {
  for (const layer of def.layers) {
    let max = maxIndexByTileSet.get(layer.tileSet) ?? 0
    for (const room of def.rooms) {
      for (const row of room.layers[layer.name] ?? []) for (const i of row) if (i > max) max = i
    }
    maxIndexByTileSet.set(layer.tileSet, max)
  }
}

// tile keys and placeholder sheets
for (const file of sortedDir(join(ASSETS, 'tile-keys'))) {
  const key = parseTileKey(readFileSync(join(ASSETS, 'tile-keys', file), 'utf8'))
  const name = file.replace(/\.txt$/, '')
  const symbols = [...key.symbols]
  const needed = maxIndexByTileSet.get(name) ?? 0
  const padded = Math.max(0, needed - symbols.length)
  while (symbols.length < needed) symbols.push('none')
  writeFileSync(
    join(OUT, 'tilesets', `${name}.json`),
    JSON.stringify({ tileSize: key.tileSize, tilesPerRow: TILES_PER_ROW, symbols }),
  )
  writePng(join(OUT, 'tilesets', `${name}.png`), buildPlaceholderTileset(symbols, key.tileSize))
  console.log(`tileset ${name}: ${symbols.length} tiles (placeholder art${padded ? `, ${padded} padded from map usage` : ''})`)
}

// merlin sprite atlas
const spriteDir = join(ASSETS, 'sprites', 'merlin')
const frames = sortedDir(spriteDir)
  .filter((f) => f.endsWith('.bmp'))
  .map((f) => ({ name: f, image: decodeBmp(readFileSync(join(spriteDir, f))) }))
const atlas = buildAtlas(frames)
writePng(join(OUT, 'sprites', 'merlin.png'), atlas.sheet)
writeFileSync(join(OUT, 'sprites', 'merlin.json'), JSON.stringify({ animations: atlas.animations }))
console.log(`sprites merlin: ${Object.keys(atlas.animations).length} animations`)

function writePng(path: string, img: RgbaImage): void {
  const png = new PNG({ width: img.width, height: img.height })
  png.data = Buffer.from(img.rgba)
  writeFileSync(path, PNG.sync.write(png))
}
