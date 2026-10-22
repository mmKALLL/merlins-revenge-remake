import { describe, expect, it } from 'vitest'
import { advanceAnim } from './anim'
import type { ActorState, AnimationStrip } from './state'

const STRIP: AnimationStrip = { frames: 3, delay: 2, w: 16, h: 16 }

/** Ticks until the strip reports its loop, stepping from a fresh start. */
function ticksToLoop(slow: number): number {
  let a = { anim: 'weaponMelee', animFrame: 0, animCounter: 0, animExtend: 0, animExtendCount: 0, animLooped: false } as ActorState
  for (let tick = 1; tick < 100; tick++) {
    a = { ...a, ...advanceAnim(a, 'weaponMelee', STRIP, slow) }
    if (a.animLooped) return tick
  }
  return Infinity
}

describe('advanceAnim slow (remake: a frozen unit attacks slower)', () => {
  it('stretches every frame by the factor, so the strip takes that many times as long', () => {
    // the first tick starts the strip at frame 0 counter 1; frames x delay ticks in all
    expect(ticksToLoop(1)).toBe(3 * 2 - 1)
    expect(ticksToLoop(3)).toBe(3 * 2 * 3 - 1)
  })
})
