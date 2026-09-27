// Port of objCollisionMap.checkCollisions / selectTilesFromCollisionRect and
// objCollisionTile (edge locations, mergeEdges, calcOverlapEdges, calcOverlapCorners).
import { TILE_PX as TILE, type Rect, type Vec } from './mr-geometry'

/** A collision rect is relative to the object's registration point (modCollisionRect); see `rectAt`. */
export type CollisionRect = Rect
/**
 * Port of modCollisionRect.initRectFromCurrentImage:
 * rect(-regX, -regY, width - regX, height - regY), clamped to rect(-16,-16,16,16), then inflate(-1,-1).
 * The reg point defaults to the frame centre.
 */
export function collisionRectForFrame(width: number, height: number, regX = width / 2, regY = height / 2): CollisionRect {
  const max = 16
  return {
    left: Math.max(-max, -regX) + 1,
    top: Math.max(-max, -regY) + 1,
    right: Math.min(max, width - regX) - 1,
    bottom: Math.min(max, height - regY) - 1,
  }
}

/** Merlin's frames are 16x16 drawn at native size, so the box is rect(-7,-7,7,7) around the reg point. */
export const PLAYER_COLLISION_RECT: CollisionRect = collisionRectForFrame(16, 16)

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
  return resolveTileCollisionHits(solidAt, newLoc, dir, cr).loc
}

/**
 * Which objGameObject callbacks a push fires: a push on the x axis, including a corner push
 * (axisToChange = #both takes the non-vertical branch), calls collisionWallLeft/Right; a push on
 * the y axis alone calls collisionCeiling (pushed down) or collisionPlatform (pushed up).
 */
export interface TileCollision { loc: Vec; wallX: boolean; wallY: boolean }

export function resolveTileCollisionHits(solidAt: SolidAt, newLoc: Vec, dir: Vec, cr: CollisionRect): TileCollision {
  const hits: TileCollision = { loc: { ...newLoc }, wallX: false, wallY: false }
  if (dir.x === 0 && dir.y === 0) return hits
  let loc = hits.loc
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
    let axis: 'x' | 'y' | 'both'
    if (o.corner) axis = 'both'
    else if (o.x !== null && o.y !== null) axis = Math.abs(o.x) > Math.abs(o.y) ? 'y' : 'x'
    else axis = o.x !== null ? 'x' : 'y'
    if (axis === 'both') loc = { x: loc.x - (o.x ?? 0), y: loc.y - (o.y ?? 0) }
    else if (axis === 'x') loc = { ...loc, x: loc.x - o.x! }
    else loc = { ...loc, y: loc.y - o.y! }
    if (axis === 'y') hits.wallY = true
    else hits.wallX = true
  }
  hits.loc = loc
  return hits
}

/**
 * Remake addition: the longest sub-step (px per axis) of a swept move. checkCollisions only tests
 * the tiles under the rect's corners at the destination, so a move longer than the rect plus a
 * tile (a stacked knockback can exceed 46 px for Merlin's 14 px box) skips a 1-tile wall. Sub-steps
 * of at most half the rect's smaller side keep every step's overlap shallow enough for the
 * push-out to pick the right side; 8 px also caps it for large rects. Walking speeds fit in one step.
 */
export const MAX_COLLISION_SUBSTEP_PX = 8

/**
 * Remake addition (in the spirit of Super Mario 64's quarter steps): moves from `from` by `vel` in
 * equal sub-steps, each resolved by resolveTileCollisionHits, so a fast mover stops at (and slides
 * along) walls it would otherwise jump over. An axis stops moving once pushed out; the hit flags
 * are those of any sub-step. With one sub-step this is exactly the destination-only test.
 */
export function sweepTileCollision(solidAt: SolidAt, from: Vec, vel: Vec, cr: CollisionRect): TileCollision {
  const maxStep = Math.max(1, Math.min(MAX_COLLISION_SUBSTEP_PX, (cr.right - cr.left) / 2, (cr.bottom - cr.top) / 2))
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(vel.x), Math.abs(vel.y)) / maxStep))
  const hits: TileCollision = { loc: { ...from }, wallX: false, wallY: false }
  // each sub-step aims at base + vel * i/steps, so an unobstructed move ends exactly at from + vel
  let base = { ...from }
  let v = { ...vel }
  for (let i = 1; i <= steps; i++) {
    const f = i / steps
    const target = { x: base.x + (i === steps ? v.x : v.x * f), y: base.y + (i === steps ? v.y : v.y * f) }
    const hit = resolveTileCollisionHits(solidAt, target, { x: Math.sign(v.x), y: Math.sign(v.y) }, cr)
    hits.loc = hit.loc
    // a push-out moves the line the remaining sub-steps follow; a blocked axis stays put
    base = { x: base.x + (hit.loc.x - target.x), y: base.y + (hit.loc.y - target.y) }
    if (hit.wallX) {
      hits.wallX = true
      base = { ...base, x: hit.loc.x }
      v = { ...v, x: 0 }
    }
    if (hit.wallY) {
      hits.wallY = true
      base = { ...base, y: hit.loc.y }
      v = { ...v, y: 0 }
    }
  }
  return hits
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
