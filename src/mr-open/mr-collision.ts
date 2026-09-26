// Port of objCollisionMap.checkCollisions / selectTilesFromCollisionRect and
// objCollisionTile (edge locations, mergeEdges, calcOverlapEdges, calcOverlapCorners).
import { TILE_PX as TILE, type Rect, type Vec } from './mr-geometry'

/** A collision rect is relative to the object's registration point (modCollisionRect); see `rectAt`. */
export type CollisionRect = Rect
/** rect(-16,-16,16,16).inflate(-1,-1) for a 32x32 sprite with a centred reg point (modCollisionRect) */
export const PLAYER_COLLISION_RECT: CollisionRect = { left: -15, top: -15, right: 15, bottom: 15 }

export type SolidAt = (tx: number, ty: number) => boolean

/** collisionRect + rect(loc, loc) */
export function rectAt(loc: Vec, r: CollisionRect): CollisionRect {
  return { left: loc.x + r.left, top: loc.y + r.top, right: loc.x + r.right, bottom: loc.y + r.bottom }
}

/** 1-based tile containing a world pixel coordinate (objCollisionMap magic rect, minus the border offset) */
export function tileOfPx(px: number): number {
  return Math.floor(px / TILE) + 1
}

export function resolveTileCollision(solidAt: SolidAt, newLoc: Vec, dir: Vec, cr: CollisionRect): Vec {
  if (dir.x === 0 && dir.y === 0) return newLoc
  let loc = { ...newLoc }
  const r0 = rectAt(loc, cr)
  // selectTilesFromCollisionRect visits the corners in the order TL, TR, BR, BL
  // (point(left,top), point(right,top), point(right,bottom), point(left,bottom)).
  const corners = [
    [tileOfPx(r0.left), tileOfPx(r0.top)],
    [tileOfPx(r0.right), tileOfPx(r0.top)],
    [tileOfPx(r0.right), tileOfPx(r0.bottom)],
    [tileOfPx(r0.left), tileOfPx(r0.bottom)],
  ]
  const seen = new Set<string>()
  for (const [tx, ty] of corners) {
    const key = `${tx},${ty}`
    if (seen.has(key)) continue
    seen.add(key)
    if (!solidAt(tx!, ty!)) continue
    const rect = rectAt(loc, cr)
    const o = overlapForTile(solidAt, tx!, ty!, rect, dir)
    if (o.x === null && o.y === null) continue
    if (o.corner) {
      loc = { x: loc.x - (o.x ?? 0), y: loc.y - (o.y ?? 0) }
    } else if (o.x !== null && o.y !== null) {
      if (Math.abs(o.x) > Math.abs(o.y)) loc = { ...loc, y: loc.y - o.y }
      else loc = { ...loc, x: loc.x - o.x }
    } else if (o.x !== null) {
      loc = { ...loc, x: loc.x - o.x }
    } else if (o.y !== null) {
      loc = { ...loc, y: loc.y - o.y }
    }
  }
  return loc
}

interface Overlap { x: number | null; y: number | null; corner: boolean }

/** Edge pixel locations of tile (tx,ty): objCollisionTile.initCollisionEdges */
function edges(tx: number, ty: number) {
  return { left: (tx - 1) * TILE - 1, right: tx * TILE, top: (ty - 1) * TILE - 1, bottom: ty * TILE }
}

function overlapForTile(solidAt: SolidAt, tx: number, ty: number, rect: CollisionRect, dir: Vec): Overlap {
  const e = edges(tx, ty)
  // mergeEdges: an edge is exposed only if the neighbour across it is not solid
  const exposed = {
    left: !solidAt(tx - 1, ty),
    right: !solidAt(tx + 1, ty),
    top: !solidAt(tx, ty - 1),
    bottom: !solidAt(tx, ty + 1),
  }
  const o: Overlap = { x: null, y: null, corner: false }
  // calcOverlapEdges: only edges facing the movement
  if (dir.x > 0 && exposed.left) o.x = rect.right - e.left
  if (dir.x < 0 && exposed.right) o.x = rect.left - e.right
  if (dir.y > 0 && exposed.top) o.y = rect.bottom - e.top
  if (dir.y < 0 && exposed.bottom) o.y = rect.top - e.bottom
  if (o.x !== null || o.y !== null) return o
  // calcOverlapCorners: diagonal approach with no facing edge hit. The tile must be a "solid
  // corner" (identifyAsCornerTile / calcSolidCorner): both facing neighbours are solid (their
  // edges were merged away above) AND the diagonal neighbour the mover comes from is not solid,
  // i.e. the vertical neighbour's side edge and the side neighbour's vertical edge are both
  // still solid. A tile inside a solid block therefore never corner-pushes.
  if (dir.x !== 0 && dir.y !== 0 && !solidAt(tx - dir.x, ty - dir.y)) {
    const cornerTop = dir.y > 0 ? e.top : e.bottom
    const cornerSide = dir.x > 0 ? e.left : e.right
    o.y = dir.y > 0 ? rect.bottom - cornerTop : rect.top - cornerTop
    o.x = dir.x > 0 ? rect.right - cornerSide : rect.left - cornerSide
    o.corner = true
  }
  return o
}
