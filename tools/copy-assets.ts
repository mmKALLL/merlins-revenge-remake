// Copies the original files this project uses from the (git-ignored) archive
// into ./assets with a sensible structure. Run: pnpm assets:copy
import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const ARCHIVE = join(ROOT, 'assets-mr-original/merlin_open_30_speedy_and _tvs')
const CASTS = join(ARCHIVE, 'casts', 'data')
const GFX = join(ARCHIVE, 'gfx')
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
  { from: join(ARCHIVE, 'maps', 'not_fully_tested', 'mriv_small.txt'), to: join(ASSETS, 'maps/mriv_small.txt'), why: 'small 5-room MR4 map, main test map' },
  // key bindings
  { from: join(CASTS, 'bnd_wasd.txt'), to: join(ASSETS, 'keybindings/wasd.txt'), why: 'default bindings' },
  { from: join(CASTS, 'bnd_arrow.txt'), to: join(ASSETS, 'keybindings/arrow.txt'), why: 'arrow bindings' },
  // combat slice: team data
  { from: join(CASTS, 'tem_goblins.txt'), to: join(ASSETS, 'teams/goblins.txt'), why: 'goblin team (hates aldevar)' },
  { from: join(CASTS, 'tem_aldevar.txt'), to: join(ASSETS, 'teams/aldevar.txt'), why: 'player team' },
  // combat slice: the goblin grave is one cast member registered under two names
  // (goblinWarrior and gar both play it as their grave strip); copy it twice to make that explicit
  { from: join(GFX, 'goblinArcher', 'goblin_grave.bmp'), to: join(ASSETS, 'sprites/goblinWarrior/anm_goblinWarrior_grave_3_01.bmp'), why: 'goblin grave (shared cast member) as goblinWarrior grave frame' },
  { from: join(GFX, 'goblinArcher', 'goblin_grave.bmp'), to: join(ASSETS, 'sprites/gar/anm_gar_grave_3_01.bmp'), why: 'goblin grave (shared cast member) as gar grave frame' },
  { from: join(GFX, 'spells', 'anm_spell_charge_03_01.bmp'), to: join(ASSETS, 'sprites/spell/anm_spell_charge_03_01.bmp'), why: 'energy blast charge frame' },
]

// combat slice: actor data, act_<name>.txt -> actors/<name>.txt
const actors: [name: string, why: string][] = [
  ['actor', 'root of the actor hierarchy'],
  ['actorPlayer', 'player-controlled actor base'],
  ['character', 'walking character base'],
  ['CPUCharacter', 'AI character base'],
  ['player', 'Merlin'],
  ['goblinWarrior', 'melee goblin'],
  ['goblinArcher', 'ranged goblin'],
  ['goblinSword', 'goblin warrior melee weapon'],
  ['goblinBow', 'goblin archer ranged weapon'],
  ['goblinArrow', 'goblin bow bullet'],
  ['weapon', 'weapon base'],
  ['bullet', 'bullet base'],
  ['energyBlast', 'Merlin spell'],
  ['spell', 'spell base'],
]
for (const [name, why] of actors) {
  copies.push({ from: join(CASTS, `act_${name}.txt`), to: join(ASSETS, `actors/${name}.txt`), why: `actor: ${why}` })
}

// every file in fromDir matching pattern -> toDir/<same name>
function copyGlob(fromDir: string, pattern: RegExp, toDir: string, why: string): void {
  for (const name of readdirSync(fromDir).sort()) {
    if (pattern.test(name)) copies.push({ from: join(fromDir, name), to: join(toDir, name), why })
  }
}

// every tile key (collision symbols per tile index) except the menu's:
// tlk_<name>_key.txt -> tile-keys/<name>.txt
for (const file of readdirSync(CASTS).sort()) {
  const m = /^tlk_(.+)_key\.txt$/.exec(file)
  if (!m || m[1] === 'menu') continue
  copies.push({ from: join(CASTS, file), to: join(ASSETS, `tile-keys/${m[1]}.txt`), why: `${m[1]} tile key` })
}

// animation frames
copyGlob(join(GFX, 'merlin'), /^anm_mer_.*\.bmp$/, join(ASSETS, 'sprites/mer'), 'merlin frames (actor name "mer")')
copyGlob(join(GFX, 'goblinWarrior'), /^anm_.*\.bmp$/, join(ASSETS, 'sprites/goblinWarrior'), 'goblin warrior frames')
copyGlob(join(GFX, 'goblinArcher'), /^anm_gar_.*\.bmp$/, join(ASSETS, 'sprites/gar'), 'goblin archer frames')
copyGlob(join(GFX, 'goblinArcher'), /^anm_gobarrow_.*\.bmp$/, join(ASSETS, 'sprites/gobarrow'), 'goblin arrow frames')

for (const c of copies) {
  mkdirSync(dirname(c.to), { recursive: true })
  cpSync(c.from, c.to)
  console.log(`${c.to.slice(ROOT.length)}  <- ${c.why}`)
}
