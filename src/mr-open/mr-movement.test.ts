import { describe, expect, it } from 'vitest'
import { MOVE_SPEED_LIMIT, PLAYER_WALK_ACCELERATION, stepVelocity } from './mr-movement'

describe('stepVelocity', () => {
  it('approaches a steady state equal to the acceleration', () => {
    let v = { x: 0, y: 0 }
    const seen: number[] = []
    for (let i = 0; i < 6; i++) {
      v = stepVelocity(v, { x: 1, y: 0 }, PLAYER_WALK_ACCELERATION)
      seen.push(v.x)
    }
    expect(seen.map((n) => Number(n.toFixed(5)))).toEqual([1, 1.5, 1.75, 1.875, 1.9375, 1.96875])
  })

  it('halves speed each tick when no key is held', () => {
    let v = { x: 2, y: 0 }
    v = stepVelocity(v, { x: 0, y: 0 }, PLAYER_WALK_ACCELERATION)
    expect(v.x).toBe(1)
    v = stepVelocity(v, { x: 0, y: 0 }, PLAYER_WALK_ACCELERATION)
    expect(v.x).toBe(0.5)
  })

  it('does not normalise diagonals', () => {
    let v = { x: 0, y: 0 }
    for (let i = 0; i < 40; i++) v = stepVelocity(v, { x: 1, y: 1 }, PLAYER_WALK_ACCELERATION)
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(2 * Math.SQRT2, 3)
  })

  it('clamps to the per-tick speed limit', () => {
    const v = stepVelocity({ x: 100, y: -100 }, { x: 0, y: 0 }, 0)
    expect(v).toEqual({ x: MOVE_SPEED_LIMIT, y: -MOVE_SPEED_LIMIT })
  })

  it('friction moves toward zero without overshooting', () => {
    const v = stepVelocity({ x: -0.5, y: 0 }, { x: 0, y: 0 }, 0)
    expect(v.x).toBe(-0.25)
  })
})
