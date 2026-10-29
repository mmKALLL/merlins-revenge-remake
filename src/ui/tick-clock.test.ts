import { describe, expect, it } from 'vitest'
import { FrameLimiter, TickClock, drawAlpha } from './tick-clock'

const TICK = 100 / 3
const MAX_FRAME = 250
const FRAME = 1000 / 60

describe('TickClock', () => {
  it('steps one tick per tick length of frame time', () => {
    const c = new TickClock(TICK, MAX_FRAME)
    c.frame(0, true)
    let ticks = 0
    for (let i = 1; i <= 60; i++) ticks += c.frame(i * FRAME + 0.001, true).ticks
    expect(ticks).toBe(30)
  })

  it('steps nothing while paused and does not catch up on resume', () => {
    const c = new TickClock(TICK, MAX_FRAME)
    c.frame(0, true)
    let paused = 0
    for (let i = 1; i <= 120; i++) paused += c.frame(i * 16, false).ticks
    expect(paused).toBe(0)
    // the first frames after the pause only cover their own time
    expect(c.frame(121 * 16, true).ticks).toBe(0)
    expect(c.frame(123 * 16 + 1, true).ticks).toBe(1)
  })

  it('caps a long gap between frames', () => {
    const c = new TickClock(TICK, MAX_FRAME)
    c.frame(0, true)
    expect(c.frame(10_000, true).ticks).toBe(Math.floor(MAX_FRAME / TICK))
  })
})

describe('FrameLimiter', () => {
  it('keeps every other frame of a 120 Hz display at 60 fps, and every frame without a target', () => {
    const frames = Array.from({ length: 12 }, (_, i) => i * (1000 / 120))
    const at60 = new FrameLimiter(60)
    expect(frames.filter((t) => at60.due(t))).toHaveLength(6)
    const uncapped = new FrameLimiter(null)
    expect(frames.filter((t) => uncapped.due(t))).toHaveLength(12)
  })
})

describe('drawAlpha', () => {
  it('interpolates while the sim steps and holds the last tick while it is held (the end sequence)', () => {
    const c = new TickClock(TICK, MAX_FRAME)
    c.frame(0, true)
    const alphas = Array.from({ length: 12 }, (_, i) => c.frame((i + 1) * FRAME, true).alpha)
    expect(new Set(alphas.map((a) => drawAlpha(a, false))).size).toBeGreaterThan(1)
    for (const a of alphas) expect(drawAlpha(a, true)).toBe(1)
  })
})
