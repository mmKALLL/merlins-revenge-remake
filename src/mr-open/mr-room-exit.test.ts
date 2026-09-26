import { describe, expect, it } from 'vitest'
import { PLAYER_COLLISION_RECT } from './mr-collision'
import { clampToRoom, roomAfterMove } from './mr-room-exit'

const room = { left: 0, top: 0, right: 576, bottom: 288 }

describe('roomAfterMove', () => {
  it('stays when the reg point is inside', () => {
    expect(roomAfterMove(room, { x: 575, y: 100 }, { x: 1, y: 1 })).toEqual({ x: 1, y: 1 })
  })
  it('moves right when x reaches the right edge', () => {
    expect(roomAfterMove(room, { x: 576, y: 100 }, { x: 1, y: 1 })).toEqual({ x: 2, y: 1 })
  })
  it('moves up when y goes negative', () => {
    expect(roomAfterMove(room, { x: 10, y: -0.5 }, { x: 1, y: 2 })).toEqual({ x: 1, y: 1 })
  })
})

describe('clampToRoom', () => {
  it('keeps the collision rect inside the room when exits are closed', () => {
    // Right bound: the border tile beyond the room's right edge (world tile 19 for an
    // 18-wide room) has left edge location (19-1)*32 - 1 = 575, so the push-out leaves
    // rect.right = 575 and x = 575 - 15 = 560. Left/top bounds have no -1: border tile 0's
    // right edge location is 0, so rect.left = 0 and x = 15 (see mr-collision tests).
    expect(clampToRoom(room, { x: 570, y: 5 }, PLAYER_COLLISION_RECT)).toEqual({ x: 560, y: 15 })
    expect(clampToRoom(room, { x: 100, y: 100 }, PLAYER_COLLISION_RECT)).toEqual({ x: 100, y: 100 })
  })
})
