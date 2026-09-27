import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  BLACK, TIME_BETWEEN_LINES, TITLE_COLOUR, TITLE_DISPLAY_FRAMES, cutSceneView, speechFrames, startCutScene, stepCutScene,
  type CutSceneState,
} from './performer'
import { parseCutScene } from './script'

const STAGE = { left: 0, right: 576 }
const endScene = parseCutScene(readFileSync('assets/cut-scenes/cut_scene_to_play_at_end.txt', 'utf8'))
/** modFader slow fade and the background change: speed 2 over 0-100, plus the transformer's first frame. */
const FADE_FRAMES = 51

/** Steps until `done`, returning the state and the frames taken. */
function runUntil(s: CutSceneState, done: (s: CutSceneState) => boolean, limit = 2000): [CutSceneState, number] {
  for (let i = 1; i <= limit; i++) {
    s = stepCutScene(s).state
    if (done(s)) return [s, i]
  }
  throw new Error('cut scene did not get there')
}

describe('the end cut scene (Map Cleared!)', () => {
  it('sets the stage and waits for the lights: Merlin at 300, faded out, the background on its way to grey', () => {
    const { state } = startCutScene(endScene, STAGE)
    expect(state.lightsPending).toBe(true)
    expect(state.players).toMatchObject([{ character: 'merlin', x: 300, blend: 0 }])
    expect(state.background).toEqual(BLACK)
  })

  it('runs lights up, "Woo hoo!", its gap, wait 20 and lights down, then finishes', () => {
    let s = startCutScene(endScene, STAGE).state
    let frames: number
    ;[s, frames] = runUntil(s, (t) => t.speech !== null)
    expect(frames).toBe(FADE_FRAMES)
    expect(s.players[0]!.blend).toBe(100)
    expect(s.background).toEqual({ r: 220, g: 220, b: 220 })
    expect(cutSceneView(s).speech).toEqual({ character: 'merlin', x: 300, text: 'Woo hoo!' })
    ;[s, frames] = runUntil(s, (t) => t.speech === null)
    expect(frames).toBe(speechFrames('Woo hoo!') + TIME_BETWEEN_LINES)
    expect(s.waitLeft).toBe(20)
    ;[s, frames] = runUntil(s, (t) => t.lightsPending)
    expect(frames).toBe(20)
    ;[s, frames] = runUntil(s, (t) => t.finished)
    expect(frames).toBe(FADE_FRAMES)
    expect(s.players[0]!.blend).toBe(0)
    expect(s.background).toEqual(BLACK)
  })

  it('shows the title in yellow, keeps it up for its display time, then fades it back to black', () => {
    let s = startCutScene(endScene, STAGE).state
    ;[s] = runUntil(s, (t) => t.title.text === 'Map Cleared!')
    ;[s] = runUntil(s, (t) => t.title.colour.r === TITLE_COLOUR.r && t.title.colour.g === TITLE_COLOUR.g)
    const [, shown] = runUntil(s, (t) => t.title.colour.r < TITLE_COLOUR.r)
    expect(shown).toBeGreaterThan(TITLE_DISPLAY_FRAMES / 2)
    expect(shown).toBeLessThanOrEqual(TITLE_DISPLAY_FRAMES)
  })

  it('speech shows for 50 frames plus 1.4 per letter (objScriptPerformer.calcDisplayTimeForLine)', () => {
    expect(speechFrames('')).toBe(50)
    expect(speechFrames('Woo hoo!')).toBe(62)
  })
})

describe('players', () => {
  const two = parseCutScene('characters\n#merlin - m\n#ulin - u\nlines\nsetStage\nm at 200\nu at 400\nm turnToFace u\nlightsUp\nu: Hi\nm: Bye\nm gotoWings\n')

  it('turn to face each other, and the listeners turn to the speaker', () => {
    let s = startCutScene(two, STAGE).state
    expect(s.players.find((p) => p.character === 'merlin')!.facingLeft).toBe(false)
    ;[s] = runUntil(s, (t) => t.speech?.character === 'ulin')
    // ulin speaks: merlin (to his left) keeps facing him; ulin keeps his own facing
    expect(s.players.find((p) => p.character === 'merlin')!.facingLeft).toBe(false)
    ;[s] = runUntil(s, (t) => t.speech?.character === 'merlin')
    expect(s.players.find((p) => p.character === 'ulin')!.facingLeft).toBe(true)
  })

  it('go to the wings off stage, out of the view', () => {
    let s = startCutScene(two, STAGE).state
    ;[s] = runUntil(s, (t) => t.finished)
    expect(cutSceneView(s).players.map((p) => p.character)).toEqual(['ulin'])
  })
})

it('plays the script\'s sounds and finishes a script without waits at once', () => {
  const { state, cues } = startCutScene(parseCutScene('characters\nlines\nplaySound end_level 100\n'), STAGE)
  expect(cues).toEqual([{ kind: 'sound', name: 'end_level', volume: 100 }])
  expect(state.finished).toBe(true)
})
