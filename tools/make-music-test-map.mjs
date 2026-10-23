// Generates assets/maps/test_maps/music_test.txt (7x1 rooms, 18x9 tiles, merlinOpen tilesets): one
// room per music block, in the order below, so each track can be heard by walking right. The debug
// readout (Settings, Debug info) names the track playing. A goblin in the last room keeps the map
// from completing. Run: node tools/make-music-test-map.mjs
import { readFileSync, writeFileSync } from 'node:fs'

const W = 18, H = 9
const grid = (f) => Array.from({ length: H }, (_, r) => Array.from({ length: W }, (_, c) => f(c + 1, r + 1)))
const fmt = (g) => '[' + g.map((row) => '[' + row.join(', ') + ']').join(', ') + ']'

const GROUND = 37 // merlinOpenPassive: the red sandstone (tools/derived-tiles.ts)
const keyFile = readFileSync(new URL('../assets/tile-keys/merlinOpenObjects.txt', import.meta.url), 'utf8')
const symbols = keyFile.split(/\r?\n|\r/).map((l) => l.trim()).filter((l) => l.startsWith('#')).map((l) => l.slice(1))
const tile = (symbol) => {
  const i = symbols.indexOf(symbol)
  if (i < 0) throw new Error(`merlinOpenObjects has no ${symbol}`)
  return i + 1
}

const MUSIC = ['musicWoodsOfEvil', 'musicBaroqueRock', 'musicBaroqueRockTechno', 'musicElectronicMerlin', 'musicLastStand', 'musicOff']
const rooms = [
  ...MUSIC.map((m, i) => ({ num: i + 1, objs: [{ c: 9, r: 2, s: m }, ...(i === 0 ? [{ c: 4, r: 5, s: 'player' }] : [])] })),
  { num: MUSIC.length + 1, objs: [{ c: 15, r: 5, s: 'goblinWarrior' }] },
]
const objects = (placed) => grid((c, r) => {
  const p = placed.find((o) => o.c === c && o.r === r)
  return p ? tile(p.s) : 0
})
const roomText = ({ num, objs }) =>
  `[#num: ${num}, #layers: [[#name: #backgroundPassive, #map: ${fmt(grid(() => GROUND))}], [#name: #backgroundActive, #map: ${fmt(grid(() => 0))}], [#name: #objects, #map: ${fmt(objects(objs))}]]]`
const text =
  `[#map: [#mapSize: point(${rooms.length}, 1), #roomSize: point(18, 9), #startRoom: point(1, 1), #endRoom: #none, ` +
  `#layerDefinitions: [[#name: #backgroundPassive, #tileSet: #merlinOpenPassive, #displayScale: 1], [#name: #backgroundActive, #tileSet: #merlinOpenActive, #displayScale: 1], [#name: #objects, #tileSet: #merlinOpenObjects, #displayScale: 1]], ` +
  `#rooms: [${rooms.map(roomText).join(', ')}]]]`
writeFileSync(new URL('../assets/maps/test_maps/music_test.txt', import.meta.url), text + '\n')
