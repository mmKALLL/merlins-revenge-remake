import { describe, expect, it } from 'vitest'
import { InputTracker } from './keyboard'

describe('InputTracker', () => {
  it('sums held direction keys into a move vector, opposite keys cancel', () => {
    const t = new InputTracker()
    t.keyDown('KeyW')
    t.keyDown('ArrowRight')
    expect(t.snapshot().move).toEqual({ x: 1, y: -1 })
    t.keyDown('KeyA')
    expect(t.snapshot().move).toEqual({ x: 0, y: -1 })
    t.keyUp('KeyW')
    expect(t.snapshot().move).toEqual({ x: 0, y: 0 })
  })

  it('maps E and left click to mouse aim, Space to nearest enemy, F to short', () => {
    const t = new InputTracker()
    t.setMouseButton(true)
    expect(t.snapshot()).toMatchObject({ chargeHeld: true, shootNearest: false, shootShort: false })
    t.setMouseButton(false)
    t.keyDown('KeyE')
    expect(t.snapshot()).toMatchObject({ chargeHeld: true, shootNearest: false, shootShort: false })
    t.keyUp('KeyE')
    t.keyDown('Space')
    expect(t.snapshot()).toMatchObject({ chargeHeld: false, shootNearest: true, shootShort: false })
    t.keyUp('Space')
    t.keyDown('KeyF')
    expect(t.snapshot()).toMatchObject({ chargeHeld: false, shootNearest: false, shootShort: true })
  })

  it('releaseAll drops held keys and the mouse button', () => {
    const t = new InputTracker()
    t.keyDown('KeyW'); t.keyDown('Space'); t.setMouseButton(true)
    t.releaseAll()
    expect(t.snapshot()).toMatchObject({ move: { x: 0, y: 0 }, chargeHeld: false, shootNearest: false })
  })

  it('carries the latest mouse world position', () => {
    const t = new InputTracker()
    expect(t.snapshot().mouseWorld).toBeNull()
    t.setMouseWorld({ x: 12, y: 34 })
    expect(t.snapshot().mouseWorld).toEqual({ x: 12, y: 34 })
  })
})
