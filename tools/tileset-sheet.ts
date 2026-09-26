// Helpers for real tile sheets extracted from the Director cast (assets/tilesets).
import type { RgbaImage } from './bmp'

/** Lingo's `width / tileSize` is integer division: trailing slivers narrower than a tile are ignored. */
export function tilesPerRow(width: number, tileWidth: number): number {
  return Math.floor(width / tileWidth)
}

/** Number of addressable tiles in a sheet: full columns times full rows. */
export function tileCapacity(width: number, height: number, tileSize: { x: number; y: number }): number {
  return tilesPerRow(width, tileSize.x) * Math.floor(height / tileSize.y)
}

/**
 * The original blits the Active and Objects layers with ink 36 (background
 * transparent), which makes pure white see-through; the Passive layer is the
 * opaque base. Returns a copy with (255,255,255) pixels set to alpha 0.
 */
export function whiteToAlpha(img: RgbaImage): RgbaImage {
  const rgba = new Uint8Array(img.rgba)
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i] === 255 && rgba[i + 1] === 255 && rgba[i + 2] === 255) rgba[i + 3] = 0
  }
  return { width: img.width, height: img.height, rgba }
}

/** Whether a tileset name is drawn with white as transparent (everything but the Passive base layer). */
export function usesWhiteTransparency(name: string): boolean {
  return !name.endsWith('Passive')
}
