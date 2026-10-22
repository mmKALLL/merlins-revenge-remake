// Renders generated maps (random floors and the tower) to PNG for tuning the generator by eye
// (scratch tool, not part of the build). Run: pnpm tsx tools/render-random-floor.ts <outDir>
// [map|all] [seed...], where map is a generated map's name with or without its number
// (goblin-forest, 1-goblin-forest, sorcerers-tower); draws the three layers from
// public/generated/tilesets with a faint line between rooms.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PNG } from 'pngjs'
import { energyLookup } from '../src/gen/floor'
import { GENERATED_MAPS, generateMap } from '../src/gen/generated-maps'
import { TILE_PX } from '../src/mr-open/mr-geometry'
import type { LayerName } from '../src/mr-open/mr-map-format'

const GENERATED = join(import.meta.dirname, '..', 'public', 'generated')
/** converted sheets (pnpm assets:convert): white is already transparent there */
const TILESETS = join(GENERATED, 'tilesets')
/** the resolved actor definitions (tuning applied), as the page loads them: units' energies for HP budgets */
const energyOf = energyLookup(JSON.parse(readFileSync(join(GENERATED, 'actors.json'), 'utf8')) as Record<string, { energy: number }>)
const ROOM_LINE = [255, 0, 255, 160] as const

const [outDir = 'dist/floors', mapArg = 'all', ...seedArgs] = process.argv.slice(2)
const seeds = seedArgs.length > 0 ? seedArgs.map(Number) : [1, 2, 3]
/** A generated map's name: its id after the folder. */
const nameOf = (id: string): string => id.slice(id.lastIndexOf('/') + 1)
/** The name without its listing number ("1-goblin-forest" -> "goblin-forest"). */
const unnumbered = (name: string): string => name.replace(/^\d+-/, '')
const ids = GENERATED_MAPS.map((m) => m.id)
  .filter((id) => mapArg === 'all' || nameOf(id) === mapArg || unnumbered(nameOf(id)) === mapArg)
if (ids.length === 0) throw new Error(`no generated map "${mapArg}"; maps: ${GENERATED_MAPS.map((m) => nameOf(m.id)).join(', ')}`)
mkdirSync(outDir, { recursive: true })

const sheets = new Map<string, PNG>()
const sheet = (name: string): PNG => {
  let s = sheets.get(name)
  if (!s) {
    s = PNG.sync.read(readFileSync(join(TILESETS, `${name}.png`)))
    sheets.set(name, s)
  }
  return s
}

/** Alpha-blends tile `index` (1-based) of a sheet onto the image at pixel (dx, dy). */
function drawTile(img: PNG, s: PNG, index: number, dx: number, dy: number): void {
  const perRow = Math.floor(s.width / TILE_PX)
  const sx = ((index - 1) % perRow) * TILE_PX
  const sy = Math.floor((index - 1) / perRow) * TILE_PX
  if (sy + TILE_PX > s.height) return
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) {
      const si = ((sy + y) * s.width + sx + x) * 4
      const di = ((dy + y) * img.width + dx + x) * 4
      const a = s.data[si + 3]! / 255
      for (let c = 0; c < 3; c++) img.data[di + c] = Math.round(s.data[si + c]! * a + img.data[di + c]! * (1 - a))
      img.data[di + 3] = 255
    }
  }
}

for (const id of ids) for (const seed of seeds) {
  const started = performance.now()
  const map = generateMap(id, seed, energyOf)
  const ms = performance.now() - started
  const { mapSize, roomSize } = map
  const img = new PNG({ width: mapSize.x * roomSize.x * TILE_PX, height: mapSize.y * roomSize.y * TILE_PX })
  for (const layer of ['backgroundPassive', 'backgroundActive', 'objects'] as LayerName[]) {
    const s = sheet(map.layers.find((l) => l.name === layer)!.tileSet)
    for (const room of map.rooms) {
      const rx = (room.num - 1) % mapSize.x
      const ry = Math.floor((room.num - 1) / mapSize.x)
      room.layers[layer]?.forEach((row, y) => row.forEach((index, x) => {
        if (index > 0) drawTile(img, s, index, (rx * roomSize.x + x) * TILE_PX, (ry * roomSize.y + y) * TILE_PX)
      }))
    }
  }
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (x % (roomSize.x * TILE_PX) !== 0 && y % (roomSize.y * TILE_PX) !== 0) continue
      const i = (y * img.width + x) * 4
      for (let c = 0; c < 3; c++) img.data[i + c] = Math.round((ROOM_LINE[c]! * ROOM_LINE[3] + img.data[i + c]! * (255 - ROOM_LINE[3])) / 255)
    }
  }
  const file = join(outDir, `${unnumbered(nameOf(id))}-${seed}.png`)
  writeFileSync(file, PNG.sync.write(img))
  console.log(`${file} (generated in ${ms.toFixed(1)} ms)`)
}
