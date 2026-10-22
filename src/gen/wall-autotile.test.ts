import { describe, expect, it } from 'vitest'
import { Cell } from './grid'
import { THEMES, type WallAutotile } from './themes'
import { autotileChoices, wallNeighbours } from './wall-autotile'

const W = Cell.Wall
const L = Cell.LongWall
const O = Cell.Open
const P = Cell.Patch
/** column top 1, middle 2, base 3, wall face 4, anything else 5 */
const RULES: WallAutotile = [
  { when: { up: false, down: true }, tiles: [{ value: 1, weight: 1 }] },
  { when: { up: true, down: true }, tiles: [{ value: 2, weight: 1 }] },
  { when: { up: true, down: false }, tiles: [{ value: 3, weight: 1 }] },
  { when: { left: true }, tiles: [{ value: 4, weight: 1 }] },
  { when: {}, tiles: [{ value: 5, weight: 1 }] },
]

describe('wall autotiling', () => {
  // a wall face along the top joining a column; a patch (pots) does not join walls
  const size = { x: 4, y: 4 }
  const cells = [
    W, W, L, W,
    O, O, L, P,
    O, O, L, O,
    O, P, O, O,
  ]
  const tileAt = (x: number, y: number) => autotileChoices(RULES, wallNeighbours(cells, size, x, y))[0]!.value

  it('takes the first rule the wall neighbours match, edge and interior walls alike', () => {
    expect([tileAt(0, 0), tileAt(1, 0), tileAt(3, 0)]).toEqual([5, 4, 4])
    expect([tileAt(2, 0), tileAt(2, 1), tileAt(2, 2)]).toEqual([1, 2, 3])
  })

  it('ends every theme table with a rule for any wall', () => {
    for (const theme of THEMES) {
      if (theme.wallAutotile) expect(theme.wallAutotile.at(-1)!.when, theme.id).toEqual({})
    }
  })
})
