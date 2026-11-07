import { describe, expect, it } from 'vitest'
import { cameraFor, openWorldOnly, playViewFor } from '../sim/view'
import { cameraOrigin, chooseZoom } from './camera'

const view = { w: 576, h: 288 }
const roomRect = { left: 576, top: 0, right: 1152, bottom: 288 }

describe('cameraOrigin', () => {
  it('snaps to the room in room mode', () => {
    expect(cameraOrigin('room', roomRect, { x: 700, y: 50 }, view, { w: 2000, h: 288 })).toEqual({ x: 576, y: 0 })
  })
  it('centres on the player in follow mode, clamped to the world', () => {
    expect(cameraOrigin('follow', roomRect, { x: 700, y: 144 }, view, { w: 2000, h: 288 })).toEqual({ x: 412, y: 0 })
    expect(cameraOrigin('follow', roomRect, { x: 10, y: 144 }, view, { w: 2000, h: 288 })).toEqual({ x: 0, y: 0 })
    expect(cameraOrigin('follow', roomRect, { x: 1990, y: 144 }, view, { w: 2000, h: 288 })).toEqual({ x: 1424, y: 0 })
  })
})

describe('chooseZoom', () => {
  it('picks the largest integer zoom that fits', () => {
    expect(chooseZoom({ w: 640, h: 320 }, { w: 1300, h: 700 })).toBe(2)
    expect(chooseZoom({ w: 640, h: 320 }, { w: 600, h: 300 })).toBe(1)
  })
})

describe('playViewFor', () => {
  const map = (x: number, y: number) => ({ mapSize: { x: 1, y: 1 }, roomSize: { x, y }, startRoom: { x: 1, y: 1 }, layers: [], rooms: [] })

  it('shows one room at 32 px tiles: 576x288 for the standard 18x9 room', () => {
    expect(playViewFor(map(18, 9))).toEqual({ w: 576, h: 288 })
    expect(playViewFor(map(16, 12))).toEqual({ w: 512, h: 384 })
  })

  it('plays the merlinart maps\' huge rooms in the open world only, at the standard view', () => {
    for (const [x, y] of [[35, 18], [37, 25], [64, 64]] as const) {
      expect(openWorldOnly(map(x, y))).toBe(true)
      expect(cameraFor(map(x, y), 'room')).toBe('follow')
      expect(playViewFor(map(x, y))).toEqual({ w: 576, h: 288 })
    }
    expect(cameraFor(map(16, 12), 'room')).toBe('room')
  })
})
