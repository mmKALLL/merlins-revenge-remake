// Builds one RGBA sheet plus a JSON atlas from named frames.
// Frame naming follows animStripMaster: anm_<chr>_<animName>_<delay>_<frame>.
import type { RgbaImage } from './bmp'

export interface FrameName {
  chr: string
  anim: string
  delay: number
  frame: number
}
export interface AtlasRect {
  x: number
  y: number
  w: number
  h: number
}
export interface AtlasAnimation {
  delay: number
  frames: AtlasRect[]
}
export interface Atlas {
  sheet: RgbaImage
  animations: Record<string, AtlasAnimation>
}

export function parseFrameName(name: string): FrameName | null {
  const m = /^anm_([A-Za-z0-9]+)_([A-Za-z0-9]+)_(\d+)_(\d+)\.\w+$/.exec(name)
  if (!m) return null
  return { chr: m[1]!, anim: m[2]!, delay: Number(m[3]), frame: Number(m[4]) }
}

/** One row per animation, in order of first appearance; frames sorted by frame number within a row. */
export function buildAtlas(frames: { name: string; image: RgbaImage }[]): Atlas {
  const byAnim = new Map<string, { delay: number; frames: { frame: number; image: RgbaImage }[] }>()
  for (const f of frames) {
    const p = parseFrameName(f.name)
    if (!p) continue
    const entry = byAnim.get(p.anim) ?? { delay: p.delay, frames: [] }
    entry.frames.push({ frame: p.frame, image: f.image })
    byAnim.set(p.anim, entry)
  }
  let width = 0
  let height = 0
  const rows: { name: string; delay: number; y: number; images: RgbaImage[] }[] = []
  for (const [name, entry] of byAnim) {
    entry.frames.sort((a, b) => a.frame - b.frame)
    const images = entry.frames.map((f) => f.image)
    const rowW = images.reduce((s, i) => s + i.width, 0)
    const rowH = Math.max(...images.map((i) => i.height))
    rows.push({ name, delay: entry.delay, y: height, images })
    width = Math.max(width, rowW)
    height += rowH
  }
  const sheet: RgbaImage = { width, height, rgba: new Uint8Array(width * height * 4) }
  const animations: Record<string, AtlasAnimation> = {}
  for (const row of rows) {
    let x = 0
    const rects: AtlasRect[] = []
    for (const img of row.images) {
      blit(sheet, img, x, row.y)
      rects.push({ x, y: row.y, w: img.width, h: img.height })
      x += img.width
    }
    animations[row.name] = { delay: row.delay, frames: rects }
  }
  return { sheet, animations }
}

function blit(dst: RgbaImage, src: RgbaImage, dx: number, dy: number): void {
  for (let y = 0; y < src.height; y++) {
    const s = y * src.width * 4
    const d = ((dy + y) * dst.width + dx) * 4
    dst.rgba.set(src.rgba.subarray(s, s + src.width * 4), d)
  }
}
