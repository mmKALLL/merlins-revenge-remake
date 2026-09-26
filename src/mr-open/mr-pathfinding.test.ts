import { describe, expect, it } from 'vitest'
import { arrived, BEELINE, frameMove, PATH_STALL_TICKS, PATH_WANDER_DISTANCE, pathStep, type PathState } from './mr-pathfinding'

describe('frameMove', () => {
  it('has length equal to the walk speed', () => {
    const v = frameMove({ x: 0, y: 0 }, { x: 30, y: 40 }, 4)
    expect(v).toEqual({ x: 2.4, y: 3.2 })
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(4)
  })
  it('does not overshoot a close target', () => {
    expect(frameMove({ x: 0, y: 0 }, { x: 1, y: 0 }, 4)).toEqual({ x: 1, y: 0 })
    expect(frameMove({ x: 5, y: 5 }, { x: 5, y: 5 }, 4)).toEqual({ x: 0, y: 0 })
  })
})

describe('arrived', () => {
  it('is within 5 px inclusive', () => {
    expect(arrived({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(true)
    expect(arrived({ x: 0, y: 0 }, { x: 6, y: 0 })).toBe(false)
  })
})

describe('pathStep', () => {
  const pos = { x: 100, y: 100 }
  const goal = { x: 300, y: 100 }
  const rng = { seed: 42 }

  it('beelines at walk speed toward the goal while moving', () => {
    const r = pathStep(BEELINE, pos, goal, 4, true, rng)
    expect(r.vel).toEqual({ x: 4, y: 0 })
    expect(r.path).toEqual(BEELINE)
    expect(r.rng).toEqual(rng)
  })

  it('stops at the goal', () => {
    expect(pathStep(BEELINE, goal, goal, 4, true, rng).vel).toEqual({ x: 0, y: 0 })
  })

  it('switches to scenic with a waypoint within +/-100 after five stalled ticks', () => {
    let path: PathState = BEELINE
    let r = rng
    for (let i = 0; i < PATH_STALL_TICKS - 1; i++) {
      const s = pathStep(path, pos, goal, 4, false, r)
      expect(s.path.pathMode).toBe('beeline')
      path = s.path
      r = s.rng
    }
    const s = pathStep(path, pos, goal, 4, false, r)
    expect(s.path.pathMode).toBe('scenic')
    expect(s.path.pathStall).toBe(0)
    const wp = s.path.waypoint!
    expect(Math.abs(wp.x - pos.x)).toBeLessThanOrEqual(PATH_WANDER_DISTANCE)
    expect(Math.abs(wp.y - pos.y)).toBeLessThanOrEqual(PATH_WANDER_DISTANCE)
    expect(Math.hypot(s.vel.x, s.vel.y)).toBeCloseTo(4)
    expect(s.rng).not.toEqual(r)
  })

  it('gives a repeatable waypoint from a seeded rng', () => {
    const stalled = { ...BEELINE, pathStall: PATH_STALL_TICKS - 1 }
    const a = pathStep(stalled, pos, goal, 4, false, { seed: 42 })
    const b = pathStep(stalled, pos, goal, 4, false, { seed: 42 })
    expect(a.path.waypoint).toEqual(b.path.waypoint)
    expect(a.rng).toEqual(b.rng)
  })

  it('stands on the reached waypoint until the stall count runs out, then beelines (updateScenic leaves only on a stall)', () => {
    const wp = { x: 103, y: 100 }
    let s = pathStep({ pathMode: 'scenic', waypoint: wp, pathStall: 0 }, pos, goal, 4, true, rng)
    expect(s.vel).toEqual({ x: 3, y: 0 }) // PointFrameMove: the remaining delta
    for (let i = 0; i < PATH_STALL_TICKS - 1; i++) {
      s = pathStep(s.path, wp, goal, 4, false, rng)
      expect(s.path.pathMode).toBe('scenic')
      expect(s.vel).toEqual({ x: 0, y: 0 })
    }
    s = pathStep(s.path, wp, goal, 4, false, rng)
    expect(s.path).toEqual(BEELINE)
    expect(s.vel).toEqual({ x: 0, y: 0 }) // still heading for the waypoint on the switching tick
  })

  it('returns to beeline when stalled again on the scenic leg', () => {
    let path: PathState = { pathMode: 'scenic', waypoint: { x: 200, y: 200 }, pathStall: 0 }
    for (let i = 0; i < PATH_STALL_TICKS - 1; i++) {
      path = pathStep(path, pos, goal, 4, false, rng).path
      expect(path.pathMode).toBe('scenic')
    }
    expect(pathStep(path, pos, goal, 4, false, rng).path).toEqual(BEELINE)
  })
})
