// Remake art for the volley spells' scrolls (docs/notes/engine-mechanics-spells.md, Volley spells),
// made by tools/copy-assets.ts from original members already in assets/: the plain white scroll
// (healBlast_scroll) recoloured with a mini copy of the spell's projectile painted on, the pulse
// spell's weapon selector icon with its disc recoloured and the projectile on it, and the name
// written in a pixel font drawn after the original writings (2 px stems, 1 px bars, a black outline
// and the writings' orange-to-yellow rows).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { PNG } from 'pngjs'

export interface VolleyScrollArt {
  key: string
  name: string // the writing
  projectile: string // sprite folder of the projectile; its first fly frame is painted on
  colour: { r: number; g: number; b: number } // the scroll and icon disc colour
}

export const VOLLEY_SCROLL_ART: readonly VolleyScrollArt[] = [
  { key: 'bombVolley', name: 'Bomb Volley', projectile: 'bomb', colour: { r: 150, g: 150, b: 165 } },
  { key: 'boltFan', name: 'Bolt Fan', projectile: 'crossBolt', colour: { r: 200, g: 120, b: 90 } },
  { key: 'arrowRain', name: 'Arrow Rain', projectile: 'archerArrow', colour: { r: 215, g: 175, b: 110 } },
  { key: 'shurikenFan', name: 'Shuriken Fan', projectile: 'shuriken', colour: { r: 175, g: 130, b: 225 } },
  { key: 'thunderBurst', name: 'Thunder Burst', projectile: 'thunderBlast', colour: { r: 250, g: 225, b: 90 } },
  { key: 'pinStorm', name: 'Pin Storm', projectile: 'smokePin', colour: { r: 140, g: 200, b: 110 } },
  { key: 'lavaLob', name: 'Lava Lob', projectile: 'flamingRock', colour: { r: 240, g: 110, b: 60 } },
  { key: 'needleSpray', name: 'Needle Spray', projectile: 'needle', colour: { r: 160, g: 225, b: 150 } },
]

/** The plain scroll every volley scroll is recoloured from, and the icon whose disc is recoloured. */
const BASE_SCROLL = 'sprites/healBlast/anm_healBlast_stand_1_01.png'
const BASE_ICON = 'hud/weapon-selector/energyPulseSpell_ws.png'
/** Where the mini projectile sits: the scroll's open face, the icon's disc (centre and the box it fits in). */
const SCROLL_FACE = { cx: 9, cy: 8, w: 9, h: 7 }
const ICON_DISC = { cx: 9, cy: 8, w: 8, h: 8 }
/** A source pixel counts as drawn in a downscaled pixel when it covers this share of it. */
const COVERAGE = 0.35
/** The scroll keeps its lightness when tinted: brightness x colour x this. */
const TINT_LIFT = 1.1

type Rgb = { r: number; g: number; b: number }

const isDrawn = (png: PNG, o: number): boolean =>
  png.data[o + 3]! > 0 && !(png.data[o]! > 250 && png.data[o + 1]! > 250 && png.data[o + 2]! > 250)

/** The scroll tinted: each drawn pixel's brightness times the colour; the black outline stays black. */
function tinted(base: PNG, colour: Rgb): PNG {
  const out = PNG.sync.read(PNG.sync.write(base))
  for (let o = 0; o < out.data.length; o += 4) {
    if (!isDrawn(out, o)) continue
    const light = (out.data[o]! + out.data[o + 1]! + out.data[o + 2]!) / 3 / 255
    out.data[o] = Math.min(255, Math.round(colour.r * light * TINT_LIFT))
    out.data[o + 1] = Math.min(255, Math.round(colour.g * light * TINT_LIFT))
    out.data[o + 2] = Math.min(255, Math.round(colour.b * light * TINT_LIFT))
  }
  return out
}

/** The icon with its yellow disc (red and green high, blue low) recoloured, its shading kept. */
function iconWithDisc(base: PNG, colour: Rgb): PNG {
  const out = PNG.sync.read(PNG.sync.write(base))
  for (let o = 0; o < out.data.length; o += 4) {
    const [r, g, b] = [out.data[o]!, out.data[o + 1]!, out.data[o + 2]!]
    if (b > 40 || r < 40 || Math.abs(r - g) > 10) continue
    const light = g / 255
    out.data[o] = Math.round(colour.r * light)
    out.data[o + 1] = Math.round(colour.g * light)
    out.data[o + 2] = Math.round(colour.b * light)
  }
  return out
}

interface Pixels { w: number; h: number; at: (x: number, y: number) => [number, number, number] | null }

