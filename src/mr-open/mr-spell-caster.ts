// Port of objAiCPUSpellCaster.updateMoveToOptimumPosition (objAiCPUSpellCaster.txt:246-297) with
// runTangentToObjects / runToFromObjects / runTowardsObject, GeomTangentPoint, GeomMirrorPoint and
// teamMaster.findNearest (the two nearest objects of a role in the hated teams, from the unit/bullet
// map's nearest non-empty shell within 3 tiles). Spells are not limited by range, so while charging
// and casting the caster keeps moving: away from hostile bullets and spells, away from enemies that
// come too close, towards its target while it is far, else it stands.
// Engine notes: docs/notes/engine-mechanics-enemies-2.md §2a.
import { TILE_PX, type Vec } from './mr-geometry'
import { randomInt, type Rng } from '../sim/rng'

/** attack.reach of a range-unlimited spell; only then does the movement layer run. */
export const UNLIMITED_REACH = 9999
/** pBulletSafeDistance: hostile bullets closer than this are dodged. */
export const BULLET_SAFE_DISTANCE = 100
/** pEnemySafeDistance: enemies closer than this are run from. */
export const ENEMY_SAFE_DISTANCE = 100
/** An enemy whose attack reaches further than the safe distance is kept this far beyond its reach. */
const ENEMY_REACH_MARGIN = 25
/** pBufferDistance: the caster closes in until within the safe distance plus about this much. */
export const BUFFER_DISTANCE = 20
/** runTangentToObjects blends toward the mirror point by 25 + random(50) percent. */
const MIRROR_BLEND_MIN = 25
const MIRROR_BLEND_SPREAD = 50
/** teamMaster.findNearest: searchObjMap(tileLoc, teams, 0, 3): shells up to 3 tiles out. */
const SEARCH_MAX_SHELL = 3
/** findNearestEnemyBullets / findNearestEnemies: this many objects. */
const NEAREST_COUNT = 2
/** GeomMirrorPoint multiplies its distance by this: the run goal lies far beyond the caster. */
const MIRROR_DISTANCE_FACTOR = 20
/** GeomTangentPoint: sidestep 2 * safeDist across, safeDist / 5 along. */
const TANGENT_ACROSS = 2
const TANGENT_ALONG = 1 / 5

export interface Nearby {
  pos: Vec
  reach?: number // enemies: their attack reach in px (a point reach counts as none)
}

const unit = (v: Vec): Vec => {
  const d = Math.hypot(v.x, v.y)
  return d === 0 ? { x: 0, y: 0 } : { x: v.x / d, y: v.y / d }
}
const lerp = (percent: number, a: Vec, b: Vec): Vec => {
  const k = Math.max(0, Math.min(100, percent)) / 100 // VarValRange clamps
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }
}
const tileOf = (p: Vec): Vec => ({ x: Math.floor(p.x / TILE_PX) + 1, y: Math.floor(p.y / TILE_PX) + 1 })

/**
 * teamMaster.findNearest: the objects in the nearest non-empty tile shell around `me` (the own
 * tile, then rings 1..3), and of those the NEAREST_COUNT closest, nearest first.
 */
export function findNearest<T extends Nearby>(me: Vec, candidates: T[]): T[] {
  const t = tileOf(me)
  const shell = (c: T): number => {
    const ct = tileOf(c.pos)
    return Math.max(Math.abs(ct.x - t.x), Math.abs(ct.y - t.y))
  }
  const inRange = candidates.filter((c) => shell(c) <= SEARCH_MAX_SHELL)
  if (inRange.length === 0) return []
  const reached = Math.max(1, Math.min(...inRange.map(shell)))
  const d = (c: T): number => Math.hypot(c.pos.x - me.x, c.pos.y - me.y)
  return inRange.filter((c) => shell(c) <= reached).sort((a, b) => d(a) - d(b)).slice(0, NEAREST_COUNT)
}

/** GeomMirrorPoint(thePoint, mirrorPoint, safeDist): 20 * safeDist from thePoint, through and past mirrorPoint. */
export function mirrorPoint(thePoint: Vec, mirror: Vec, safeDist: number): Vec {
  const u = unit({ x: thePoint.x - mirror.x, y: thePoint.y - mirror.y })
  const k = safeDist * MIRROR_DISTANCE_FACTOR
  return { x: thePoint.x - u.x * k, y: thePoint.y - u.y * k }
}

