// A map's intro cut scene. The original plays gIntroScript on its intro screen before the game
// (movieMaster, animScreenIntro); Merlin Open's own is the empty `cut_scene_to_play`.
// Remake (owner, 2026-11-08): MR3's intro (cut_scenes/mr3IntroFull) plays before merliniii, and no
// other map has one. It plays when the map is started (the title, the map list, a page opened on
// it), not on a restart, a death, Continue or the game over's reload; Enter, Space or a click/tap
// skips it. The stage starts black (no game screen to fade out) and the map starts when it is over.
import type { EndSequenceView } from './end-sequence'
import { cutSceneView, startCutScene, stepCutScene, type Cast, type CutSceneCue, type CutSceneState, type StageRect } from './performer'
import type { CutSceneScript } from './script'

/** Map id -> the cut scene played before it (assets/cut-scenes/<name>.txt). */
export const MAP_INTROS: Readonly<Record<string, string>> = { merliniii: 'mr3IntroFull' }

export const introFor = (mapId: string): string | null => MAP_INTROS[mapId] ?? null

/** The intro playing, or over (finished or skipped). */
export type Intro = { phase: 'cutScene'; scene: CutSceneState } | { phase: 'done' }

const playing = (scene: CutSceneState): Intro => (scene.finished ? { phase: 'done' } : { phase: 'cutScene', scene })

export function startIntro(script: CutSceneScript, stage: StageRect, cast: Cast): { intro: Intro; cues: CutSceneCue[] } {
  const started = startCutScene(script, stage, cast)
  return { intro: playing(started.state), cues: started.cues }
}

export function stepIntro(intro: Intro): { intro: Intro; cues: CutSceneCue[] } {
  if (intro.phase === 'done') return { intro, cues: [] }
  const r = stepCutScene(intro.scene)
  return { intro: playing(r.state), cues: r.cues }
}

export const skipIntro = (): Intro => ({ phase: 'done' })

export const introOver = (intro: Intro): boolean => intro.phase === 'done'

/** Drawn as an ending's cut scene, over a black screen. */
export function introView(intro: Intro): EndSequenceView {
  return { fade: 1, cutScene: intro.phase === 'cutScene' ? cutSceneView(intro.scene) : null, done: false }
}
