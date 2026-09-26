// Port of objTileSetKey: maps a 1-based tile index to its key symbol.
import { parseLingo } from './mr-lingo-plist'
import type { Vec } from './mr-map-format'

export interface TileKey {
  tileSize: Vec
  /** symbols[i] is the symbol for tile index i+1 */
  symbols: string[]
  isSolid(tileIndex: number): boolean
}

export function parseTileKey(text: string): TileKey {
  const lines = text.split(/\r?\n/)
  const sizeLine = lines[1] ?? ''
  const m = /^tileSize\s*\|\s*(point\([^)]*\))/.exec(sizeLine)
  if (!m) throw new Error('tile key: missing "tileSize | point(w,h)" on line 2')
  const tileSize = parseLingo(m[1]!) as Vec
  // trailing blank lines are not tiles
  while (lines.length > 0 && lines[lines.length - 1]!.trim() === '') lines.pop()
  const symbols: string[] = []
  for (const raw of lines.slice(2)) {
    const line = raw.trim()
    if (line.startsWith('--')) continue
    if (line === '') {
      symbols.push('none')
      continue
    }
    if (!line.startsWith('#')) throw new Error(`tile key: unexpected line "${line}"`)
    symbols.push(line.slice(1).trim())
  }
  return {
    tileSize,
    symbols,
    isSolid(i) {
      return i >= 1 && symbols[i - 1] === 'solid'
    },
  }
}
