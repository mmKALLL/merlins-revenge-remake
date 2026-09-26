// Generates assets/maps/combat_test.txt (2x1 rooms, 18x9 tiles, merlin4 tilesets). Run: node tools/make-combat-test-map.mjs
const W = 18, H = 9
const grid = (f) => Array.from({ length: H }, (_, r) => Array.from({ length: W }, (_, c) => f(c + 1, r + 1)))
const fmt = (g) => '[' + g.map((row) => '[' + row.join(', ') + ']').join(', ') + ']'

const passive = () => grid(() => 12)
// ring of solid 1 around the edge; gap on the shared edge at rows 4-5
const active = (room) =>
  grid((c, r) => {
    const gap = (r === 4 || r === 5) && ((room === 1 && c === 18) || (room === 2 && c === 1))
    if (gap) return 0
    if (c === 1 || c === W || r === 1 || r === H) return 1
    if (room === 1 && c === 9 && r >= 3 && r <= 6) return 1
    return 0
  })
const objects = (placed) => grid((c, r) => placed.find((p) => p.c === c && p.r === r)?.id ?? 0)
const PLAYER = 1, ARCHER = 21, WARRIOR = 22, MUSIC_WOODS = 78, MUSIC_LAST_STAND = 77 // merlin4Objects key indices
const rooms = [
  { num: 1, objs: [{ c: 2, r: 2, id: MUSIC_WOODS }, { c: 4, r: 5, id: PLAYER }, { c: 15, r: 5, id: WARRIOR }] },
  { num: 2, objs: [
    // a cluster around the centre (room centre is between columns 9-10, rows 4-6)
    { c: 10, r: 4, id: ARCHER }, { c: 12, r: 3, id: ARCHER },
    { c: 8, r: 5, id: WARRIOR }, { c: 11, r: 5, id: WARRIOR }, { c: 9, r: 6, id: WARRIOR },
    { c: 14, r: 7, id: WARRIOR },
    { c: 2, r: 2, id: MUSIC_LAST_STAND },
  ] },
]
const roomText = ({ num, objs }) =>
  `[#num: ${num}, #layers: [[#name: #backgroundPassive, #map: ${fmt(passive())}], [#name: #backgroundActive, #map: ${fmt(active(num))}], [#name: #objects, #map: ${fmt(objects(objs))}]]]`
const text =
  `[#map: [#mapSize: point(2, 1), #roomSize: point(18, 9), #startRoom: point(1, 1), #endRoom: #none, ` +
  `#layerDefinitions: [[#name: #backgroundPassive, #tileSet: #merlin4Passive, #displayScale: 1], [#name: #backgroundActive, #tileSet: #merlin4Active, #displayScale: 1], [#name: #objects, #tileSet: #merlin4Objects, #displayScale: 1]], ` +
  `#rooms: [${rooms.map(roomText).join(', ')}]]]`
import { writeFileSync } from 'node:fs'
writeFileSync(new URL('../assets/maps/combat_test.txt', import.meta.url), text + '\n')
