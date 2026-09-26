import { describe, expect, it } from 'vitest'
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
