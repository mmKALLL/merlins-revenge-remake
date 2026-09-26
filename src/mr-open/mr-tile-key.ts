// Port of objTileSetKey: maps a 1-based tile index to its key symbol.
import { parseLingo } from './mr-lingo-plist'
import type { Vec } from './mr-geometry'

export interface TileKey {
  tileSize: Vec
  /**
   * symbols[i] is the symbol for tile index i+1. Every non-comment line after
   * the tileSize line is one slot, blank lines included (they are 'none'), so
   * the length equals the engine's slot count for the key (e.g. 261 for the
   * Merlin Open Active key, 228 for Objects, 58 for the all-blank Passive key).
   */
  symbols: string[]
  isSolid(tileIndex: number): boolean
}

export function parseTileKey(text: string): TileKey {
  const lines = text.split(/\r?\n/)
  const sizeLine = lines[1] ?? ''
  const m = /^tileSize\s*\|\s*(point\([^)]*\))/.exec(sizeLine)
  if (!m) throw new Error('tile key: missing "tileSize | point(w,h)" on line 2')
  const tileSize = parseLingo(m[1]!) as Vec
  // The file's final newline yields one empty element from split; it is not a
  // slot. Every other blank line is an empty slot, as in the original engine.
  if (lines.length > 2 && lines[lines.length - 1] === '') lines.pop()
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
