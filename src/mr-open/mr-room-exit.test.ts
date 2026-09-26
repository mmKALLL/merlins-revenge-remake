import { describe, expect, it } from 'vitest'
import type { CollisionRect } from './mr-collision'
import { clampToRoom, roomAfterMove } from './mr-room-exit'

// a 30x30 box (32 px frame, centred reg point); the numbers below were derived for it
const RECT30: CollisionRect = { left: -15, top: -15, right: 15, bottom: 15 }

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
  it('moves diagonally when both axes leave', () => {
    expect(roomAfterMove(room, { x: 576, y: 288 }, { x: 1, y: 1 })).toEqual({ x: 2, y: 2 })
    expect(roomAfterMove(room, { x: -1, y: -1 }, { x: 2, y: 2 })).toEqual({ x: 1, y: 1 })
  })
})

describe('clampToRoom', () => {
  it('keeps the collision rect inside the room when exits are closed', () => {
    // Right bound: the border tile beyond the room's right edge (world tile 19 for an
    // 18-wide room) has left edge location (19-1)*32 - 1 = 575, so the push-out leaves
    // rect.right = 575 and x = 575 - 15 = 560. Left/top bounds have no -1: border tile 0's
    // right edge location is 0, so rect.left = 0 and x = 15 (see mr-collision tests).
    expect(clampToRoom(room, { x: 570, y: 5 }, RECT30)).toEqual({ x: 560, y: 15 })
    expect(clampToRoom(room, { x: 100, y: 100 }, RECT30)).toEqual({ x: 100, y: 100 })
  })
  it('clamps on the left and bottom bounds', () => {
    // Left: border tile 0's right edge location is 0 -> rect.left = 0 -> x = 15.
    // Bottom: border tile 10's top edge location is 9*32 - 1 = 287 -> rect.bottom = 287 -> y = 272.
    expect(clampToRoom(room, { x: 5, y: 280 }, RECT30)).toEqual({ x: 15, y: 272 })
    expect(clampToRoom(room, { x: -20, y: 400 }, RECT30)).toEqual({ x: 15, y: 272 })
  })
})
