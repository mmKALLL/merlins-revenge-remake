// Keyboard navigation over rows of controls (the roguelite pick screen and run summary): the arrow
// keys or WASD, up and down between the rows, left and right within one, wrapping at the ends.

export type NavDirection = 'up' | 'down' | 'left' | 'right'

/** KeyboardEvent.code -> direction: the arrows, and WASD wherever the keyboard layout puts them. */
const NAV_CODES: Record<string, NavDirection> = {
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
}

/** The direction a key press moves the focus; null for other keys or with a modifier held. */
export function navDirection(e: Pick<KeyboardEvent, 'code' | 'ctrlKey' | 'altKey' | 'metaKey'>): NavDirection | null {
  if (e.ctrlKey || e.altKey || e.metaKey) return null
  return NAV_CODES[e.code] ?? null
}

export interface GridPos { row: number; col: number }

const wrap = (i: number, n: number): number => (i + n) % n

/**
 * Where the focus goes from `at` (null: nothing focused yet, so the first control) in rows of
 * `rowLengths` controls. Up and down skip empty rows and keep the column where the new row has
 * one (else its last); null when there is no control at all.
 */
export function moveInGrid(rowLengths: readonly number[], at: GridPos | null, dir: NavDirection): GridPos | null {
  const rows = rowLengths.map((n, row) => ({ n, row })).filter((r) => r.n > 0)
  if (rows.length === 0) return null
  if (at === null) return { row: rows[0]!.row, col: 0 }
  const n = rowLengths[at.row] ?? 0
  if (dir === 'left' || dir === 'right') return { row: at.row, col: wrap(at.col + (dir === 'right' ? 1 : -1), n) }
  const here = rows.findIndex((r) => r.row === at.row)
  const next = rows[wrap(here + (dir === 'down' ? 1 : -1), rows.length)]!
  return { row: next.row, col: Math.min(at.col, next.n - 1) }
}

/**
 * Moves the focus over rows of elements for a navigation key and takes the key from the menu
 * overlay (preventDefault); false, leaving the event alone, for any other key.
 */
export function focusInRows(rows: readonly (readonly HTMLElement[])[], e: KeyboardEvent): boolean {
  const dir = navDirection(e)
  if (dir === null) return false
  e.preventDefault()
  const focused = document.activeElement as HTMLElement
  const row = rows.findIndex((r) => r.includes(focused))
  const at = row < 0 ? null : { row, col: rows[row]!.indexOf(focused) }
  const to = moveInGrid(rows.map((r) => r.length), at, dir)
  if (to) rows[to.row]![to.col]!.focus()
  return true
}
