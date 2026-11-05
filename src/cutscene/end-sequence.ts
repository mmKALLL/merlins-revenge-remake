// What follows the end of a game, in movieMaster: goScreen fades the game screen out with a #fade
// transition, then goScreenAction plays the ending's cut scene.
// - gameMaster.gameComplete -> movieMaster.gameComplete -> goScreen(#animScreenEnd, #gameComplete)
//   plays gGameCompleteScript (#cut_scene_to_play_at_end); when it finishes,
//   movieMaster.cutSceneFinished goes to the credits screen. The port has no credits yet and waits
//   on a "map complete" prompt instead.
// - objPlayerMerlinCharacter.stretchDeathFin -> gameMaster.gameOver (gameMaster.txt:102-111):
//   finishGame, then goScreen(#animScreenGameOver, #gameOver) plays gGameOverScript
//   (#cut_scene_to_play_when_wasted); when it finishes (cutSceneMaster.scriptFinished ->
//   movieMaster.cutSceneFinished) it goes to goScreen(#gameScreen, #loadGame): the map starts again.
//   Remake: the game over can be skipped (skipEndSequence) straight to that restart.
import { cutSceneView, startCutScene, stepCutScene, type CutSceneCue, type CutSceneState, type CutSceneView, type StageRect } from './performer'
import type { CutSceneScript } from './script'

/** Which ending: gameMaster.gameComplete (the map is clear) or gameMaster.gameOver (Merlin died). */
export type EndingKind = 'gameComplete' | 'gameOver'

/** GameInitGlobals gGameCompleteScript and gGameOverScript: the cut scene each ending plays. */
export const ENDING_SCRIPTS: Record<EndingKind, string> = {
  gameComplete: 'cut_scene_to_play_at_end',
  gameOver: 'cut_scene_to_play_when_wasted',
}

/** Frames the game screen takes to fade out (screenMaster's #fade transition; its length is assumed). */
export const GAME_FADE_FRAMES = 15

export type EndSequence = { kind: EndingKind } & (
  | { phase: 'fadeOut'; frame: number }
  | { phase: 'cutScene'; scene: CutSceneState }
  | { phase: 'done' }
)

export interface EndSequenceView {
  /** how far the game screen has faded to black, 0-1 */
  fade: number
  cutScene: CutSceneView | null
  /** the map complete cut scene is over: offer to play the map again */
  done: boolean
}

export const startEndSequence = (kind: EndingKind): EndSequence => ({ kind, phase: 'fadeOut', frame: 0 })

/** One frame of the sequence; `script` is its ending's cut scene (ENDING_SCRIPTS). */
export function stepEndSequence(seq: EndSequence, script: CutSceneScript, stage: StageRect): { seq: EndSequence; cues: CutSceneCue[] } {
  const { kind } = seq
  const playing = (scene: CutSceneState): EndSequence => (scene.finished ? { kind, phase: 'done' } : { kind, phase: 'cutScene', scene })
  switch (seq.phase) {
    case 'fadeOut': {
      const frame = seq.frame + 1
      if (frame < GAME_FADE_FRAMES) return { seq: { kind, phase: 'fadeOut', frame }, cues: [] }
      const started = startCutScene(script, stage)
      return { seq: playing(started.state), cues: started.cues }
    }
    case 'cutScene': {
      const r = stepCutScene(seq.scene)
      return { seq: playing(r.state), cues: r.cues }
    }
    case 'done':
      return { seq, cues: [] }
  }
}

/** The game over's cut scene is over: movieMaster.cutSceneFinished reloads the game. */
export const restartDue = (seq: EndSequence): boolean => seq.kind === 'gameOver' && seq.phase === 'done'

/** Remake (owner): a key or click skips the game over to its end, the restart; the map complete sequence plays on. */
export const skipEndSequence = (seq: EndSequence): EndSequence => (seq.kind === 'gameOver' ? { kind: seq.kind, phase: 'done' } : seq)

export function endSequenceView(seq: EndSequence): EndSequenceView {
  switch (seq.phase) {
    case 'fadeOut':
      return { fade: seq.frame / GAME_FADE_FRAMES, cutScene: null, done: false }
    case 'cutScene':
      return { fade: 1, cutScene: cutSceneView(seq.scene), done: false }
    case 'done':
      return { fade: 1, cutScene: null, done: seq.kind === 'gameComplete' } // a game over restarts instead
  }
}
