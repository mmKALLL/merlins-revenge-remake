// What follows gameMaster.gameComplete: movieMaster.gameComplete -> goScreen(#animScreenEnd,
// #gameComplete) fades the game screen out, then goScreenAction plays gGameCompleteScript
// (#cut_scene_to_play_at_end). When the script finishes, movieMaster.cutSceneFinished goes to the
// credits screen; the port has no credits yet and waits on a "map complete" prompt instead.
import { cutSceneView, startCutScene, stepCutScene, type CutSceneCue, type CutSceneState, type CutSceneView, type StageRect } from './performer'
import type { CutSceneScript } from './script'

/** GameInitGlobals gGameCompleteScript: the cut scene played when the map is complete. */
export const GAME_COMPLETE_SCRIPT = 'cut_scene_to_play_at_end'

/** Frames the game screen takes to fade out (screenMaster's #fade transition; its length is assumed). */
export const GAME_FADE_FRAMES = 15

export type EndSequence =
  | { phase: 'fadeOut'; frame: number }
  | { phase: 'cutScene'; scene: CutSceneState }
  | { phase: 'done' }

export interface EndSequenceView {
  /** how far the game screen has faded to black, 0-1 */
  fade: number
  cutScene: CutSceneView | null
  /** the cut scene is over: offer to play the map again */
  done: boolean
}

export const startEndSequence = (): EndSequence => ({ phase: 'fadeOut', frame: 0 })

export function stepEndSequence(seq: EndSequence, script: CutSceneScript, stage: StageRect): { seq: EndSequence; cues: CutSceneCue[] } {
  switch (seq.phase) {
    case 'fadeOut': {
      const frame = seq.frame + 1
      if (frame < GAME_FADE_FRAMES) return { seq: { phase: 'fadeOut', frame }, cues: [] }
      const started = startCutScene(script, stage)
      return { seq: started.state.finished ? { phase: 'done' } : { phase: 'cutScene', scene: started.state }, cues: started.cues }
    }
    case 'cutScene': {
      const r = stepCutScene(seq.scene)
      return { seq: r.state.finished ? { phase: 'done' } : { phase: 'cutScene', scene: r.state }, cues: r.cues }
    }
    case 'done':
      return { seq, cues: [] }
  }
}

export function endSequenceView(seq: EndSequence): EndSequenceView {
  switch (seq.phase) {
    case 'fadeOut':
      return { fade: seq.frame / GAME_FADE_FRAMES, cutScene: null, done: false }
    case 'cutScene':
      return { fade: 1, cutScene: cutSceneView(seq.scene), done: false }
    case 'done':
      return { fade: 1, cutScene: null, done: true }
  }
}
