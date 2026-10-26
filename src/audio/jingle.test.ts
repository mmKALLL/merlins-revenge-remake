import { expect, it } from 'vitest'
import type { SimEvent } from '../sim/state'
import { withoutMusicAfterMapComplete } from './jingle'

const music = (track: string): SimEvent => ({ kind: 'music', track })
const sound: SimEvent = { kind: 'sound', name: 'end_level', volume: 150 }

it('drops the music requests after mapComplete, keeping everything else', () => {
  const events: SimEvent[] = [music('a'), { kind: 'mapComplete' }, sound, music('b')]
  expect(withoutMusicAfterMapComplete(events)).toEqual([music('a'), { kind: 'mapComplete' }, sound])
})

it('leaves a batch without mapComplete alone', () => {
  const events: SimEvent[] = [sound, music('a')]
  expect(withoutMusicAfterMapComplete(events)).toBe(events)
})
