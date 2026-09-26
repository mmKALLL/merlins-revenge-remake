// Copies the original files this project uses from the (git-ignored) archive
// into ./assets with a sensible structure. Run: pnpm assets:copy
import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const ARCHIVE = join(ROOT, 'assets-mr-original/merlin_open_30_speedy_and _tvs')
const CASTS = join(ARCHIVE, 'casts', 'data')
const ASSETS = join(ROOT, 'assets')

if (!existsSync(ARCHIVE)) {
  console.error(`archive not found: ${ARCHIVE}`)
  process.exit(1)
}

type Copy = { from: string; to: string; why: string }

const copies: Copy[] = [
  // walk-and-rooms slice: maps
  { from: join(ARCHIVE, 'map_to_play', 'tvsDemo.txt'), to: join(ASSETS, 'maps/tvsDemo.txt'), why: 'default map' },
  { from: join(ARCHIVE, 'maps', 'works', 'sam.txt'), to: join(ASSETS, 'maps/sam.txt'), why: '3x3 test map' },
  // tile keys (collision symbols per tile index)
  { from: join(CASTS, 'tlk_merlinOpenPassive_key.txt'), to: join(ASSETS, 'tile-keys/merlinOpenPassive.txt'), why: 'passive layer key' },
  { from: join(CASTS, 'tlk_merlinOpenActive_key.txt'), to: join(ASSETS, 'tile-keys/merlinOpenActive.txt'), why: 'active layer key' },
  { from: join(CASTS, 'tlk_merlinOpenObjects_key.txt'), to: join(ASSETS, 'tile-keys/merlinOpenObjects.txt'), why: 'objects layer key' },
  // key bindings
  { from: join(CASTS, 'bnd_wasd.txt'), to: join(ASSETS, 'keybindings/wasd.txt'), why: 'default bindings' },
  { from: join(CASTS, 'bnd_arrow.txt'), to: join(ASSETS, 'keybindings/arrow.txt'), why: 'arrow bindings' },
]

// every Merlin animation frame
for (const name of readdirSync(join(ARCHIVE, 'gfx', 'merlin')).sort()) {
  if (name.startsWith('anm_mer_') && name.endsWith('.bmp')) {
    copies.push({ from: join(ARCHIVE, 'gfx', 'merlin', name), to: join(ASSETS, 'sprites/merlin', name), why: 'merlin frames' })
  }
}

for (const c of copies) {
  mkdirSync(dirname(c.to), { recursive: true })
  cpSync(c.from, c.to)
  console.log(`${c.to.slice(ROOT.length)}  <- ${c.why}`)
}
