// Remake tiles made from original art by the converter (no new drawing): a tile re-coloured into an
// empty slot of its tileset; the remake's object symbols with their items' pictures. The Dragon Canyon's red sandstone (owner request) is the cracked grey
// stone (merlinOpenPassive 25) warmed to a full red sandstone (owner's pick of four brightness levels).
import type { RgbaImage } from './bmp'
import { REMAKE_OBJECT_TILES, withRemakeObjectSymbols } from '../src/gen/remake-object-tiles'

export interface DerivedTile {
  tileSet: string
  from: number // 1-based source tile
  to: number // 1-based slot it is written to (must be empty: plain white)
  colour: { r: number; g: number; b: number } // the tint each pixel's brightness takes
  pastel: number // share blended toward PASTEL_GREY (0 = full colour)
}

export const DERIVED_TILES: readonly DerivedTile[] = [
  { tileSet: 'merlinOpenPassive', from: 25, to: 37, colour: { r: 235, g: 140, b: 85 }, pastel: 0 },
]

/** Brightness lift so the tinted stone keeps the source's lightness. */
const BRIGHTNESS = 1.12
/** The light grey a pastel tint is softened toward. */
const PASTEL_GREY = 230
const WHITE = 255

/** The sheet with every derived tile of `tileSet` written into its slot (a copy; the input is unchanged). */
export function withDerivedTiles(tileSet: string, sheet: RgbaImage, tileSize: { x: number; y: number }): RgbaImage {
  const tiles = DERIVED_TILES.filter((d) => d.tileSet === tileSet)
  if (tiles.length === 0) return sheet
  const out: RgbaImage = { width: sheet.width, height: sheet.height, rgba: new Uint8Array(sheet.rgba) }
  const perRow = Math.floor(sheet.width / tileSize.x)
  const origin = (i: number) => ({ x: ((i - 1) % perRow) * tileSize.x, y: Math.floor((i - 1) / perRow) * tileSize.y })
  for (const d of tiles) {
    const from = origin(d.from)
    const to = origin(d.to)
    for (let y = 0; y < tileSize.y; y++) {
      for (let x = 0; x < tileSize.x; x++) {
        const src = ((from.y + y) * sheet.width + from.x + x) * 4
        const dst = ((to.y + y) * sheet.width + to.x + x) * 4
        if (out.rgba[dst] !== WHITE || out.rgba[dst + 1] !== WHITE || out.rgba[dst + 2] !== WHITE) {
          throw new Error(`derived tile ${tileSet} ${d.to}: the slot is not empty`)
        }
        const light = (sheet.rgba[src]! + sheet.rgba[src + 1]! + sheet.rgba[src + 2]!) / 3 / WHITE
        const tint = (c: number) => Math.min(WHITE, c * light * BRIGHTNESS) * (1 - d.pastel) + PASTEL_GREY * d.pastel
        out.rgba[dst] = Math.round(tint(d.colour.r))
        out.rgba[dst + 1] = Math.round(tint(d.colour.g))
        out.rgba[dst + 2] = Math.round(tint(d.colour.b))
        out.rgba[dst + 3] = sheet.rgba[src + 3]!
      }
    }
  }
  return out
}

/**
 * The remake's object symbols written into a converted key (withRemakeObjectSymbols) and, where a
 * slot is on the sheet, the object's stand frame (`standFrame(symbol)`) drawn centred in it, as the
 * editor's picture of the item. Returns the new symbols and sheet (the inputs unchanged).
 */
export function withRemakeObjectTiles(
  tileSet: string, symbols: readonly string[], sheet: RgbaImage | undefined, tileSize: { x: number; y: number },
  standFrame: (symbol: string) => RgbaImage | undefined,
): { symbols: string[]; sheet: RgbaImage | undefined } {
  const tiles = Object.entries(REMAKE_OBJECT_TILES[tileSet] ?? {})
  if (tiles.length === 0 || !sheet) return { symbols: withRemakeObjectSymbols(tileSet, symbols), sheet }
  const out = { width: sheet.width, height: sheet.height, rgba: new Uint8Array(sheet.rgba) }
  for (const [symbol, index] of tiles) {
    const frame = standFrame(symbol)
    if (frame) drawCentred(out, frame, index, tileSize)
  }
  return { symbols: withRemakeObjectSymbols(tileSet, symbols), sheet: out }
}

/** The frame's opaque pixels centred in tile `index` (1-based) of the sheet; nothing for a tile past the sheet. */
function drawCentred(sheet: RgbaImage, frame: RgbaImage, index: number, tileSize: { x: number; y: number }): void {
  const perRow = Math.floor(sheet.width / tileSize.x)
  if (index > perRow * Math.floor(sheet.height / tileSize.y)) return
  const x0 = ((index - 1) % perRow) * tileSize.x + Math.floor((tileSize.x - frame.width) / 2)
  const y0 = Math.floor((index - 1) / perRow) * tileSize.y + Math.floor((tileSize.y - frame.height) / 2)
  for (let y = 0; y < frame.height; y++) {
    for (let x = 0; x < frame.width; x++) {
      const src = (y * frame.width + x) * 4
      if (frame.rgba[src + 3] === 0) continue
      sheet.rgba.set(frame.rgba.subarray(src, src + 4), ((y0 + y) * sheet.width + x0 + x) * 4)
    }
  }
}
