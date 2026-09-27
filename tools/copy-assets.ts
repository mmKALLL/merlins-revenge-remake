// Copies the original files this project uses from the (git-ignored) archive
// into ./assets with a sensible structure. Run: pnpm assets:copy
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
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
  // tileset: the archive ships a clean PNG of the MR4 objects sheet. It is pixel-identical to the
  // cast member decoded as 32-bit by tools/director-extract/extract_tlk.py (the other sheets in
  // assets/tilesets come from that script; see docs/notes/tileset-extraction.md)
  { from: join(ARCHIVE, 'mini_projects', 'correctMR4Objects', 'tlk_merlin4Objects.png'), to: join(ASSETS, 'tilesets/merlin4Objects.png'), why: 'MR4 objects sheet (clean PNG from the archive)' },
  // key bindings
  { from: join(CASTS, 'bnd_wasd.txt'), to: join(ASSETS, 'keybindings/wasd.txt'), why: 'default bindings' },
  { from: join(CASTS, 'bnd_arrow.txt'), to: join(ASSETS, 'keybindings/arrow.txt'), why: 'arrow bindings' },
  // combat slice: the goblin grave is one cast member registered under two names
  // (goblinWarrior and gar both play it as their grave strip); copy it twice to make that explicit
  { from: join(GFX, 'goblinArcher', 'goblin_grave.bmp'), to: join(ASSETS, 'sprites/goblinWarrior/anm_goblinWarrior_grave_3_01.bmp'), why: 'goblin grave (shared cast member) as goblinWarrior grave frame' },
  { from: join(GFX, 'goblinArcher', 'goblin_grave.bmp'), to: join(ASSETS, 'sprites/gar/anm_gar_grave_3_01.bmp'), why: 'goblin grave (shared cast member) as gar grave frame' },
  { from: join(GFX, 'spells', 'anm_spell_charge_03_01.bmp'), to: join(ASSETS, 'sprites/spell/anm_spell_charge_03_01.bmp'), why: 'energy blast charge frame' },
  // the end cut scene (gGameCompleteScript = #cut_scene_to_play_at_end): the archive's
  // cut_scene_to_play_at_end/ folder is empty, so the engine plays this built-in cast member
  { from: join(CASTS, 'scr_cut_scene_to_play_at_end.txt'), to: join(ASSETS, 'cut-scenes/cut_scene_to_play_at_end.txt'), why: 'map complete cut scene' },
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
  // enemy slice: goblin mage, dwellings, orcs
  ['goblinMage', 'goblin spell caster (objAiCPUSpellCaster)'],
  ['dwelling', 'dwelling base (objDwelling parent)'],
  ['goblinHut', 'goblin dwelling: archers and warriors'],
  ['goblinMageHut', 'goblin dwelling: mages'],
  ['orcHouse', 'orc dwelling (team #goblins in the data)'],
  ['bowOrc', 'orc archer'],
  ['swordOrc', 'orc fighter'],
  ['crossBow', 'orc archer weapon'],
  ['crossBolt', 'crossbow bullet'],
  ['orcSword', 'orc fighter weapon'],
]
for (const [name, why] of actors) {
  copies.push({ from: join(CASTS, `act_${name}.txt`), to: join(ASSETS, `actors/${name}.txt`), why: `actor: ${why}` })
}


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
// exit arrows drawn along a cleared room's open edges (structMaster.structExitArrowMembers)
copyGlob(join(GFX, 'background'), /^arrow_(green|red)_(up|down|left|right)\.bmp$/, join(ASSETS, 'exit-arrows'), 'exit arrow (objRoom.drawExitArrows)')

// More enemies (their weapons, bullets and dwellings): act_<name>.txt -> actors/<name>.txt. Chosen
// because they only need mechanics the port has; see docs/plans/2026-09-27-enemies-progress.md.
const moreActors = [
  'acid', 'archer', 'archerArrow', 'archerBow', 'babyOstrich', 'bat', 'batBullet', 'batTree', 'blackAxe',
  'blackOrc', 'blueFlame', 'bomb', 'bombMage', 'boulder', 'boulderCave', 'boulderMonster', 'bug', 'caveBat',
  'cocoon', 'darkBlast', 'darkCave', 'darkGolem', 'darkMage', 'darkRock', 'dojo', 'doubleDarkGolem',
  'dragon', 'druid', 'dwarfTower', 'evilTv', 'fangBunny', 'fangBunnyBaby', 'fangBunnyBabyBullet',
  'fangBunnyPortal', 'farmer', 'fireBall', 'fireDragon', 'fireLizard', 'flameThrower', 'flamingRock',
  'fourArmGolem', 'freezeBlast', 'freezeSticks', 'friendlyGoblinArcher', 'friendlyGoblinHero',
  'friendlyGoblinHut', 'friendlyGoblinMage', 'friendlyGoblinMageHut', 'friendlyGoblinWarrior', 'frostyMonk',
  'garTower', 'goblinHero', 'goblinHouse', 'goblinSummon', 'greyGhost', 'healBlast', 'hydra1', 'hydra2',
  'hydra3', 'iceBoulder', 'iceRock', 'karateGuy', 'kingInGame', 'kingSword', 'kongFuChicken', 'laser',
  'lavaDarkGolem', 'lavaGolem', 'lightning', 'lizard', 'lizardEgg', 'lizardSoldier', 'mageOrc',
  'magicPortal', 'monk', 'mysteriousCloud', 'necromancer', 'needle', 'ninja', 'ninjaSword', 'orcInvasion',
  'ostrichEgg', 'pinShooter', 'pitchFork', 'plant', 'powerOstrich', 'quadranid', 'scArcher', 'scArcherArrow',
  'scArcherBow', 'scMonk', 'scSummon', 'scWarrior', 'scWarriorSword', 'shrouder', 'shuriken',
  'shurikenNinja', 'skeletonArcher', 'skeletonBow', 'skeletonComando', 'skeletonComandoSword',
  'skeletonDwelling', 'skeletonGiant', 'skeletonGiantSword', 'skeletonHead', 'skeletonSword',
  'skeletonThrower', 'skeletonWarrior', 'skelitonArm', 'skelitonFootSoldier', 'skelitonHead', 'skelitonLord',
  'skelitonLordSword', 'skelitonLowerLeg', 'skelitonMissile', 'skelitonSummon', 'skelitonSword',
  'skelitonTorsoTank', 'skelitonUpper', 'smoke', 'smokePin', 'spark', 'speedyGuy', 'swordNinja',
  'thunderBlast', 'thunderMonk', 'thunderSticks', 'towerAxe', 'townMace', 'townWatch', 'tvBox',
  'undeadDragon', 'undeadInvasion', 'undeadSummon', 'vultureGuard', 'warrior', 'warriorSword',
]
for (const name of moreActors) {
  copies.push({ from: join(CASTS, `act_${name}.txt`), to: join(ASSETS, `actors/${name}.txt`), why: 'actor: more enemies' })
}
// every team file (enemy teams also fight each other through their hate lists)
for (const file of readdirSync(CASTS).sort()) {
  const m = /^tem_(.+)\.txt$/.exec(file)
  if (m) copies.push({ from: join(CASTS, file), to: join(ASSETS, `teams/${m[1]}.txt`), why: `${m[1]} team` })
}

