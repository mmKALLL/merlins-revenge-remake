// Copies the original files this project uses from the (git-ignored) archive
// into ./assets with a sensible structure. Run: pnpm assets:copy
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'
import { GOLDEN_MACHINE_GUN, MERLIN_SCROLLS } from '../src/mr-open/mr-pickup'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const ARCHIVE = join(ROOT, 'assets-mr-original/merlin_open_30_speedy_and _tvs')
const CASTS = join(ARCHIVE, 'casts', 'data')
const GFX = join(ARCHIVE, 'gfx')
const ASSETS = join(ROOT, 'assets')

if (!existsSync(ARCHIVE)) {
  console.error(`archive not found: ${ARCHIVE}`)
  process.exit(1)
}

/** `opaque`: drop the image's alpha (white stays the transparent colour, as in the other members). */
type Copy = { from: string; to: string; why: string; opaque?: boolean }

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

// Potions and medikits (objPotion, objMedikit; docs/notes/engine-mechanics-potions.md). Each
// pickup's gfx members become a sprite folder named after it: `<name>_potion` (the pickup, also
// its HUD icon) as the stand strip and `<name>_writing` (shown fading once collected) as the
// writing strip. The maxikit has no members in gfx/; convert-assets cuts it from its objects tile.
const pickups: [name: string, gfxFolder: string][] = [
  ['manaBurst', 'potions'], ['manaCapacity', 'potions'], ['manaFlow', 'potions'], ['walkSpeed', 'potions'], ['medikit', 'medikit'],
]
for (const name of ['powerUp', ...pickups.map(([n]) => n), 'maxikit']) {
  copies.push({ from: join(CASTS, `act_${name}.txt`), to: join(ASSETS, `actors/${name}.txt`), why: 'actor: potion or medikit' })
}
for (const [name, folder] of pickups) {
  for (const [member, strip] of [['potion', 'stand'], ['writing', 'writing']]) {
    copies.push({ from: join(GFX, folder, `${name}_${member}.bmp`), to: join(ASSETS, `sprites/${name}/anm_${name}_${strip}_1_01.bmp`), why: `${name}_${member} member` })
  }
}
// the maxikit shows the medikit's writing: no maxikit_writing member is available
copies.push({ from: join(GFX, 'medikit', 'medikit_writing.bmp'), to: join(ASSETS, 'sprites/maxikit/anm_maxikit_writing_1_01.bmp'), why: 'maxikit writing (the medikit\'s)' })
// medikitMaster's HUD icons (medikit_on while a kit heals, medikit_off otherwise) as medikit strips
for (const state of ['on', 'off']) {
  const strip = state === 'on' ? 'hudOn' : 'hudOff'
  copies.push({ from: join(GFX, 'medikit', `medikit_${state}.bmp`), to: join(ASSETS, `sprites/medikit/anm_medikit_${strip}_1_01.bmp`), why: `medikit_${state} HUD icon` })
}
// Merlin's spells (docs/notes/engine-mechanics-spells.md): the scrolls (objScroll), the bullets and
// mines they fire, the units the summons bring and the dwarf's axe.
const spellActors = [
  'armySummon', 'energyMines', 'energyPulseSpell', 'cBlast', 'energyPunch', 'monsterSummon', 'arcticBlast',
  'energyBeamSpell', 'merlinSword', 'energyPulse', 'energyBeam', 'energyMine', 'summonArcher', 'summonWarrior',
  'summonOrc', 'summonBoulder', 'summonGolem', 'dwarf', 'dwarfAxe',
]
for (const name of spellActors) {
  copies.push({ from: join(CASTS, `act_${name}.txt`), to: join(ASSETS, `actors/${name}.txt`), why: 'actor: Merlin\'s spells' })
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
  // Merlin's spells: pulse and beam bullets, mines, the summon stage icons, the dwarf and its axe
  'energyPulse', 'energyBeam', 'energyMine', 'spellIcons', 'dwarf', 'axe',
]
/** Merlin's strips that only the cast has (his other frames come from gfx/merlin as BMPs): energy punch and sword. */
const MERLIN_CAST_STRIPS = ['magicMelee', 'weaponMelee']
/**
 * Spell scrolls by key: `<key>_scroll` (the pickup) and `<key>_writing` (shown once collected) become
 * the stand and writing strips of sprites/<key>/, as for the potions; `<key>_ws` is the weapon
 * selector icon (modWeaponSelector.getWeaponIcon). These members are not anm_* strips: dump them
 * into cast_bitmaps/ with `dump_bitmaps.py <key>_scroll <key>_writing <key>_ws punch_ws greenBox_ws yellowBox_ws`.
 */
const SCROLLS = MERLIN_SCROLLS.filter((k) => k !== GOLDEN_MACHINE_GUN) // the gmg is not ported yet
/**
 * Members whose dumped alpha channel is cut short (cBlast_scroll: the scroll's right edge, 42 drawn
 * pixels, has alpha 0 though its colours are all there); the copy drops the alpha.
 */
