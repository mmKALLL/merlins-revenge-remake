// Generates assets/maps/test_maps/spell_test.txt (2x1 rooms, 18x9 tiles, merlinOpen tilesets). Room 1: every
// spell scroll in a row above Merlin, the remake's volley scrolls in a row below him (the first batch in the
// middle, the second flanking it and in the top row), and Max Blast potions in the bottom row; room 2: goblins,
// an orc and a goblin hut to try them on (docs/notes/engine-mechanics-spells.md). Run: node tools/make-spells-test-map.mjs
import { readFileSync, writeFileSync } from 'node:fs'

const W = 18, H = 9
const grid = (f) => Array.from({ length: H }, (_, r) => Array.from({ length: W }, (_, c) => f(c + 1, r + 1)))
const fmt = (g) => '[' + g.map((row) => '[' + row.join(', ') + ']').join(', ') + ']'

const MUD = 2 // merlinOpenPassive ground
// tile indices from the objects tileset key: one symbol per line, in tile order
const keyFile = readFileSync(new URL('../assets/tile-keys/merlinOpenObjects.txt', import.meta.url), 'utf8')
const symbols = keyFile.split(/\r?\n|\r/).map((l) => l.trim()).filter((l) => l.startsWith('#')).map((l) => l.slice(1))
// the remake's volley scrolls are not in the original key: their slots as src/gen/remake-object-tiles.ts gives them
const REMAKE_TILES = {
  bombVolley: 31, boltFan: 32, arrowRain: 33, shurikenFan: 34, thunderBurst: 35, pinStorm: 36, lavaLob: 37, needleSpray: 40,
  longbow: 19, dragonFire: 20, boulderLob: 54, darkRockBurst: 55, poisonSmoke: 56, acidSplash: 57, lightningFan: 58, bunnyLob: 59,
  skullToss: 60, frostBurst: 100, iceBoulderLob: 102, chillFlame: 109,
}
const tile = (symbol) => {
  if (REMAKE_TILES[symbol]) return REMAKE_TILES[symbol]
  const i = symbols.indexOf(symbol)
  if (i < 0) throw new Error(`merlinOpenObjects has no ${symbol}`)
  return i + 1
}

const SCROLLS = ['armySummon', 'energyMines', 'energyPulseSpell', 'cBlast', 'energyPunch', 'monsterSummon', 'healBlast', 'arcticBlast', 'energyBeamSpell', 'merlinSword']
const VOLLEYS = ['bombVolley', 'boltFan', 'arrowRain', 'shurikenFan', 'thunderBurst', 'pinStorm', 'lavaLob', 'needleSpray']
// the second batch: beside the first in its row, then in the top row
const VOLLEYS_2_LEFT = ['longbow', 'dragonFire', 'boulderLob']
const VOLLEYS_2_RIGHT = ['darkRockBurst', 'poisonSmoke', 'acidSplash', 'lightningFan']
const VOLLEYS_2_TOP = ['bunnyLob', 'skullToss', 'frostBurst', 'iceBoulderLob', 'chillFlame']
const MAX_BLAST = 'manaCapacity'
const POTIONS = 8
const MERLIN_COLUMN = 9
/** `names` side by side in row `r` from column `c0`, stepping over Merlin's column when `skipMerlin`. */
const rowOf = (names, r, c0, skipMerlin = false) =>
  names.map((s, i) => {
    const c = c0 + i
    return { c: skipMerlin && c >= MERLIN_COLUMN ? c + 1 : c, r, s }
  })
const rooms = [
  { num: 1, objs: [
    { c: MERLIN_COLUMN, r: 5, s: 'player' },
    ...rowOf(VOLLEYS_2_TOP, 1, 6, true),
    ...rowOf(SCROLLS, 3, 4, true),
    ...rowOf(VOLLEYS_2_LEFT, 7, 2), ...rowOf(VOLLEYS, 7, 5, true), ...rowOf(VOLLEYS_2_RIGHT, 7, 14),
    ...rowOf(Array(POTIONS).fill(MAX_BLAST), 9, 5),
  ] },
  { num: 2, objs: [
    { c: 12, r: 3, s: 'goblinWarrior' }, { c: 13, r: 5, s: 'goblinWarrior' }, { c: 12, r: 7, s: 'goblinWarrior' },
    { c: 15, r: 4, s: 'goblinArcher' }, { c: 15, r: 6, s: 'goblinArcher' }, { c: 16, r: 5, s: 'swordOrc' }, { c: 16, r: 2, s: 'goblinHut' },
  ] },
]
const objects = (placed) => grid((c, r) => {
  const p = placed.find((o) => o.c === c && o.r === r)
  return p ? tile(p.s) : 0
})
const roomText = ({ num, objs }) =>
  `[#num: ${num}, #layers: [[#name: #backgroundPassive, #map: ${fmt(grid(() => MUD))}], [#name: #backgroundActive, #map: ${fmt(grid(() => 0))}], [#name: #objects, #map: ${fmt(objects(objs))}]]]`
const text =
  `[#map: [#mapSize: point(2, 1), #roomSize: point(18, 9), #startRoom: point(1, 1), #endRoom: #none, ` +
  `#layerDefinitions: [[#name: #backgroundPassive, #tileSet: #merlinOpenPassive, #displayScale: 1], [#name: #backgroundActive, #tileSet: #merlinOpenActive, #displayScale: 1], [#name: #objects, #tileSet: #merlinOpenObjects, #displayScale: 1]], ` +
  `#rooms: [${rooms.map(roomText).join(', ')}]]]`
writeFileSync(new URL('../assets/maps/test_maps/spell_test.txt', import.meta.url), text + '\n')
