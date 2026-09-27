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
export interface Atlas {
  sheet: RgbaImage
  animations: Record<string, AtlasAnimation>
}

export function parseFrameName(name: string): FrameName | null {
  const m = /^anm_([A-Za-z0-9]+)_([A-Za-z0-9]+)_(\d+)_(\d+)\.\w+$/.exec(name)
  if (!m) return null
  return { chr: m[1]!, anim: m[2]!, delay: Number(m[3]), frame: Number(m[4]) }
}

type RowFrame = { frame: number; delay: number; image: RgbaImage; reg?: { x: number; y: number } }

/**
 * One row per animation, in order of first appearance; frames sorted by frame number within a row.
 * Each frame keeps its own delay (animStripMaster reads it per member, so a strip can mix them,
 * e.g. anm_bowOrc_weaponRanged_02_01 .. _04_09).
 */
export function buildAtlas(frames: AtlasFrame[]): Atlas {
  const byAnim = new Map<string, RowFrame[]>()
  for (const f of frames) {
    const p = parseFrameName(f.name)
    if (!p) continue
    const row = byAnim.get(p.anim) ?? []
    row.push({ frame: p.frame, delay: p.delay, image: f.image, ...(f.reg ? { reg: f.reg } : {}) })
    byAnim.set(p.anim, row)
  }
  let width = 0
  let height = 0
  const rows: { name: string; y: number; frames: RowFrame[] }[] = []
  for (const [name, row] of byAnim) {
    row.sort((a, b) => a.frame - b.frame)
    const rowW = row.reduce((s, f) => s + f.image.width, 0)
    const rowH = Math.max(...row.map((f) => f.image.height))
    rows.push({ name, y: height, frames: row })
    width = Math.max(width, rowW)
    height += rowH
  }
  const sheet: RgbaImage = { width, height, rgba: new Uint8Array(width * height * 4) }
  const animations: Record<string, AtlasAnimation> = {}
  for (const row of rows) {
    let x = 0
    const rects: AtlasRect[] = []
    for (const f of row.frames) {
      blit(sheet, f.image, x, row.y)
      rects.push({ x, y: row.y, w: f.image.width, h: f.image.height, delay: f.delay, ...(f.reg ? { reg: f.reg } : {}) })
      x += f.image.width
    }
    animations[row.name] = { delay: row.frames[0]!.delay, frames: rects }
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
