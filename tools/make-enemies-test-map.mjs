// Generates assets/maps/enemies_test.txt (4x1 rooms, 18x9 tiles, merlin4 tilesets): one room per
// enemy-slice showcase. Run: node tools/make-enemies-test-map.mjs
const W = 18, H = 9
const grid = (f) => Array.from({ length: H }, (_, r) => Array.from({ length: W }, (_, c) => f(c + 1, r + 1)))
const fmt = (g) => '[' + g.map((row) => '[' + row.join(', ') + ']').join(', ') + ']'
const ROOMS = 4

const passive = () => grid(() => 12)
// ring of solid 1 around each room, with a doorway (rows 4-5) on every shared edge
const active = (room) =>
  grid((c, r) => {
    const door = r === 4 || r === 5
    if (door && ((c === W && room < ROOMS) || (c === 1 && room > 1))) return 0
    if (c === 1 || c === W || r === 1 || r === H) return 1
    return 0
  })
const objects = (placed) => grid((c, r) => placed.find((p) => p.c === c && p.r === r)?.id ?? 0)
// merlin4Objects key indices
const PLAYER = 1, GOBLIN_HUT = 20, GOBLIN_MAGE_HUT = 23, GOBLIN_MAGE = 24, BOW_ORC = 66, SWORD_ORC = 68, ORC_HOUSE = 69
const MUSIC_WOODS = 78, MUSIC_LAST_STAND = 77
const rooms = [
  // goblin mages: two in the open, a mage hut in the far corner
  { num: 1, objs: [{ c: 2, r: 2, id: MUSIC_WOODS }, { c: 3, r: 5, id: PLAYER }, { c: 12, r: 3, id: GOBLIN_MAGE }, { c: 13, r: 7, id: GOBLIN_MAGE }, { c: 16, r: 5, id: GOBLIN_MAGE_HUT }] },
  // orcs: two archers and a fighter
  { num: 2, objs: [{ c: 13, r: 3, id: BOW_ORC }, { c: 14, r: 7, id: BOW_ORC }, { c: 11, r: 5, id: SWORD_ORC }] },
  // a goblin hut (archers and warriors)
  { num: 3, objs: [{ c: 14, r: 5, id: GOBLIN_HUT }] },
  // the orc house (on team goblins in the data; bow and sword orcs)
  { num: 4, objs: [{ c: 2, r: 2, id: MUSIC_LAST_STAND }, { c: 14, r: 5, id: ORC_HOUSE }] },
]
const roomText = ({ num, objs }) =>
  `[#num: ${num}, #layers: [[#name: #backgroundPassive, #map: ${fmt(passive())}], [#name: #backgroundActive, #map: ${fmt(active(num))}], [#name: #objects, #map: ${fmt(objects(objs))}]]]`
const text =
  `[#map: [#mapSize: point(${ROOMS}, 1), #roomSize: point(18, 9), #startRoom: point(1, 1), #endRoom: #none, ` +
  `#layerDefinitions: [[#name: #backgroundPassive, #tileSet: #merlin4Passive, #displayScale: 1], [#name: #backgroundActive, #tileSet: #merlin4Active, #displayScale: 1], [#name: #objects, #tileSet: #merlin4Objects, #displayScale: 1]], ` +
  `#rooms: [${rooms.map(roomText).join(', ')}]]]`
import { writeFileSync } from 'node:fs'
writeFileSync(new URL('../assets/maps/enemies_test.txt', import.meta.url), text + '\n')