/** The frame's drawn pixels cut to their bounding box and shrunk (by area) to fit w x h. */
function miniature(frame: PNG, fit: { w: number; h: number }): Pixels {
  let [left, top, right, bottom] = [frame.width, frame.height, 0, 0]
  for (let y = 0; y < frame.height; y++) {
    for (let x = 0; x < frame.width; x++) {
      if (!isDrawn(frame, (y * frame.width + x) * 4)) continue
      left = Math.min(left, x)
      top = Math.min(top, y)
      right = Math.max(right, x + 1)
      bottom = Math.max(bottom, y + 1)
    }
  }
  const sw = right - left
  const sh = bottom - top
  const k = Math.min(1, fit.w / sw, fit.h / sh)
  const w = Math.max(1, Math.round(sw * k))
  const h = Math.max(1, Math.round(sh * k))
  const at = (x: number, y: number): [number, number, number] | null => {
    const [x0, x1] = [left + (x * sw) / w, left + ((x + 1) * sw) / w]
    const [y0, y1] = [top + (y * sh) / h, top + ((y + 1) * sh) / h]
    let cells = 0
    let drawn = 0
    const sum = [0, 0, 0]
    for (let sy = Math.floor(y0); sy < Math.ceil(y1); sy++) {
      for (let sx = Math.floor(x0); sx < Math.ceil(x1); sx++) {
        cells++
        const o = (sy * frame.width + sx) * 4
        if (!isDrawn(frame, o)) continue
        drawn++
        for (let c = 0; c < 3; c++) sum[c]! += frame.data[o + c]!
      }
    }
    if (drawn === 0 || drawn / cells < COVERAGE) return null
    return [Math.round(sum[0]! / drawn), Math.round(sum[1]! / drawn), Math.round(sum[2]! / drawn)]
  }
  return { w, h, at }
}

/** Paints the pixels centred on (cx, cy). */
function paint(onto: PNG, px: Pixels, cx: number, cy: number): void {
  const x0 = Math.round(cx - px.w / 2)
  const y0 = Math.round(cy - px.h / 2)
  for (let y = 0; y < px.h; y++) {
    for (let x = 0; x < px.w; x++) {
      const c = px.at(x, y)
      if (!c) continue
      const o = ((y0 + y) * onto.width + x0 + x) * 4
      onto.data[o] = c[0]
      onto.data[o + 1] = c[1]
      onto.data[o + 2] = c[2]
      onto.data[o + 3] = 255
    }
  }
}

// ---- the writing font ----

/** Glyph rows: 10 from the cap line to the baseline, then 2 descender rows. */
const GLYPH_ROWS = 12
/** The writings' fill, row by row from the cap line (green channel; red 255, blue 0), and the descender's. */
const ROW_GREEN = [66, 90, 115, 140, 165, 189, 214, 239, 206, 173, 90, 41]
const SPACE_PX = 4
const x7 = (rows: string[]): string[] => ['', '', '', ...rows] // lower case: x-height 7 from row 3

/** '#' = fill; each glyph's rows are padded to its widest row. Shapes after the original writings. */
const GLYPHS: Record<string, string[]> = {
  A: ['.####.', '##..##', '##..##', '##..##', '##..##', '######', '##..##', '##..##', '##..##', '##..##'],
  B: ['#####.', '##..##', '##..##', '##..##', '#####.', '##..##', '##..##', '##..##', '##..##', '#####.'],
  F: ['######', '##....', '##....', '##....', '#####.', '##....', '##....', '##....', '##....', '##....'],
  L: ['##....', '##....', '##....', '##....', '##....', '##....', '##....', '##....', '##....', '######'],
  N: ['##...##', '###..##', '###..##', '##.#.##', '##.#.##', '##.#.##', '##..###', '##..###', '##...##', '##...##'],
  P: ['#####.', '##..##', '##..##', '##..##', '#####.', '##....', '##....', '##....', '##....', '##....'],
  R: ['#####.', '##..##', '##..##', '##..##', '#####.', '##.##.', '##..##', '##..##', '##..##', '##..##'],
  S: ['.####.', '##..##', '##....', '##....', '.####.', '....##', '....##', '....##', '##..##', '.####.'],
  T: ['######', '..##..', '..##..', '..##..', '..##..', '..##..', '..##..', '..##..', '..##..', '..##..'],
  V: ['##....##', '##....##', '##....##', '##....##', '##....##', '##....##', '.##..##.', '.##..##.', '..####..', '...##...'],
  a: x7(['.####.', '....##', '.#####', '##..##', '##..##', '##..##', '.#####']),
  b: ['##....', '##....', '##....', '#####.', '##..##', '##..##', '##..##', '##..##', '##..##', '#####.'],
  d: ['....##', '....##', '....##', '.#####', '##..##', '##..##', '##..##', '##..##', '##..##', '.#####'],
  e: x7(['.####.', '##..##', '##..##', '######', '##....', '##..##', '.####.']),
  h: ['##....', '##....', '##....', '#####.', '##..##', '##..##', '##..##', '##..##', '##..##', '##..##'],
  i: ['', '##', '', '##', '##', '##', '##', '##', '##', '##'],
  k: ['##....', '##....', '##....', '##..##', '##.##.', '####..', '###...', '####..', '##.##.', '##..##'],
  l: ['##', '##', '##', '##', '##', '##', '##', '##', '##', '##'],
  m: x7(['#########.', '##..##..##', '##..##..##', '##..##..##', '##..##..##', '##..##..##', '##..##..##']),
  n: x7(['#####.', '##..##', '##..##', '##..##', '##..##', '##..##', '##..##']),
  o: x7(['.####.', '##..##', '##..##', '##..##', '##..##', '##..##', '.####.']),
  p: x7(['#####.', '##..##', '##..##', '##..##', '##..##', '##..##', '#####.', '##....', '##....']),
  r: x7(['##.###', '####..', '##....', '##....', '##....', '##....', '##....']),
  s: x7(['.#####', '##....', '##....', '.####.', '....##', '....##', '#####.']),
  t: ['', '##..', '##..', '####', '##..', '##..', '##..', '##..', '##..', '.###'],
  u: x7(['##..##', '##..##', '##..##', '##..##', '##..##', '##..##', '.#####']),
  v: x7(['##..##', '##..##', '##..##', '##..##', '##..##', '.####.', '..##..']),
  w: x7(['##..##..##', '##..##..##', '##..##..##', '##..##..##', '##..##..##', '##..##..##', '.########.']),
  y: x7(['##..##', '##..##', '##..##', '##..##', '##..##', '##..##', '.#####', '....##', '.####.']),
}

