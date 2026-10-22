// Tile grids for the random floor generator: what a room tile holds while it is laid out, and
// flood fills over it. Coordinates are 0-based tiles, index = row * width + col.
import type { Vec } from '../mr-open/mr-geometry'

export const Cell = {
  Open: 0,
  /** walkable decoration on the active layer */
  Decoration: 1,
  /** boundary or closed edge */
  Wall: 2,
  /** interior walls: long walls, cuts, baffles and maze walls */
  LongWall: 3,
  Patch: 4,
  Stump: 5,
} as const
export type Cell = (typeof Cell)[keyof typeof Cell]

export const isSolidCell = (c: Cell): boolean => c >= Cell.Wall

export const NEIGHBOURS_8: readonly Vec[] = [
  { x: -1, y: -1 }, { x: 0, y: -1 }, { x: 1, y: -1 }, { x: -1, y: 0 },
  { x: 1, y: 0 }, { x: -1, y: 1 }, { x: 0, y: 1 }, { x: 1, y: 1 },
]
export const NEIGHBOURS_4: readonly Vec[] = [{ x: 0, y: -1 }, { x: -1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }]

export class Grid {
  readonly cells: Cell[]
  constructor(readonly size: Vec, fill: Cell) {
    this.cells = new Array<Cell>(size.x * size.y).fill(fill)
  }
  inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.size.x && y < this.size.y
  }
  get(x: number, y: number): Cell {
    return this.cells[y * this.size.x + x]!
  }
  set(x: number, y: number, c: Cell): void {
    this.cells[y * this.size.x + x] = c
  }
  solidNeighbours(x: number, y: number): number {
    let n = 0
    for (const d of NEIGHBOURS_8) {
      const nx = x + d.x
      const ny = y + d.y
      if (this.inside(nx, ny) && isSolidCell(this.get(nx, ny))) n++
    }
    return n
  }
}

/** Open tiles 4-connected to any of `from`. */
export function floodOpen(cells: readonly Cell[], size: Vec, from: readonly Vec[]): boolean[] {
  const seen = new Array<boolean>(cells.length).fill(false)
  const stack: number[] = []
  for (const p of from) {
    const i = p.y * size.x + p.x
    if (!isSolidCell(cells[i]!) && !seen[i]) {
      seen[i] = true
      stack.push(i)
    }
  }
  while (stack.length > 0) {
    const i = stack.pop()!
    const x = i % size.x
    const y = (i - x) / size.x
    for (const d of NEIGHBOURS_4) {
      const nx = x + d.x
      const ny = y + d.y
      if (nx < 0 || ny < 0 || nx >= size.x || ny >= size.y) continue
      const j = ny * size.x + nx
      if (!seen[j] && !isSolidCell(cells[j]!)) {
        seen[j] = true
        stack.push(j)
      }
    }
  }
  return seen
}
