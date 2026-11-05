import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import {
  ENDING_SCRIPTS, GAME_FADE_FRAMES, endSequenceView, restartDue, skipEndSequence, startEndSequence, stepEndSequence,
  type EndSequence, type EndingKind,
} from './end-sequence'
import { parseCutScene } from './script'

const scriptOf = (kind: EndingKind) => parseCutScene(readFileSync(`assets/cut-scenes/${ENDING_SCRIPTS[kind]}.txt`, 'utf8'))
const STAGE = { left: 0, right: 576 }

/** Steps the sequence to its end, listing the phases it went through. */
function playThrough(kind: EndingKind): { seq: EndSequence; phases: string[] } {
  const script = scriptOf(kind)
  let seq = startEndSequence(kind)
  const phases: string[] = [seq.phase]
  for (let i = 0; i < 2000 && seq.phase !== 'done'; i++) {
    seq = stepEndSequence(seq, script, STAGE).seq
    if (phases.at(-1) !== seq.phase) phases.push(seq.phase)
  }
  return { seq, phases }
}

it('fades the game out, plays the end cut scene, then waits on the prompt', () => {
  const { seq, phases } = playThrough('gameComplete')
  expect(phases).toEqual(['fadeOut', 'cutScene', 'done'])
  expect(endSequenceView(seq)).toEqual({ fade: 1, cutScene: null, done: true })
  expect(restartDue(seq)).toBe(false)
  expect(endSequenceView(startEndSequence('gameComplete')).fade).toBe(0)
  const script = scriptOf('gameComplete')
  let fading = startEndSequence('gameComplete')
  for (let i = 1; i < GAME_FADE_FRAMES; i++) fading = stepEndSequence(fading, script, STAGE).seq
  expect(fading.phase).toBe('fadeOut')
  expect(stepEndSequence(fading, script, STAGE).seq.phase).toBe('cutScene')
})

it('game over: fades the game out, plays the wasted cut scene, then restarts the map (no prompt)', () => {
  const { seq, phases } = playThrough('gameOver')
  expect(phases).toEqual(['fadeOut', 'cutScene', 'done'])
  expect(restartDue(seq)).toBe(true)
  expect(endSequenceView(seq).done).toBe(false)
})

it('a skip ends the game over at once, in its restart; the map complete sequence plays on', () => {
  expect(restartDue(skipEndSequence(startEndSequence('gameOver')))).toBe(true)
  const complete = startEndSequence('gameComplete')
  expect(skipEndSequence(complete)).toBe(complete)
})