// Sprites dumped from the engine's Director cast (tools/director-extract/dump_bitmaps.py writes
// anm_*.png plus regpoints.tsv; the owner's reference bundle ships them as cast_bitmaps/). Copied
// per sprite name with the matching regpoints.tsv rows, when that dump is present.
const CAST_BITMAPS = join(ROOT, 'assets-mr-original', 'cast_bitmaps')
const castSprites = [
  'acid', 'archer', 'archerArrow', 'babyOstrich', 'bat', 'batBullet', 'batTree', 'blackOrc', 'blueFlame',
  'bomb', 'bombMage', 'boulder', 'boulderCave', 'boulderMonster', 'bowOrc', 'bug', 'cocoon', 'crossBolt',
  'darkCave', 'darkGolem', 'darkMage', 'darkRock', 'dojo', 'doubleDarkGolem', 'dragon', 'druid',
  'dwarfTower', 'evilTv', 'fangBunny', 'fangBunnyBaby', 'fangBunnyBabyBullet', 'fangBunnyPortal', 'farmer',
  'fireBall', 'flamingRock', 'fourArmGolem', 'freezeBlast', 'frostyMonk', 'garTower', 'goblinHouse',
  'goblinHut', 'goblinMage', 'goblinMageHut', 'greyGhost', 'hydra1', 'hydra2', 'hydra3', 'iceBoulder',
  'iceRock', 'karateGuy', 'kingInGame', 'kongFuChicken', 'laser', 'lavaDarkGolem', 'lightning', 'lizard',
  'lizardEgg', 'lizardSoldier', 'mageOrc', 'magicPortal', 'monk', 'mysteriousCloud', 'necromancer', 'needle',
  'ninja', 'orcHouse', 'orcInvasion', 'ostrichEgg', 'plant', 'powerOstrich', 'quadranid', 'scArcher',
  'scArcherArrow', 'scMonk', 'scWarrior', 'shrouder', 'shuriken', 'shurikenNinja', 'skeletonArcher',
  'skeletonComando', 'skeletonDwelling', 'skeletonGiant', 'skeletonHead', 'skeletonThrower', 'skelitonArm',
  'skelitonFootSoldier', 'skelitonHead', 'skelitonLord', 'skelitonLowerLeg', 'skelitonMissile',
  'skelitonSword', 'skelitonTorsoTank', 'skelitonUpper', 'skw', 'smoke', 'smokePin', 'spark', 'speedyGuy',
  'swordOrc', 'thunderBlast', 'thunderMonk', 'towerAxe', 'townWatch', 'tvBox', 'undeadDragon',
  'undeadInvasion', 'vultureGuard', 'warrior',
]
if (existsSync(CAST_BITMAPS)) {
  const [header, ...rows] = readFileSync(join(CAST_BITMAPS, 'regpoints.tsv'), 'utf8').split('\n')
  for (const sprite of castSprites) {
    const frame = new RegExp(`^anm_${sprite}_[A-Za-z0-9]+_\\d+_\\d+\\.png$`)
    const names = new Set<string>()
    copyGlob(CAST_BITMAPS, frame, join(ASSETS, `sprites/${sprite}`), `${sprite} frames (Director cast dump)`)
    for (const f of readdirSync(CAST_BITMAPS)) if (frame.test(f)) names.add(f.slice(0, -4))
    mkdirSync(join(ASSETS, `sprites/${sprite}`), { recursive: true })
    writeFileSync(join(ASSETS, `sprites/${sprite}/regpoints.tsv`), [header, ...rows.filter((r) => names.has(r.split('\t')[0]!))].join('\n') + '\n')
  }
} else {
  console.log(`no Director cast dump at ${CAST_BITMAPS}: cast sprites not refreshed`)
}

for (const c of copies) {
  mkdirSync(dirname(c.to), { recursive: true })
  cpSync(c.from, c.to)
  console.log(`${c.to.slice(ROOT.length)}  <- ${c.why}`)
}
