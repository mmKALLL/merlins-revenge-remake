// Edge rules for generated maps, checked by the tests: facing edge tiles of neighbouring rooms are
// solid together, every entrance is at least MIN_ENTRANCE tiles wide, and the map's border is solid.
import type { Vec } from '../mr-open/mr-geometry'
import { roomXYToNum, type MapDefinition, type TileGrid } from '../mr-open/mr-map-format'

export const MIN_ENTRANCE = 3

/** Lengths of the runs of `false` in a line. */
function openRuns(solid: readonly boolean[]): number[] {
  const runs: number[] = []
  let run = 0
  for (const s of [...solid, true]) {
    if (!s) run++
    else if (run > 0) {
      runs.push(run)
      run = 0
    }
  }
  return runs
}

/** Every broken edge rule, as readable lines (empty when the map keeps them all). */
export function edgeMismatches(map: MapDefinition, isSolid: (active: number) => boolean): string[] {
  const { mapSize, roomSize } = map
  const byNum = new Map(map.rooms.map((r) => [r.num, r.layers.backgroundActive!]))
  const active = (room: Vec): TileGrid => byNum.get(roomXYToNum(room, mapSize))!
  const column = (room: Vec, x: number) => active(room).map((row) => isSolid(row[x]!))
  const row = (room: Vec, y: number) => active(room)[y]!.map(isSolid)
  const problems: string[] = []
  const checkShared = (where: string, a: boolean[], b: boolean[]) => {
    if (a.some((s, i) => s !== b[i])) problems.push(`${where}: facing edge tiles differ`)
    if (openRuns(a).some((n) => n < MIN_ENTRANCE)) problems.push(`${where}: an entrance narrower than ${MIN_ENTRANCE}`)
  }
  const checkBorder = (where: string, line: boolean[]) => {
    if (line.some((s) => !s)) problems.push(`${where}: open map border`)
  }
  const last = { x: roomSize.x - 1, y: roomSize.y - 1 }
  for (let y = 1; y <= mapSize.y; y++) {
    for (let x = 1; x <= mapSize.x; x++) {
      const room = { x, y }
      if (x < mapSize.x) checkShared(`${x},${y} right`, column(room, last.x), column({ x: x + 1, y }, 0))
      if (y < mapSize.y) checkShared(`${x},${y} bottom`, row(room, last.y), row({ x, y: y + 1 }, 0))
      if (x === 1) checkBorder(`${x},${y} left`, column(room, 0))
      if (x === mapSize.x) checkBorder(`${x},${y} right`, column(room, last.x))
      if (y === 1) checkBorder(`${x},${y} top`, row(room, 0))
      if (y === mapSize.y) checkBorder(`${x},${y} bottom`, row(room, last.y))
    }
  }
  return problems
}
