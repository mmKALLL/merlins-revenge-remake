// One tileset made of several (the tower's, src/gen/tower-tilesets.ts): each part's tiles and key
// symbols start at its offset, gaps between parts are empty `none` tiles.
import type { RgbaImage } from './bmp'
import { tileCapacity, tilesPerRow } from './tileset-sheet'

export interface CombinedPart {
  name: string
  symbols: readonly string[]
  sheet: RgbaImage
  /** the part's tile i (1-based) becomes combined tile offset + i */
  offset: number
}

export interface CombinedTileset { symbols: string[]; sheet: RgbaImage }

const BYTES_PER_PIXEL = 4

export function combineTilesets(parts: readonly CombinedPart[], tileSize: { x: number; y: number }, perRow: number): CombinedTileset {
  const symbols: string[] = []
  parts.forEach((part, i) => {
    const next = parts[i + 1]
    if (part.offset < symbols.length) throw new Error(`combined tileset: ${part.name} starts at ${part.offset}, inside the part before it`)
    if (next && part.offset + part.symbols.length > next.offset) {
      throw new Error(`combined tileset: ${part.name} has ${part.symbols.length} tiles, more than fit before ${next.name} at ${next.offset}`)
    }
    while (symbols.length < part.offset) symbols.push('none')
    symbols.push(...part.symbols)
  })
  const rows = Math.ceil(symbols.length / perRow)
  const sheet: RgbaImage = { width: perRow * tileSize.x, height: rows * tileSize.y, rgba: new Uint8Array(perRow * tileSize.x * rows * tileSize.y * BYTES_PER_PIXEL) }
  for (const part of parts) {
    const capacity = Math.min(part.symbols.length, tileCapacity(part.sheet.width, part.sheet.height, tileSize))
    const partPerRow = tilesPerRow(part.sheet.width, tileSize.x)
    for (let i = 0; i < capacity; i++) {
      const to = part.offset + i
      copyTile(part.sheet, (i % partPerRow) * tileSize.x, Math.floor(i / partPerRow) * tileSize.y,
        sheet, (to % perRow) * tileSize.x, Math.floor(to / perRow) * tileSize.y, tileSize)
    }
  }
  return { symbols, sheet }
}

function copyTile(from: RgbaImage, fx: number, fy: number, to: RgbaImage, tx: number, ty: number, size: { x: number; y: number }): void {
  const rowBytes = size.x * BYTES_PER_PIXEL
  for (let y = 0; y < size.y; y++) {
    const src = ((fy + y) * from.width + fx) * BYTES_PER_PIXEL
    to.rgba.set(from.rgba.subarray(src, src + rowBytes), ((ty + y) * to.width + tx) * BYTES_PER_PIXEL)
  }
}
