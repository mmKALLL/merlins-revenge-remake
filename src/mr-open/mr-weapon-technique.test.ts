import { describe, expect, it } from 'vitest'
import { stepTechnique, TECHNIQUE_INIT } from './mr-weapon-technique'

describe('modWeaponTechnique', () => {
  it('-75: the cache drops 75 per counter finish; each dip below -100 extends a frame and lengthens the counter by one tick', () => {
    let s = TECHNIQUE_INIT
    const extends_: number[] = []
    for (let i = 0; i < 10; i++) {
      const r = stepTechnique(s, -75)
      s = r.state
      extends_.push(r.extend)
    }
    // cache updates at calls 2, 4, 6 (after a 2-tick counter), 8, 10: -75, -150+100, -125+100, -100, -175+100
    expect(extends_).toEqual([0, 0, 0, 1, 0, 1, 0, 0, 0, 1])
    expect(s.cache).toBe(-75)
  })

  it('a technique of 0 never extends', () => {
    let s = TECHNIQUE_INIT
    for (let i = 0; i < 20; i++) {
      const r = stepTechnique(s, 0)
      expect(r.extend).toBe(0)
      s = r.state
    }
  })
})
