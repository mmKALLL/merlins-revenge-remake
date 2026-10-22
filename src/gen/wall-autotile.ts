// Wall autotiling for the random floor (docs/plans/2026-09-28-random-floor-design.md, Wall
// autotiling): once a room's layout has decided which cells are walls, each wall cell takes its tile
// from the theme's rules by which of its four neighbours are walls too, so vertical runs read as
// columns (top, middle, base) and horizontal runs as wall faces with posts at their ends.
import type { Vec } from '../mr-open/mr-geometry'
import { Cell } from './grid'
import type { WallAutotile, WallSide, Weighted } from './themes'

const SIDE_STEPS: Record<WallSide, Vec> = { up: { x: 0, y: -1 }, right: { x: 1, y: 0 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 } }
const SIDES = Object.keys(SIDE_STEPS) as WallSide[]

/** Edge walls and interior walls join up; patches, stumps and decorations do not. */
export const isWallCell = (c: Cell): boolean => c === Cell.Wall || c === Cell.LongWall

/** Which neighbours of a cell are walls; beyond the room's edge counts as no wall, so each room frames itself. */
export function wallNeighbours(cells: readonly Cell[], size: Vec, x: number, y: number): Record<WallSide, boolean> {
  const at = (side: WallSide): boolean => {
    const nx = x + SIDE_STEPS[side].x
    const ny = y + SIDE_STEPS[side].y
    return nx >= 0 && ny >= 0 && nx < size.x && ny < size.y && isWallCell(cells[ny * size.x + nx]!)
  }
  return Object.fromEntries(SIDES.map((side) => [side, at(side)])) as Record<WallSide, boolean>
}

/** The tiles of the first rule the neighbours match; throws when none does (the last rule should match anything). */
export function autotileChoices(rules: WallAutotile, neighbours: Record<WallSide, boolean>): readonly Weighted<number>[] {
  const rule = rules.find((r) => SIDES.every((side) => r.when[side] === undefined || r.when[side] === neighbours[side]))
  if (!rule) throw new Error(`wall autotile: no rule for ${JSON.stringify(neighbours)}`)
  return rule.tiles
}
