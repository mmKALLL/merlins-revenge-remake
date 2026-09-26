import { describe, expect, it } from 'vitest'
import { PLAYER_COLLISION_RECT, resolveTileCollision } from './mr-collision'

// 6x4 world; S = solid
const layout = [
  '......',
  '..S...',
  '..SS..',
  '......',
]
const solidAt = (tx: number, ty: number) =>
  tx < 1 || ty < 1 || tx > 6 || ty > 4 || layout[ty - 1]![tx - 1] === 'S'

const at = (x: number, y: number) => ({ x, y })

describe('resolveTileCollision', () => {
  it('returns the location unchanged when not moving', () => {
    expect(resolveTileCollision(solidAt, at(100, 100), at(0, 0), PLAYER_COLLISION_RECT)).toEqual(at(100, 100))
  })

  it('pushes out of a wall when moving right', () => {
    // solid tile (3,2) spans x 64..96. Rect right edge = x+15. Moving right into it.
    const r = resolveTileCollision(solidAt, at(52, 48), at(1, 0), PLAYER_COLLISION_RECT)
    // left edge location is 64-1 = 63, overlap = 67-63 = 4, pushed back by 4
    expect(r).toEqual(at(48, 48))
  })

  it('slides along a wall when moving diagonally', () => {
    // moving down-right into the left face of (3,2): y is free, x pushed
    const r = resolveTileCollision(solidAt, at(52, 40), at(1, 1), PLAYER_COLLISION_RECT)
    expect(r.x).toBe(48)
    expect(r.y).toBe(40)
  })

  it('does not test edges hidden between two solid tiles', () => {
    // between (3,2) and (3,3) there is no exposed edge; moving up under (3,3) hits its bottom
    // tile (3,3) spans y 64..96, bottom edge location 96; rect top = y-15
    const r = resolveTileCollision(solidAt, at(80, 110), at(0, -1), PLAYER_COLLISION_RECT)
    expect(r.y).toBe(111) // top 95 vs bottom edge 96: overlap -1 -> pushed to 111
  })

  it('treats outside the map as solid', () => {
    const r = resolveTileCollision(solidAt, at(10, 40), at(-1, 0), PLAYER_COLLISION_RECT)
    // tile 0 right edge location = 0; rect left = -5; overlap = -5 -> pushed to 15
    expect(r.x).toBe(15)
  })
})
