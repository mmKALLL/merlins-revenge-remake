// A sprite frame for the page's menus (remake): the loaded frame drawn into a canvas at a whole
// multiple of its size, kept pixelated, so a DOM panel shows the same art as the game.
import type { Texture } from 'pixi.js'

/** The frame `tex` at `scale` times its size; null when its sheet is not an image a canvas can draw. */
export function frameCanvas(tex: Texture, scale: number): HTMLCanvasElement | null {
  const image = tex.source.resource as CanvasImageSource | undefined
  if (!image) return null
  const { x, y, width, height } = tex.frame
  const canvas = document.createElement('canvas')
  canvas.width = width * scale
  canvas.height = height * scale
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(image, x, y, width, height, 0, 0, canvas.width, canvas.height)
  return canvas
}