/** The name in the writings' style: fill rows coloured by height, a 1 px black outline, one outline column between letters. */
export function writing(text: string): PNG {
  const fill: { x: number; y: number }[] = []
  let x = 1
  for (const ch of text) {
    if (ch === ' ') {
      x += SPACE_PX
      continue
    }
    const glyph = GLYPHS[ch]
    if (!glyph) throw new Error(`volley writing "${text}": no glyph for "${ch}"`)
    const width = Math.max(...glyph.map((r) => r.length))
    glyph.forEach((row, y) => [...row].forEach((c, dx) => { if (c === '#') fill.push({ x: x + dx, y: y + 1 }) }))
    x += width + 1
  }
  const png = new PNG({ width: x, height: GLYPH_ROWS + 2 })
  const set = (px: number, py: number, rgb: [number, number, number]): void => {
    const o = (py * png.width + px) * 4
    png.data.set([...rgb, 255], o)
  }
  for (const p of fill) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) set(p.x + dx, p.y + dy, [0, 0, 0])
  for (const p of fill) set(p.x, p.y, [255, ROW_GREEN[Math.min(p.y - 1, GLYPH_ROWS - 1)]!, 0])
  return png
}

/**
 * Writes each volley scroll's stand and writing strips (sprites/<key>/) and its weapon selector icon
 * (hud/weapon-selector/<key>_ws.png) under `assets`; returns the files written.
 */
export function writeVolleyScrollArt(assets: string): string[] {
  const base = PNG.sync.read(readFileSync(join(assets, BASE_SCROLL)))
  const icon = PNG.sync.read(readFileSync(join(assets, BASE_ICON)))
  const written: string[] = []
  for (const art of VOLLEY_SCROLL_ART) {
    const frameFile = join(assets, 'sprites', art.projectile, `anm_${art.projectile}_fly_${flyDelay(assets, art.projectile)}_01.png`)
    if (!existsSync(frameFile)) throw new Error(`volley ${art.key}: no fly frame ${frameFile}`)
    const frame = PNG.sync.read(readFileSync(frameFile))
    const scroll = tinted(base, art.colour)
    paint(scroll, miniature(frame, SCROLL_FACE), SCROLL_FACE.cx, SCROLL_FACE.cy)
    const ws = iconWithDisc(icon, art.colour)
    paint(ws, miniature(frame, ICON_DISC), ICON_DISC.cx, ICON_DISC.cy)
    const files: [string, PNG][] = [
      [join(assets, 'sprites', art.key, `anm_${art.key}_stand_1_01.png`), scroll],
      [join(assets, 'sprites', art.key, `anm_${art.key}_writing_1_01.png`), writing(art.name)],
      [join(assets, 'hud', 'weapon-selector', `${art.key}_ws.png`), ws],
    ]
    for (const [file, png] of files) {
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, PNG.sync.write(png))
      written.push(file)
    }
  }
  return written
}

/** The delay part of the projectile's first fly frame name (anm_<p>_fly_<delay>_01.png). */
function flyDelay(assets: string, projectile: string): string {
  const regs = readFileSync(join(assets, 'sprites', projectile, 'regpoints.tsv'), 'utf8')
  const m = new RegExp(`anm_${projectile}_fly_(\\d+)_01`).exec(regs)
  if (!m) throw new Error(`volley art: ${projectile} has no fly strip`)
  return m[1]!
}
