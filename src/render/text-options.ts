import type { TextureSourceOptions } from 'pixi.js'

/**
 * Every Text's texture options (owner request: blocky but sharp text). Drawn at 1.4x the game's pixel
 * size (40 % more detail than the game's own pixels) and scaled up with nearest-neighbour sampling,
 * like the sprites, instead of smoothed.
 */
export const PIXEL_TEXT: { resolution: number; textureStyle: TextureSourceOptions } = {
  resolution: 1.4,
  textureStyle: { scaleMode: 'nearest' },
}
