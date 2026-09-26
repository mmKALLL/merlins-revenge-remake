// Port of modPathFinding (findPathToLoc, updateStallCount, #beeline/#scenic), modMoveToLoc
// (moveTowardsLocSpeed, arrival distance) and the general functions PointFrameMove / PointRoughly.
import type { Vec } from './mr-geometry'
import { roughly, type Rng } from '../sim/rng'

/**
 * modPathFinding pathFindingStallTime default (ActorDef.pathFindingStallTime): stalled ticks before switching path mode. Lingo counters start
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
 * walker's velocity; objMoveXY friction then halves it before the move, see tick.ts stepMovement) and the new path state.
 * `movedLastTick` is whether the previous tick's actual displacement was non-zero (pMoveXY
 * getMoveVect): a move blocked by tiles, or standing on the goal or waypoint, yields (0,0), which is
 * what stalls the path. As in updateBeeline / updateScenic, the walker heads for the current mode's
 * goal this tick and a stall switches the mode for the next one. #scenic is only left on a stall, so
 * a walker that reaches its waypoint stands there until the stall count runs out.
 */
export function pathStep(
  p: PathState,
  pos: Vec,
  goal: Vec,
  walkSpeed: number,
  movedLastTick: boolean,
  rng: Rng,
  stallTicks: number = PATH_STALL_TICKS,
): { vel: Vec; path: PathState; rng: Rng } {
  const pathStall = movedLastTick ? 0 : p.pathStall + 1
  const stalled = pathStall >= stallTicks
  if (p.pathMode === 'scenic') {
    const wp = p.waypoint ?? pos
    const vel = frameMove(pos, wp, walkSpeed)
    return { vel, path: stalled ? { ...BEELINE } : { ...p, pathStall }, rng }
  }
  const vel = arrived(pos, goal) ? { x: 0, y: 0 } : frameMove(pos, goal, walkSpeed)
  if (!stalled) return { vel, path: { ...p, pathStall }, rng }
  // goPathFindingMode(#scenic): PointRoughly(myLoc, pathFindingDistance)
  const [rx, r1] = roughly(rng, PATH_WANDER_DISTANCE)
  const [ry, r2] = roughly(r1, PATH_WANDER_DISTANCE)
  return { vel, path: { pathMode: 'scenic', waypoint: { x: pos.x + rx, y: pos.y + ry }, pathStall: 0 }, rng: r2 }
}
