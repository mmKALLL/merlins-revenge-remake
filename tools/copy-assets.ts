// Copies the original files this project uses from the (git-ignored) archive
// into ./assets with a sensible structure. Run: pnpm assets:copy
import { cpSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const ARCHIVE = 'assets-mr-original/merlin_open_30_speedy_and _tvs'
const CASTS = join(ARCHIVE, 'casts', 'data')

type Copy = { from: string; to: string; why: string }

const copies: Copy[] = [
  // walk-and-rooms slice: maps
  { from: join(ARCHIVE, 'map_to_play', 'tvsDemo.txt'), to: 'assets/maps/tvsDemo.txt', why: 'default map' },
  { from: join(ARCHIVE, 'maps', 'works', 'sam.txt'), to: 'assets/maps/sam.txt', why: '3x3 test map' },
  { from: join(ARCHIVE, 'maps', 'works', 'mr4Demo.txt'), to: 'assets/maps/mr4Demo.txt', why: '15x15 demo map' },
  // tile keys (collision symbols per tile index)
  { from: join(CASTS, 'tlk_merlinOpenPassive_key.txt'), to: 'assets/tile-keys/merlinOpenPassive.txt', why: 'passive layer key' },
  { from: join(CASTS, 'tlk_merlinOpenActive_key.txt'), to: 'assets/tile-keys/merlinOpenActive.txt', why: 'active layer key' },
  { from: join(CASTS, 'tlk_merlinOpenObjects_key.txt'), to: 'assets/tile-keys/merlinOpenObjects.txt', why: 'objects layer key' },
  // key bindings
  { from: join(CASTS, 'bnd_wasd.txt'), to: 'assets/keybindings/wasd.txt', why: 'default bindings' },
  { from: join(CASTS, 'bnd_arrow.txt'), to: 'assets/keybindings/arrow.txt', why: 'arrow bindings' },
]

// every Merlin animation frame
for (const name of readdirSync(join(ARCHIVE, 'gfx', 'merlin'))) {
  if (name.startsWith('anm_mer_') && name.endsWith('.bmp')) {
    copies.push({ from: join(ARCHIVE, 'gfx', 'merlin', name), to: join('assets/sprites/merlin', name), why: 'merlin frames' })
  }
}

for (const c of copies) {
  mkdirSync(join(c.to, '..'), { recursive: true })
  cpSync(c.from, c.to)
  console.log(`${c.to}  <- ${c.why}`)
}
