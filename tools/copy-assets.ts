// Copies the original files this project uses from the (git-ignored) archive
// into ./assets with a sensible structure. Run: pnpm assets:copy
import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
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
  // tileset: the archive ships a clean PNG of the MR4 objects sheet; the Director 16-bit cast member
  // decodes badly (see docs/notes/tileset-extraction.md), so this replaces the extracted copy
  { from: join(ARCHIVE, 'mini_projects', 'correctMR4Objects', 'tlk_merlin4Objects.png'), to: join(ASSETS, 'tilesets/merlin4Objects.png'), why: 'MR4 objects sheet (clean PNG from the archive)' },
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
  // sound slice: music tiles (objMusic; not drawn, they pick the room's track)
  ['game', 'music tile base (team #game)'],
  ['music', 'music tile base (objMusic)'],
  ['musicBaroqueRock', 'music tile'],
  ['musicBaroqueRockTechno', 'music tile'],
  ['musicElectronicMerlin', 'music tile'],
  ['musicLastStand', 'music tile'],
  ['musicWoodsOfEvil', 'music tile'],
  ['musicOff', 'music tile: stops the music'],
]
for (const [name, why] of actors) {
  copies.push({ from: join(CASTS, `act_${name}.txt`), to: join(ASSETS, `actors/${name}.txt`), why: `actor: ${why}` })
}

// Staged for the enemy slice (goblin mage, dwellings, orcs): kept out of assets/actors until their
// sprites are wired into the converter, so the converter's atlas check keeps passing meanwhile.
const stagedActors = ['goblinMage', 'goblinHut', 'goblinMageHut', 'dwelling', 'bowOrc', 'swordOrc', 'orcHouse', 'mageOrc',
  'crossBow', 'crossBolt', 'orcSword', 'goblinSummon']
for (const name of stagedActors) {
  copies.push({ from: join(CASTS, `act_${name}.txt`), to: join(ASSETS, `extracted/actors/${name}.txt`), why: 'staged for the enemy slice' })
}
copies.push({ from: join(CASTS, 'tem_orcs.txt'), to: join(ASSETS, 'extracted/teams/orcs.txt'), why: 'staged for the enemy slice' })

// maps: every map under the archive's maps/ keeps its subfolder (a map's id is its path there),
// plus the archive's playable demo map at the top level
function copyMapsRecursive(dir: string): void {
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const from = join(dir, entry.name)
    if (entry.isDirectory()) copyMapsRecursive(from)
    else if (entry.name.endsWith('.txt')) {
      copies.push({ from, to: join(ASSETS, 'maps', relative(join(ARCHIVE, 'maps'), from)), why: 'map' })
    }
  }
}
copyMapsRecursive(join(ARCHIVE, 'maps'))
copies.push({ from: join(ARCHIVE, 'map_to_play', 'tvsDemo.txt'), to: join(ASSETS, 'maps/tvsDemo.txt'), why: 'map (the archive\'s map_to_play)' })

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
