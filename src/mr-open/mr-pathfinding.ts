// Port of modPathFinding (findPathToLoc, updateStallCount, #beeline/#scenic), modMoveToLoc
// (moveTowardsLocSpeed, arrival distance) and the general functions PointFrameMove / PointRoughly.
import type { Vec } from './mr-geometry'
import { roughly, type Rng } from '../sim/rng'

/**
 * modPathFinding pathFindingStallTime: stalled ticks before switching path mode. Lingo counters start
 * at 1 and finish when the count reaches the length, so the engine switches one tick earlier (4
 * stalled ticks); this port keeps the simpler N-tick model deliberately.
 */
export const PATH_STALL_TICKS = 5
/** modPathFinding pathFindingDistance: scenic waypoint slack per axis. */
export const PATH_WANDER_DISTANCE = 100
/** modMoveToLoc pMoveToLocArrivalDistance. */
export const ARRIVAL_DISTANCE = 5

/** PointFrameMove: vector of length `speed` toward `to`, never overshooting. */
export function frameMove(from: Vec, to: Vec, speed: number): Vec {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const d = Math.hypot(dx, dy)
  if (d === 0) return { x: 0, y: 0 }
  const k = Math.min(1, speed / d)
  return { x: dx * k, y: dy * k }
}

/** modMoveToLoc arrival test: GeomDistSqr <= 5*5. */
export function arrived(from: Vec, to: Vec): boolean {
  return (to.x - from.x) ** 2 + (to.y - from.y) ** 2 <= ARRIVAL_DISTANCE ** 2
}

export interface PathState {
  pathMode: 'beeline' | 'scenic'
  waypoint: Vec | null
  pathStall: number
}

export const BEELINE: PathState = { pathMode: 'beeline', waypoint: null, pathStall: 0 }

/**
 * One tick of findPathToLoc + modMoveToLoc.update. Returns the velocity to set (it overwrites the
 * walker's velocity; friction does not apply to walking) and the new path state.
 * `movedLastTick` is whether the previous tick's actual displacement was non-zero: a move blocked by
 * tiles yields moveVect (0,0), which is what stalls the path and triggers scenic wandering.
 * Returning to beeline on arriving at the scenic waypoint is a simplification: the engine only leaves
 * #scenic on a stall (a walker standing on its waypoint stalls and switches back a few ticks later).
 */
export function pathStep(
  p: PathState,
  pos: Vec,
  goal: Vec,
  walkSpeed: number,
  movedLastTick: boolean,
  rng: Rng,
): { vel: Vec; path: PathState; rng: Rng } {
  let path: PathState = { ...p, pathStall: movedLastTick ? 0 : p.pathStall + 1 }
  if (path.pathMode === 'beeline' && path.pathStall >= PATH_STALL_TICKS) {
    // PointRoughly(myLoc, pathFindingDistance)
    const [rx, r1] = roughly(rng, PATH_WANDER_DISTANCE)
    const [ry, r2] = roughly(r1, PATH_WANDER_DISTANCE)
    path = { pathMode: 'scenic', waypoint: { x: pos.x + rx, y: pos.y + ry }, pathStall: 0 }
    rng = r2
  }
  if (path.pathMode === 'scenic') {
    const wp = path.waypoint ?? pos
    if (arrived(pos, wp) || path.pathStall >= PATH_STALL_TICKS) path = { ...BEELINE }
    else return { vel: frameMove(pos, wp, walkSpeed), path, rng }
  }
  return { vel: arrived(pos, goal) ? { x: 0, y: 0 } : frameMove(pos, goal, walkSpeed), path, rng }
}
