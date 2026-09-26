import { describe, expect, it } from 'vitest'
import { collisionRectForFrame, resolveTileCollision, type CollisionRect } from './mr-collision'

// a 30x30 box (32 px frame, centred reg point); the numbers below were derived for it
const RECT30: CollisionRect = { left: -15, top: -15, right: 15, bottom: 15 }

// 6x4 world; S = solid
const layout = [
  '......',
  '..S...',
  '..SS..',
  '......',
]
const solidAt = (tx: number, ty: number) =>
  tx < 1 || ty < 1 || tx > 6 || ty > 4 || layout[ty - 1]![tx - 1] === 'S'

// 6x4 world with a solid 2x2 block at tiles (2..3, 2..3)
const blockLayout = [
  '......',
  '.SS...',
  '.SS...',
  '......',
]
const blockSolidAt = (tx: number, ty: number) =>
  tx < 1 || ty < 1 || tx > 6 || ty > 4 || blockLayout[ty - 1]![tx - 1] === 'S'

const at = (x: number, y: number) => ({ x, y })

describe('resolveTileCollision', () => {
  it('returns the location unchanged when not moving', () => {
    expect(resolveTileCollision(solidAt, at(100, 100), at(0, 0), RECT30)).toEqual(at(100, 100))
  })

  it('pushes out of a wall when moving right', () => {
    // solid tile (3,2) spans x 64..96. Rect right edge = x+15. Moving right into it.
    const r = resolveTileCollision(solidAt, at(52, 48), at(1, 0), RECT30)
    // left edge location is 64-1 = 63, overlap = 67-63 = 4, pushed back by 4
    expect(r).toEqual(at(48, 48))
  })

  it('slides along a wall when moving diagonally', () => {
    // moving down-right into the left face of (3,2): y is free, x pushed
    const r = resolveTileCollision(solidAt, at(52, 40), at(1, 1), RECT30)
    expect(r.x).toBe(48)
    expect(r.y).toBe(40)
  })

  it('does not test edges hidden between two solid tiles', () => {
    // between (3,2) and (3,3) there is no exposed edge; moving up under (3,3) hits its bottom
    // tile (3,3) spans y 64..96, bottom edge location 96; rect top = y-15
    const r = resolveTileCollision(solidAt, at(80, 110), at(0, -1), RECT30)
    expect(r.y).toBe(111) // top 95 vs bottom edge 96: overlap -1 -> pushed to 111
  })

  it('treats outside the map as solid', () => {
    const r = resolveTileCollision(solidAt, at(10, 40), at(-1, 0), RECT30)
    // tile 0 right edge location = 0; rect left = -5; overlap = -5 -> pushed to 15
    expect(r.x).toBe(15)
  })

  it('does not push when exactly touching a wall', () => {
    // tile (3,2) left edge location is 63; rect right = 48 + 15 = 63, overlap 0
    expect(resolveTileCollision(solidAt, at(48, 48), at(1, 0), RECT30)).toEqual(at(48, 48))
  })

  it('breaks an equal overlap tie by pushing x (axisToChange defaults to 1)', () => {
    // rect at (50,18): right 65 vs left edge 63 -> 2; bottom 33 vs top edge 31 -> 2
    expect(resolveTileCollision(solidAt, at(50, 18), at(1, 1), RECT30)).toEqual(at(48, 18))
  })

  it('handles float positions', () => {
    // rect right = 67.5; overlap vs left edge 63 = 4.5 -> x = 48; y untouched
    expect(resolveTileCollision(solidAt, at(52.5, 48.25), at(1, 0), RECT30)).toEqual(at(48, 48.25))
  })

  it('comes to rest in a concave corner when moving diagonally into it', () => {
    // Walls: (3,2) on the left and (4,3) below the open cell (4,2); (3,3) is the inside corner.
    // Moving down-left from (110,50): (3,2) pushes x by -1 (rect.left 95 vs right edge 96),
    // (4,3) pushes y by 2 (rect.bottom 65 vs top edge 63), then (3,3) is a solid #topRight
    // corner whose overlaps are both 0.
    const r = resolveTileCollision(solidAt, at(110, 50), at(-1, 1), RECT30)
    expect(r).toEqual(at(111, 48))
  })

  it('does not corner-push from a tile whose diagonal neighbour is solid', () => {
    // Rect at (80,80) spans 65..95 on both axes: every corner samples tile (3,3), the
    // bottom-right of the 2x2 block. Its left and top edges are hidden and the diagonal
    // neighbour (2,2) is solid, so calcSolidCorner would not mark #topLeft: no push at all.
    const r = resolveTileCollision(blockSolidAt, at(80, 80), at(1, 1), RECT30)
    expect(r).toEqual(at(80, 80))
  })
})

describe('collisionRectForFrame', () => {
  it('clamps a 32x32 frame to a 30x30 box', () => {
    expect(collisionRectForFrame(32, 32)).toEqual({ left: -15, top: -15, right: 15, bottom: 15 })
  })
  it('gives a 16x16 frame a 14x14 box', () => {
    expect(collisionRectForFrame(16, 16)).toEqual({ left: -7, top: -7, right: 7, bottom: 7 })
  })
  it('honours a non-centred reg point', () => {
    expect(collisionRectForFrame(20, 16, 10, 8)).toEqual({ left: -9, top: -7, right: 9, bottom: 7 })
  })
})
