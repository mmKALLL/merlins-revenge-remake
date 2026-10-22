import type { TextureSourceOptions } from 'pixi.js'

/**
 * Every Text's texture options (owner request: blocky but sharp text). Drawn at the game's own pixel
 * size and scaled up with nearest-neighbour sampling, like the sprites, instead of smoothed.
 */
export const PIXEL_TEXT: { resolution: number; textureStyle: TextureSourceOptions } = {
  resolution: 1,
  textureStyle: { scaleMode: 'nearest' },
}
