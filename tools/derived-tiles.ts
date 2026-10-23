// Remake tiles made from original art by the converter (no new drawing): a tile re-coloured into an
// empty slot of its tileset. The Dragon Canyon's red sandstone (owner request) is the cracked grey
// stone (merlinOpenPassive 25) warmed to a full red sandstone (owner's pick of four brightness levels).
import type { RgbaImage } from './bmp'

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
