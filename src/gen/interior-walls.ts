// Interior wall styles for the random floor's rooms, one small strategy per theme look
// (docs/plans/2026-09-28-random-floor-design.md): tree lines cutting a room into L and T shapes,
// baffles from alternating sides (S shapes), and recursive division into chambers (mazes).
// Each only builds where `canBuild` allows (open, not reserved for an opening); the room's flood
// fill and retries in room-shape.ts keep the openings connected.
import type { Vec } from '../mr-open/mr-geometry'
import type { Edge } from '../mr-open/mr-screen-exits'
import { Cell, type Grid } from './grid'
import type { GenRandom } from './random'
import type { RoomEdges } from './room-shape'
import type { BaffleTuning, CutTuning, DivisionTuning } from './themes'

export type CanBuild = (x: number, y: number) => boolean

const EDGES: readonly Edge[] = ['left', 'top', 'right', 'bottom']
/** Inward direction from each edge. */
const INWARD: Record<Edge, Vec> = { left: { x: 1, y: 0 }, right: { x: -1, y: 0 }, top: { x: 0, y: 1 }, bottom: { x: 0, y: -1 } }
/** Cuts start and turn this many tiles clear of the room's corners and far edge. */
const CUT_MARGIN = 2

const rangeInt = (rng: GenRandom, [lo, hi]: readonly [number, number]): number => rng.int(lo, hi)
const rangeReal = (rng: GenRandom, [lo, hi]: readonly [number, number]): number => lo + rng.next() * (hi - lo)

function build(g: Grid, canBuild: CanBuild, p: Vec): void {
  if (g.inside(p.x, p.y) && canBuild(p.x, p.y)) g.set(p.x, p.y, Cell.LongWall)
}

// ---- cuts (Undead Marsh) ----

/** Tree lines from an edge across the room, some turning once, most with a gap. */
export function addCuts(rng: GenRandom, g: Grid, t: CutTuning, canBuild: CanBuild): void {
  if (!rng.chance(t.chance)) return
  addCut(rng, g, t, canBuild)
  if (rng.chance(t.extraChance)) addCut(rng, g, t, canBuild)
}

function addCut(rng: GenRandom, g: Grid, t: CutTuning, canBuild: CanBuild): void {
  const path = cutPath(rng, g.size, rng.pick(EDGES), t)
  const width = rangeInt(rng, t.gapWidth)
  const gapFrom = rng.chance(t.gapChance) && path.length > width + 2 * CUT_MARGIN
    ? rng.int(CUT_MARGIN, path.length - CUT_MARGIN - width)
    : -1
  path.forEach((p, i) => {
    if (gapFrom >= 0 && i >= gapFrom && i < gapFrom + width) return
    build(g, canBuild, p)
  })
}

/** A 4-connected line from `edge` inward until it leaves the room, with sideways wobbles and at most one turn. */
function cutPath(rng: GenRandom, size: Vec, edge: Edge, t: CutTuning): Vec[] {
  let dir = INWARD[edge]
  const alongEdge = dir.x !== 0 ? size.y : size.x
  const across = dir.x !== 0 ? size.x : size.y
  const start = rng.int(CUT_MARGIN, alongEdge - 1 - CUT_MARGIN)
  let p: Vec = {
    x: edge === 'left' ? 0 : edge === 'right' ? size.x - 1 : start,
    y: edge === 'top' ? 0 : edge === 'bottom' ? size.y - 1 : start,
  }
  const turnAt = rng.chance(t.turnChance) ? rng.int(CUT_MARGIN, across - 1 - CUT_MARGIN) : -1
  const inside = (v: Vec) => v.x >= 0 && v.y >= 0 && v.x < size.x && v.y < size.y
  const awayFromSides = (v: Vec) => v.x >= 1 && v.y >= 1 && v.x < size.x - 1 && v.y < size.y - 1
  const out: Vec[] = []
  for (let step = 0; inside(p); step++) {
    out.push(p)
    if (step === turnAt) {
      const side = rng.chance(0.5) ? 1 : -1
      dir = { x: dir.y * side, y: dir.x * side }
    } else if (step > 0 && rng.chance(t.wobbleChance)) {
      const side = rng.chance(0.5) ? 1 : -1
      const shifted = { x: p.x + dir.y * side, y: p.y + dir.x * side }
      if (awayFromSides(shifted)) {
        out.push(shifted)
        p = shifted
      }
    }
    p = { x: p.x + dir.x, y: p.y + dir.y }
  }
  return out
}

