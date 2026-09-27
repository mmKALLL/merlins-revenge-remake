import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { GAME_FADE_FRAMES, endSequenceView, startEndSequence, stepEndSequence, type EndSequence } from './end-sequence'
import { parseCutScene } from './script'

const script = parseCutScene(readFileSync('assets/cut-scenes/cut_scene_to_play_at_end.txt', 'utf8'))
const STAGE = { left: 0, right: 576 }

it('fades the game out, plays the end cut scene, then waits on the prompt', () => {
  let seq: EndSequence = startEndSequence()
  const phases: string[] = []
  for (let i = 0; i < 1000 && seq.phase !== 'done'; i++) {
    seq = stepEndSequence(seq, script, STAGE).seq
    if (phases.at(-1) !== seq.phase) phases.push(seq.phase)
  }
  expect(phases).toEqual(['fadeOut', 'cutScene', 'done'])
  expect(endSequenceView(seq)).toEqual({ fade: 1, cutScene: null, done: true })
  expect(endSequenceView(startEndSequence()).fade).toBe(0)
  let fading: EndSequence = startEndSequence()
  for (let i = 1; i < GAME_FADE_FRAMES; i++) fading = stepEndSequence(fading, script, STAGE).seq
  expect(fading.phase).toBe('fadeOut')
  expect(stepEndSequence(fading, script, STAGE).seq.phase).toBe('cutScene')
})
