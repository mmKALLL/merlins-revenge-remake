import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { needsSprite, resolveActors } from './mr-actor-data'
import { chargeVolume, hasFreeVoice, roomMusic, varMapRange } from './mr-sound'

describe('chargeVolume (VarMapRange charge [1,100] -> vol [10,255])', () => {
  it('maps linearly and clamps at both ends', () => {
    expect(chargeVolume(1)).toBe(10)
    expect(chargeVolume(100)).toBe(255)
    expect(chargeVolume(50.5)).toBeCloseTo(132.5)
    expect(chargeVolume(0)).toBe(10)
    expect(chargeVolume(400)).toBe(255)
  })
  it('handles reversed ranges like VarPercent/VarValRange', () => {
    expect(varMapRange(25, [100, 0], [0, 1])).toBeCloseTo(0.75)
  })
})

describe('SFX voice pool (soundMaster.playSound)', () => {
  it('drops the new sound when all 7 voices are busy', () => {
    expect(hasFreeVoice(6)).toBe(true)
    expect(hasFreeVoice(7)).toBe(false)
  })
})

describe('music tiles', () => {
  const read = (k: string) => readFileSync(`assets/actors/${k}.txt`, 'utf8')
  const keys = ['actor', 'game', 'music', 'musicLastStand', 'musicOff']
  const defs = resolveActors(Object.fromEntries(keys.map((k) => [k, read(k)])))
  it('carry their track, musicOff stops, and are not drawn', () => {
    expect(defs['musicLastStand']!.musicTrack).toBe('last_stand_v4')
    expect(defs['musicOff']!.musicTrack).toBeNull()
    expect(needsSprite(defs['musicLastStand']!)).toBe(false)
  })
  it('the last tile activated wins; no tile leaves the music alone', () => {
    expect(roomMusic([])).toBeUndefined()
    expect(roomMusic(['a', null])).toBeNull()
  })
})