// ---- baffles (Dragon Canyon) ----

/** Parallel walls from alternating sides, so the way through zigzags (S-shaped rooms). */
export function addBaffles(rng: GenRandom, g: Grid, t: BaffleTuning, canBuild: CanBuild): void {
  if (!rng.chance(t.chance)) return
  const vertical = rng.chance(t.verticalChance)
  const spacingAxis = vertical ? g.size.x : g.size.y
  const wallAxis = vertical ? g.size.y : g.size.x
  const count = rangeInt(rng, t.count)
  let fromStart = rng.chance(0.5)
  for (let i = 0; i < count; i++) {
    const at = Math.round((spacingAxis * (i + 1)) / (count + 1)) + rng.int(-1, 1)
    const length = Math.round(wallAxis * rangeReal(rng, t.reach))
    const thickness = rangeInt(rng, t.thickness)
    for (let k = 0; k < thickness; k++) {
      for (let d = 0; d < length; d++) {
        const along = fromStart ? d : wallAxis - 1 - d
        build(g, canBuild, vertical ? { x: at + k, y: along } : { x: along, y: at + k })
      }
    }
    fromStart = !fromStart
  }
}

// ---- recursive division (Magic Maze) ----

interface Region { x0: number; y0: number; x1: number; y1: number }

/** Splits the room into chambers by walls with one door each, recursively (narrow corridors). */
export function divideIntoChambers(rng: GenRandom, g: Grid, edges: RoomEdges, t: DivisionTuning, canBuild: CanBuild): void {
  // walled edges already bound the room; open edges let the walls run to the room's edge
  const region = {
    x0: edges.left ? 0 : 1,
    y0: edges.top ? 0 : 1,
    x1: g.size.x - (edges.right ? 1 : 2),
    y1: g.size.y - (edges.bottom ? 1 : 2),
  }
  divide(rng, g, t, canBuild, region, true)
}

function divide(rng: GenRandom, g: Grid, t: DivisionTuning, canBuild: CanBuild, r: Region, first: boolean): void {
  const w = r.x1 - r.x0 + 1
  const h = r.y1 - r.y0 + 1
  const splitsX = w >= 2 * t.minChamber + 1
  const splitsY = h >= 2 * t.minChamber + 1
  if (!splitsX && !splitsY) return
  if (!first && rng.chance(t.stopChance)) return
  const vertical = splitsX && (!splitsY || rng.chance(w / (w + h)))
  const [lo, hi] = vertical ? [r.y0, r.y1] : [r.x0, r.x1]
  const doorWidth = Math.min(rangeInt(rng, t.doorWidth), hi - lo + 1)
  const door = rng.int(lo, hi - doorWidth + 1)
  const isDoor = (v: number) => v >= door && v < door + doorWidth
  if (vertical) {
    const x = rng.int(r.x0 + t.minChamber, r.x1 - t.minChamber)
    for (let y = r.y0; y <= r.y1; y++) if (!isDoor(y)) build(g, canBuild, { x, y })
    divide(rng, g, t, canBuild, { ...r, x1: x - 1 }, false)
    divide(rng, g, t, canBuild, { ...r, x0: x + 1 }, false)
  } else {
    const y = rng.int(r.y0 + t.minChamber, r.y1 - t.minChamber)
    for (let x = r.x0; x <= r.x1; x++) if (!isDoor(x)) build(g, canBuild, { x, y })
    divide(rng, g, t, canBuild, { ...r, y1: y - 1 }, false)
    divide(rng, g, t, canBuild, { ...r, y0: y + 1 }, false)
  }
}