const BROKEN_ALPHA_MEMBERS = new Set(['cBlast_scroll'])
/** Weapon selector members: every scroll's icon, the punch's, and the palette's selection boxes. */
const SELECTOR_MEMBERS = [...SCROLLS.map((k) => `${k}_ws`), 'punch_ws', 'greenBox_ws', 'yellowBox_ws']
if (existsSync(CAST_BITMAPS)) {
  const [header, ...rows] = readFileSync(join(CAST_BITMAPS, 'regpoints.tsv'), 'utf8').split('\n')
  // the frames matching `frame` into sprites/<sprite>/, with their regpoints.tsv rows
  const copyCastFrames = (frame: RegExp, sprite: string, why: string): void => {
    copyGlob(CAST_BITMAPS, frame, join(ASSETS, `sprites/${sprite}`), why)
    const names = new Set(readdirSync(CAST_BITMAPS).filter((f) => frame.test(f)).map((f) => f.slice(0, -4)))
    mkdirSync(join(ASSETS, `sprites/${sprite}`), { recursive: true })
    writeFileSync(join(ASSETS, `sprites/${sprite}/regpoints.tsv`), [header, ...rows.filter((r) => names.has(r.split('\t')[0]!))].join('\n') + '\n')
  }
  for (const sprite of castSprites) {
    copyCastFrames(new RegExp(`^anm_${sprite}_[A-Za-z0-9]+_\\d+_\\d+\\.png$`), sprite, `${sprite} frames (Director cast dump)`)
  }
  copyCastFrames(new RegExp(`^anm_mer_(${MERLIN_CAST_STRIPS.join('|')})_\\d+_\\d+\\.png$`), 'mer', 'merlin melee frames (Director cast dump)')
  for (const key of SCROLLS) {
    const members: [member: string, strip: string][] = [['scroll', 'stand'], ['writing', 'writing']]
    for (const [member, strip] of members) {
      const name = `${key}_${member}`
      copies.push({ from: join(CAST_BITMAPS, `${name}.png`), to: join(ASSETS, `sprites/${key}/anm_${key}_${strip}_1_01.png`), why: `${name} member`, opaque: BROKEN_ALPHA_MEMBERS.has(name) })
    }
  }
  for (const member of SELECTOR_MEMBERS) {
    copies.push({ from: join(CAST_BITMAPS, `${member}.png`), to: join(ASSETS, `hud/weapon-selector/${member}.png`), why: 'weapon selector member' })
  }
} else {
  console.log(`no Director cast dump at ${CAST_BITMAPS}: cast sprites not refreshed`)
}

for (const c of copies) {
  mkdirSync(dirname(c.to), { recursive: true })
  if (c.opaque) writeFileSync(c.to, PNG.sync.write(withoutAlpha(PNG.sync.read(readFileSync(c.from)))))
  else cpSync(c.from, c.to)
  console.log(`${c.to.slice(ROOT.length)}  <- ${c.why}`)
}

/** The image fully opaque. */
function withoutAlpha(png: PNG): PNG {
  for (let i = 3; i < png.data.length; i += 4) png.data[i] = 255
  return png
}

// The title lettering: one GIF per letter in gfx/title/output (the apostrophe's file is "'.gif"),
// converted to PNG because the converter reads PNG and BMP only (sips ships with macOS).
const titleLetters: [file: string, name: string][] = [...'EGILMNRSV'].map((l) => [l, l])
titleLetters.push(["'", 'apostrophe'])
mkdirSync(join(ASSETS, 'title'), { recursive: true })
for (const [file, name] of titleLetters) {
  const to = join(ASSETS, 'title', `${name}.png`)
  execFileSync('sips', ['-s', 'format', 'png', join(GFX, 'title', 'output', `${file}.gif`), '--out', to], { stdio: 'ignore' })
  console.log(`${to.slice(ROOT.length)}  <- title letter`)
}

// The maxikit's stand frame: its merlinOpenObjects tile (46, the editor's picture of the item),
// cut to the 16x16 of the other pickup members around the drawn pixels (white is the sheet's
// background), as maxikit_potion is not in gfx/.
const MAXIKIT_TILE = { sheet: join(ASSETS, 'tilesets/merlinOpenObjects.png'), index: 46, tilesPerRow: 10, size: 32 }
const PICKUP_MEMBER_PX = 16
{
  const sheet = PNG.sync.read(readFileSync(MAXIKIT_TILE.sheet))
  const i = MAXIKIT_TILE.index - 1
  const x0 = (i % MAXIKIT_TILE.tilesPerRow) * MAXIKIT_TILE.size
  const y0 = Math.floor(i / MAXIKIT_TILE.tilesPerRow) * MAXIKIT_TILE.size
  const drawn = (x: number, y: number): boolean => {
    const o = ((y0 + y) * sheet.width + x0 + x) * 4
    const white = sheet.data[o] === 255 && sheet.data[o + 1] === 255 && sheet.data[o + 2] === 255
    return sheet.data[o + 3]! > 0 && !white
  }
  const box = { left: MAXIKIT_TILE.size, top: MAXIKIT_TILE.size, right: 0, bottom: 0 }
  for (let y = 0; y < MAXIKIT_TILE.size; y++) {
    for (let x = 0; x < MAXIKIT_TILE.size; x++) {
      if (!drawn(x, y)) continue
      box.left = Math.min(box.left, x)
      box.top = Math.min(box.top, y)
      box.right = Math.max(box.right, x + 1)
      box.bottom = Math.max(box.bottom, y + 1)
    }
  }
  const left = Math.round((box.left + box.right - PICKUP_MEMBER_PX) / 2)
  const top = Math.round((box.top + box.bottom - PICKUP_MEMBER_PX) / 2)
  const frame = new PNG({ width: PICKUP_MEMBER_PX, height: PICKUP_MEMBER_PX })
  PNG.bitblt(sheet, frame, x0 + left, y0 + top, PICKUP_MEMBER_PX, PICKUP_MEMBER_PX, 0, 0)
  const to = join(ASSETS, 'sprites/maxikit/anm_maxikit_stand_1_01.png')
  writeFileSync(to, PNG.sync.write(frame))
  console.log(`${to.slice(ROOT.length)}  <- maxikit frame from its objects tile`)
}
