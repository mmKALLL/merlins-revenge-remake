// Packs every sprite's frames into a few shared RGBA pages plus one JSON index of where each
// frame landed, so the browser loads a handful of files instead of a sheet and an atlas per sprite.
// Frame naming follows animStripMaster: anm_<chr>_<animName>_<delay>_<frame>.
import type { RgbaImage } from './bmp'

export interface FrameName {
  chr: string
  anim: string
  delay: number
  frame: number
}
export interface AtlasRect {
  page: number // index into the bundle's pages
  x: number
  y: number
  w: number
  h: number
  delay: number // ticks this frame is shown (the frame name's own delay; strips can mix them)
  /** registration point within the frame when known (Director member regPoint); absent = frame centre */
  reg?: { x: number; y: number }
}
export interface AtlasAnimation {
  delay: number // the first frame's delay
  frames: AtlasRect[]
}
export interface AtlasFrame {
  name: string
  image: RgbaImage
  reg?: { x: number; y: number }
}
export interface SpriteAtlas {
  animations: Record<string, AtlasAnimation>
}
export interface SpriteBundle {
  pages: RgbaImage[]
  sprites: Record<string, SpriteAtlas>
}

/**
 * Largest page side: well inside the 2048 every WebGL device, phones included, can hold, and small
 * enough that the sprites take about six pages, so the loading bar moves as each one arrives.
 */
export const PAGE_SIZE = 1024
/** Transparent pixels between frames, so a frame drawn at a fractional position never samples its neighbour. */
export const FRAME_GAP = 1

export function parseFrameName(name: string): FrameName | null {
  const m = /^anm_([A-Za-z0-9]+)_([A-Za-z0-9]+)_(\d+)_(\d+)\.\w+$/.exec(name)
  if (!m) return null
  return { chr: m[1]!, anim: m[2]!, delay: Number(m[3]), frame: Number(m[4]) }
}

type StripFrame = { frame: number; delay: number; image: RgbaImage; reg?: { x: number; y: number } }

/**
 * A sprite's strips, in order of first appearance; frames sorted by frame number within a strip.
 * Each frame keeps its own delay (animStripMaster reads it per member, so a strip can mix them,
 * e.g. anm_bowOrc_weaponRanged_02_01 .. _04_09).
 */
function strips(frames: AtlasFrame[]): Map<string, StripFrame[]> {
  const byAnim = new Map<string, StripFrame[]>()
  for (const f of frames) {
    const p = parseFrameName(f.name)
    if (!p) continue
    const strip = byAnim.get(p.anim) ?? []
    strip.push({ frame: p.frame, delay: p.delay, image: f.image, ...(f.reg ? { reg: f.reg } : {}) })
    byAnim.set(p.anim, strip)
  }
  for (const strip of byAnim.values()) strip.sort((a, b) => a.frame - b.frame)
  return byAnim
}

type Placement = { page: number; x: number; y: number }

/**
 * Shelf packing: frames tallest first, left to right along a shelf as tall as its first frame,
 * a new shelf below when the row is full and a new page when the shelf would not fit.
 */
function placeFrames(images: RgbaImage[], pageSize: number): Placement[] {
  const order = images.map((_, i) => i).sort((a, b) => images[b]!.height - images[a]!.height || images[b]!.width - images[a]!.width)
  const placed: Placement[] = new Array(images.length)
  let page = 0
  let x = 0
  let y = 0
  let shelfH = 0
  for (const i of order) {
    const { width: w, height: h } = images[i]!
    if (w > pageSize || h > pageSize) throw new Error(`a ${w}x${h} frame does not fit a ${pageSize}px sprite page`)
    if (x + w > pageSize) {
      x = 0
      y += shelfH + FRAME_GAP
      shelfH = 0
    }
    if (y + h > pageSize) {
      page++
      x = 0
      y = 0
      shelfH = 0
    }
    placed[i] = { page, x, y }
    x += w + FRAME_GAP
    shelfH = Math.max(shelfH, h)
  }
  return placed
}

/** Every sprite's frames (by sprite name) packed into pages of at most pageSize a side, each page cut to what it holds. */
export function packSprites(sprites: Record<string, AtlasFrame[]>, pageSize = PAGE_SIZE): SpriteBundle {
  const byName = Object.entries(sprites).map(([name, frames]) => ({ name, strips: strips(frames) }))
  const images = byName.flatMap((s) => [...s.strips.values()].flatMap((strip) => strip.map((f) => f.image)))
  const placed = placeFrames(images, pageSize)
  const pages = pageSizes(images, placed).map(({ width, height }): RgbaImage => ({ width, height, rgba: new Uint8Array(width * height * 4) }))
  const bundle: SpriteBundle = { pages, sprites: {} }
  let next = 0
  for (const { name, strips: byAnim } of byName) {
    const animations: Record<string, AtlasAnimation> = {}
    for (const [anim, strip] of byAnim) {
      const rects = strip.map((f): AtlasRect => {
        const { page, x, y } = placed[next++]!
        blit(pages[page]!, f.image, x, y)
        return { page, x, y, w: f.image.width, h: f.image.height, delay: f.delay, ...(f.reg ? { reg: f.reg } : {}) }
      })
      animations[anim] = { delay: strip[0]!.delay, frames: rects }
    }
    bundle.sprites[name] = { animations }
  }
  return bundle
}

/** Each page's size: the right and bottom edges of the frames placed on it. */
function pageSizes(images: RgbaImage[], placed: Placement[]): { width: number; height: number }[] {
  const sizes: { width: number; height: number }[] = []
  placed.forEach(({ page, x, y }, i) => {
    const size = (sizes[page] ??= { width: 0, height: 0 })
    size.width = Math.max(size.width, x + images[i]!.width)
    size.height = Math.max(size.height, y + images[i]!.height)
  })
  return sizes
}

function blit(dst: RgbaImage, src: RgbaImage, dx: number, dy: number): void {
  for (let y = 0; y < src.height; y++) {
    const s = y * src.width * 4
    const d = ((dy + y) * dst.width + dx) * 4
    dst.rgba.set(src.rgba.subarray(s, s + src.width * 4), d)
  }
}