/**
 * GeomTangentPoint(thePoint, mirrorPoint, dir, safeDist): from thePoint (the bullet), 2 * safeDist
 * square to the line to mirrorPoint (the caster), on the side `dir` picks, and safeDist / 5 toward it.
 */
export function tangentPoint(thePoint: Vec, mirror: Vec, dir: number, safeDist: number): Vec {
  const [dir1, dir2] = dir > 0 ? [-1, 1] : [1, -1]
  const u = unit({ x: thePoint.x - mirror.x, y: thePoint.y - mirror.y })
  const across = safeDist * TANGENT_ACROSS
  const along = safeDist * TANGENT_ALONG
  const v = { x: u.y * across * dir1 + u.x * along, y: u.x * across * dir2 + u.y * along }
  return { x: thePoint.x - v.x, y: thePoint.y - v.y }
}

/**
 * runTangentToObjects' side choice for two bullets: the second bullet's offset from the nearest,
 * multiplied per axis by the caster-to-nearest vector (axes swapped first when that vector is
 * vertical). The engine's `dif = -1` typo leaves `dir` void in one branch, which GeomTangentPoint
 * treats like -1 (void > 0 is false); ported as -1.
 */
function tangentSide(me: Vec, nearest: Vec, second: Vec): number {
  const ref = { x: nearest.x - me.x, y: nearest.y - me.y }
  let loc = { x: second.x - nearest.x, y: second.y - nearest.y }
  if (ref.x === 0) loc = { x: loc.y, y: loc.x }
  loc = { x: loc.x * ref.x, y: loc.y * ref.y }
  if (loc.x * loc.y > 0) return loc.x - loc.y > 0 ? 1 : -1
  return loc.y > 0 ? 1 : -1
}

/** runTangentToObjects: sidestep the nearest bullet when it is within the safe distance. */
function dodgeBullets(me: Vec, bullets: Nearby[], rng: Rng): [Vec | null, Rng] {
  const [nearest, second] = bullets
  if (!nearest || Math.hypot(nearest.pos.x - me.x, nearest.pos.y - me.y) >= BULLET_SAFE_DISTANCE) return [null, rng]
  if (!second) return [tangentPoint(nearest.pos, me, 1, BULLET_SAFE_DISTANCE), rng]
  const tangent = tangentPoint(nearest.pos, me, tangentSide(me, nearest.pos, second.pos), BULLET_SAFE_DISTANCE)
  const mirror = mirrorPoint(lerp(50, nearest.pos, second.pos), me, BULLET_SAFE_DISTANCE)
  const [r, next] = randomInt(rng, MIRROR_BLEND_SPREAD)
  return [lerp(MIRROR_BLEND_MIN + r, tangent, mirror), next]
}

/**
 * runFromObjects (runToFromObjects #away): when the nearest enemy is within the safe distance
 * (its reach + 25 if that reaches further, a spell's 9999 aside), run from the two nearest enemies'
 * midpoint.
 */
function runFromEnemies(me: Vec, enemies: Nearby[]): Vec | null {
  const [nearest, second] = enemies
  if (!nearest) return null
  const reach = nearest.reach
  const safe = reach !== undefined && reach !== UNLIMITED_REACH && reach > ENEMY_SAFE_DISTANCE ? reach + ENEMY_REACH_MARGIN : ENEMY_SAFE_DISTANCE
  if (Math.hypot(nearest.pos.x - me.x, nearest.pos.y - me.y) >= safe) return null
  return mirrorPoint(lerp(50, nearest.pos, (second ?? nearest).pos), me, safe)
}

/** runTowardsObject: walk straight at the target while dist^2 - safe^2 > buffer^2. */
function closeIn(me: Vec, target: Vec | null): Vec | null {
  if (!target) return null
  const d2 = (target.x - me.x) ** 2 + (target.y - me.y) ** 2
  return d2 - ENEMY_SAFE_DISTANCE ** 2 > BUFFER_DISTANCE ** 2 ? target : null
}

/**
 * Where the caster moves this tick, first rule that applies: dodge the nearest hostile bullets, run
 * from the nearest enemies, close in on the target; null = stopMoving. `bullets` and `enemies` are
 * every hostile candidate; findNearest narrows them as the engine's map search does.
 */
export function optimumMoveGoal(me: Vec, bullets: Nearby[], enemies: Nearby[], target: Vec | null, rng: Rng): [Vec | null, Rng] {
  const [dodge, next] = dodgeBullets(me, findNearest(me, bullets), rng)
  if (dodge) return [dodge, next]
  return [runFromEnemies(me, findNearest(me, enemies)) ?? closeIn(me, target), next]
}
