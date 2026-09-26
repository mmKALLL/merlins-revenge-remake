// Generates a placeholder tile sheet from a tile key: solid tiles dark grey with a
// light border, open tiles a colour hashed from the index. Index 0 is never drawn.
import type { RgbaImage } from './bmp'

export const TILES_PER_ROW = 10

export function buildPlaceholderTileset(symbols: string[], tileSize: { x: number; y: number }): RgbaImage {
  const rows = Math.ceil(symbols.length / TILES_PER_ROW)
  const width = TILES_PER_ROW * tileSize.x
  const height = rows * tileSize.y
  const img: RgbaImage = { width, height, rgba: new Uint8Array(width * height * 4) }
  symbols.forEach((sym, i) => {
    const tx = (i % TILES_PER_ROW) * tileSize.x
    const ty = Math.floor(i / TILES_PER_ROW) * tileSize.y
    const solid = sym === 'solid'
    const hue = ((i + 1) * 47) % 360
    const fill: [number, number, number] = solid ? [60, 60, 60] : hsl(hue, 0.35, 0.55)
    const border: [number, number, number] = [160, 160, 160]
    for (let y = 0; y < tileSize.y; y++) {
      for (let x = 0; x < tileSize.x; x++) {
        const edge = x === 0 || y === 0 || x === tileSize.x - 1 || y === tileSize.y - 1
        const d = ((ty + y) * width + tx + x) * 4
        const c = solid && edge ? border : fill
        img.rgba[d] = c[0]
        img.rgba[d + 1] = c[1]
        img.rgba[d + 2] = c[2]
        img.rgba[d + 3] = 255
      }
    }
  })
  return img
}

function hsl(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)]
}
