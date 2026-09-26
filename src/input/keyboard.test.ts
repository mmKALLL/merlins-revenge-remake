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

  it('reports reserved action keys and left click', () => {
    const t = new InputTracker()
    t.keyDown('KeyE'); t.keyDown('KeyF')
    t.setMouseButton(true)
    expect(t.snapshot().chargeHeld).toBe(true)
    t.setMouseButton(false)
    t.keyDown('Space')
    const s = t.snapshot()
    expect(s.chargeHeld).toBe(true)
    expect(s.shootNearest).toBe(true)
    expect(s.shootShort).toBe(true)
  })

  it('carries the latest mouse world position', () => {
    const t = new InputTracker()
    expect(t.snapshot().mouseWorld).toBeNull()
    t.setMouseWorld({ x: 12, y: 34 })
    expect(t.snapshot().mouseWorld).toEqual({ x: 12, y: 34 })
  })
})
