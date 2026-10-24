// Owner rule: the random floors use the sharp, full-resolution obstacle tiles, not the low-resolution
// variants the tilesets carry for magic-drained areas (2x-upscaled art, e.g. merlinOpenActive 112 and
// 113 beside the sharp boulder 111). A low-res tile shows as pixels matching in 2x2 blocks aligned
// to the tile's corner far more often than in blocks offset by a pixel.
import { readFileSync } from 'node:fs'
import { PNG } from 'pngjs'
import { describe, expect, it } from 'vitest'
import { ROGUELITE_THEMES, THEMES, type FloorTheme } from './themes'

const TILE = 32
/** A tile is low-res when aligned 2x2 blocks match this much more often than offset ones. */
const LOW_RES_MARGIN = 0.15

function lowResTiles(tileSet: string): Set<number> {
  const png = PNG.sync.read(readFileSync(`public/generated/tilesets/${tileSet}.png`))
  const perRow = Math.floor(png.width / TILE)
  const rows = Math.floor(png.height / TILE)
  const at = (x: number, y: number) => png.data.readUInt32BE((y * png.width + x) * 4)
  const blockShare = (x0: number, y0: number, ox: number, oy: number) => {
    let same = 0
    let drawn = 0
    for (let y = oy; y < TILE - 1; y += 2) {
      for (let x = ox; x < TILE - 1; x += 2) {
        const c = [at(x0 + x, y0 + y), at(x0 + x + 1, y0 + y), at(x0 + x, y0 + y + 1), at(x0 + x + 1, y0 + y + 1)]
        if (c.every((v) => (v & 0xff) === 0)) continue
        drawn++
        if (c.every((v) => v === c[0])) same++
      }
    }
    return drawn ? same / drawn : 0
  }
  const out = new Set<number>()
  for (let i = 1; i <= perRow * rows; i++) {
    const x0 = ((i - 1) % perRow) * TILE
    const y0 = Math.floor((i - 1) / perRow) * TILE
    const [aligned, ...offset] = [[0, 0], [0, 1], [1, 0], [1, 1]].map(([ox, oy]) => blockShare(x0, y0, ox!, oy!))
    if (aligned! - Math.max(...offset) > LOW_RES_MARGIN) out.add(i)
  }
  return out
}

/** Every obstacle and decoration tile a theme places on its active layer. */
function activeTiles(theme: FloorTheme): number[] {
  const values = (list: readonly { value: number }[]) => list.map((t) => t.value)
  const autotile = theme.wallAutotile ? JSON.stringify(theme.wallAutotile).match(/\d+/g)?.map(Number) ?? [] : []
  return [...values(theme.wall), ...values(theme.longWall), ...theme.materials.flatMap((m) => values(m.tiles)),
    ...values(theme.stumps), ...values(theme.decorations), ...autotile]
}

describe('random floors use sharp tiles', () => {
  it.each([...THEMES, ...ROGUELITE_THEMES].map((t) => [t.name, t] as const))('%s places no low-resolution obstacle tile', (_name, theme) => {
    const low = lowResTiles(theme.tileSets.backgroundActive)
    expect(activeTiles(theme).filter((i) => low.has(i))).toEqual([])
  })
})
