// Remake tiles made from original art by the converter (no new drawing): a tile re-coloured into an
// empty slot of its tileset; the remake's object symbols with their items' pictures. The Dragon Canyon's red sandstone (owner request) is the cracked grey
// stone (merlinOpenPassive 25) warmed to a full red sandstone (owner's pick of four brightness levels).
// The roguelite's location sign is a blank board: an original sign with its writing painted over.
import type { RgbaImage } from './bmp'
import { BLANK_SIGN_SOURCE, BLANK_SIGN_TILES, BLANK_SIGN_TILESET } from '../src/gen/location-sign'
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
/** A writing pixel is painted once this many of its neighbours are wood (not writing, not white). */
const MIN_WOOD_NEIGHBOURS = 2

type TileSize = { x: number; y: number }

/** The top-left pixel of tile `index` (1-based) on a sheet. */
function tileOrigin(sheet: RgbaImage, tileSize: TileSize, index: number): { x: number; y: number } {
  const perRow = Math.floor(sheet.width / tileSize.x)
  return { x: ((index - 1) % perRow) * tileSize.x, y: Math.floor((index - 1) / perRow) * tileSize.y }
}

/** Throws unless tile `index` of the sheet is plain white (an empty slot). */
function checkEmptySlot(sheet: RgbaImage, tileSize: TileSize, index: number, what: string): void {
  const o = tileOrigin(sheet, tileSize, index)
  for (let y = 0; y < tileSize.y; y++) {
    for (let x = 0; x < tileSize.x; x++) {
      const i = ((o.y + y) * sheet.width + o.x + x) * 4
      if (sheet.rgba[i] !== WHITE || sheet.rgba[i + 1] !== WHITE || sheet.rgba[i + 2] !== WHITE) throw new Error(`${what}: the slot ${index} is not empty`)
    }
  }
}

/** The sheet with every derived tile of `tileSet` written into its slot (a copy; the input is unchanged). */
export function withDerivedTiles(tileSet: string, sheet: RgbaImage, tileSize: TileSize): RgbaImage {
  const tiles = DERIVED_TILES.filter((d) => d.tileSet === tileSet)
  const out: RgbaImage = { width: sheet.width, height: sheet.height, rgba: new Uint8Array(sheet.rgba) }
  if (tileSet === BLANK_SIGN_TILESET) writeBlankSign(out, tileSize)
  for (const d of tiles) {
    checkEmptySlot(out, tileSize, d.to, `derived tile ${tileSet} ${d.to}`)
    const from = tileOrigin(sheet, tileSize, d.from)
    const to = tileOrigin(sheet, tileSize, d.to)
    for (let y = 0; y < tileSize.y; y++) {
      for (let x = 0; x < tileSize.x; x++) {
        const src = ((from.y + y) * sheet.width + from.x + x) * 4
        const dst = ((to.y + y) * sheet.width + to.x + x) * 4
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

/** The blank board's slots, left to right, as BLANK_SIGN_SOURCE's tiles. */
const BLANK_SIGN_SLOTS = [BLANK_SIGN_TILES.left, BLANK_SIGN_TILES.middle, BLANK_SIGN_TILES.right]

/** The key with the blank board's slots solid, like the original signs. */
export function withBlankSignSymbols(tileSet: string, symbols: readonly string[]): string[] {
  const out = [...symbols]
  if (tileSet !== BLANK_SIGN_TILESET) return out
  for (const slot of BLANK_SIGN_SLOTS) {
    if (out[slot - 1] !== 'none') throw new Error(`blank sign ${tileSet} ${slot}: the slot holds ${out[slot - 1]}`)
    out[slot - 1] = 'solid'
  }
  return out
}

/** The source sign's tiles side by side, its writing wiped, written into the blank board's slots. */
function writeBlankSign(sheet: RgbaImage, tileSize: TileSize): void {
  const strip = wipeWriting(cutStrip(sheet, tileSize, BLANK_SIGN_SOURCE))
  BLANK_SIGN_SLOTS.forEach((slot, n) => {
    checkEmptySlot(sheet, tileSize, slot, `blank sign ${BLANK_SIGN_TILESET}`)
    const to = tileOrigin(sheet, tileSize, slot)
    for (let y = 0; y < tileSize.y; y++) {
      const src = (y * strip.width + n * tileSize.x) * 4
      sheet.rgba.set(strip.rgba.subarray(src, src + tileSize.x * 4), ((to.y + y) * sheet.width + to.x) * 4)
    }
  })
}

/** Tiles of a sheet side by side in one image, one tile high. */
function cutStrip(sheet: RgbaImage, tileSize: TileSize, tiles: readonly number[]): RgbaImage {
  const width = tiles.length * tileSize.x
  const rgba = new Uint8Array(width * tileSize.y * 4)
  tiles.forEach((tile, n) => {
    const from = tileOrigin(sheet, tileSize, tile)
    for (let y = 0; y < tileSize.y; y++) {
      const src = ((from.y + y) * sheet.width + from.x) * 4
      rgba.set(sheet.rgba.subarray(src, src + tileSize.x * 4), (y * width + n * tileSize.x) * 4)
    }
  })
  return { width, height: tileSize.y, rgba }
}

/**
 * The board with its writing painted over: the signs' wood is plain grey and their writing yellow, so
 * every coloured pixel takes the mean grey of its wood neighbours, filling the strokes from their
 * edges inward.
 */
export function wipeWriting(board: RgbaImage): RgbaImage {
  const out: RgbaImage = { width: board.width, height: board.height, rgba: new Uint8Array(board.rgba) }
  const { width, height, rgba } = out
  const at = (x: number, y: number) => (y * width + x) * 4
  const isWhite = (i: number) => rgba[i] === WHITE && rgba[i + 1] === WHITE && rgba[i + 2] === WHITE
  const isInk = (i: number) => !isWhite(i) && (rgba[i] !== rgba[i + 1] || rgba[i + 1] !== rgba[i + 2])
  let ink: number[] = []
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (isInk(at(x, y))) ink.push(y * width + x)
  const pending = new Set(ink)
  while (ink.length > 0) {
    const filled: [number, number][] = []
    for (const p of ink) {
      const x = p % width
      const y = (p - x) / width
      const wood: number[] = []
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx
          const ny = y + dy
          if ((dx === 0 && dy === 0) || nx < 0 || ny < 0 || nx >= width || ny >= height || pending.has(ny * width + nx)) continue
          if (!isWhite(at(nx, ny))) wood.push(rgba[at(nx, ny)]!)
        }
      }
      if (wood.length >= MIN_WOOD_NEIGHBOURS) filled.push([p, Math.round(wood.reduce((a, b) => a + b, 0) / wood.length)])
    }
    if (filled.length === 0) throw new Error('blank sign: writing left that no wood surrounds')
    for (const [p, grey] of filled) {
      rgba.fill(grey, p * 4, p * 4 + 3)
      pending.delete(p)
    }
    ink = ink.filter((p) => pending.has(p))
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
