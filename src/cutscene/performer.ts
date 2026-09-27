// Plays a parsed cut scene one frame at a time: a pure port of the parts of cutSceneMaster,
// objScriptPerformer, modThespian, objCutSceneTitle, modFader and objTransformer that the stage
// needs (docs/notes/engine-mechanics-map-complete.md, "Cut scenes"). Lines run one after another;
// most finish at once (lineFinished), while speech, `wait` and the lights hold the script until
// they are done. Background and title colour changes run alongside.
//
// Supported: setStage, at, atPlayer, gotoWings, turnToFace, speakLine, wait, showTitle,
// backgroundColour, backgroundColourTo, lightsUp, lightsDown, fadeDown (a player), fadeUp/fadeDown
// (the stage: no-ops as in the engine), playSound, playMusic. Walking is not animated: walkTo,
// walkToPlayer, enterStage* and teleportInAt put the player at the destination, exitStage* and
// teleportOut send it to the wings. Props, goMode, goWastedMode, walkScroll* and
// backgroundColourRandomFlash are skipped.
import type { CutSceneScript, Rgb, ScriptLine, ScriptValue } from './script'

/** objScriptPerformer #init defaults: speech shows for basic + letters * perLetter frames, then a gap. */
export const BASIC_TIME_PER_LINE = 50
export const TIME_PER_LETTER = 1.4
export const TIME_BETWEEN_LINES = 12
/** cutSceneMaster.backgroundColourTo: colourTransform speed (percent per frame). */
const BACKGROUND_SPEED = 2
/** modFader.startSlowFadeIn / startSlowFadeOut (lightsUp / lightsDown): transBlend speed. */
const LIGHTS_SPEED = 2
/** objCutSceneTitle: colour change speed, frames the title stays up, and its colours. */
const TITLE_SPEED = 4
export const TITLE_DISPLAY_FRAMES = 150
export const TITLE_COLOUR: Rgb = { r: 204, g: 204, b: 0 }
export const BLACK: Rgb = { r: 0, g: 0, b: 0 }
/** modFader blend range (Director sprite blend). */
const OPAQUE = 100
const INVISIBLE = 0

/** The stage the players stand on, in the renderer's coordinates (cutSceneMaster.pStageRect). */
export interface StageRect { left: number; right: number }

/**
 * objTransformer: `curr` moves toward `target` by `speed` per frame, skipping the first frame (so
 * the start value shows); `done` once it arrives.
 */
interface Transform { curr: number; target: number; speed: number; firstFrame: boolean }

const transform = (curr: number, target: number, speed: number): Transform => ({ curr, target, speed, firstFrame: true })

function stepTransform(t: Transform): { t: Transform; done: boolean } {
  if (t.firstFrame) return { t: { ...t, firstFrame: false }, done: false }
  const curr = t.curr < t.target ? Math.min(t.target, t.curr + t.speed) : Math.max(t.target, t.curr - t.speed)
  return { t: { ...t, curr }, done: curr === t.target }
}

/** objTransColor: 0-100 percent between two colours; the same colour takes one step (setTarget(1)). */
interface ColourChange { from: Rgb; to: Rgb; t: Transform }

const sameColour = (a: Rgb, b: Rgb) => a.r === b.r && a.g === b.g && a.b === b.b
const colourChange = (from: Rgb, to: Rgb, speed: number): ColourChange => ({ from, to, t: transform(0, sameColour(from, to) ? 1 : 100, speed) })

/** VarColRange: the colour `pct` percent of the way. */
function colourAt(c: ColourChange): Rgb {
  if (sameColour(c.from, c.to)) return c.to
  const k = c.t.curr / 100
  const mix = (a: number, b: number) => Math.round(a + (b - a) * k)
  return { r: mix(c.from.r, c.to.r), g: mix(c.from.g, c.to.g), b: mix(c.from.b, c.to.b) }
}

export interface CutScenePlayer {
  character: string
  /** stage x of the player's middle; null while it waits in the wings (off stage) */
  x: number | null
  /** sprite blend 0-100 */
  blend: number
  fade: Transform | null
  facingLeft: boolean
}

interface Speech { character: string; text: string; phase: 'display' | 'delay'; framesLeft: number }

interface Title {
  text: string
  colour: Rgb
  change: ColourChange | null
  /** fadeDown: the old text fading before `pending` replaces it; reveal: the new text coming up */
  mode: 'none' | 'fadeDown' | 'reveal'
  pending: string
  /** frames until the title fades away again (objCutSceneTitle.startDisplayTimer) */
  displayLeft: number | null
}

export interface CutSceneState {
  script: CutSceneScript
  stage: StageRect
  /** the next line to perform */
  next: number
  finished: boolean
  background: Rgb
  backgroundChange: ColourChange | null
  title: Title
  players: CutScenePlayer[]
  speech: Speech | null
  waitLeft: number | null
  /** lightsUp / lightsDown: the script waits for every player's fade (objScriptPerformer.playerFaderFin) */
  lightsPending: boolean
}

/** Sounds and music a frame asks for (soundMaster.playSound / playMusic from the script). */
export type CutSceneCue = { kind: 'sound'; name: string; volume: number } | { kind: 'music'; track: string }

export interface CutSceneStep { state: CutSceneState; cues: CutSceneCue[] }

/** cutSceneMaster.playCutScene -> objScriptPerformer.startPerformance: the lines up to the first that waits. */
export function startCutScene(script: CutSceneScript, stage: StageRect): CutSceneStep {
  const state: CutSceneState = {
    script,
    stage,
    next: 0,
    finished: false,
    background: BLACK,
    backgroundChange: null,
    title: { text: '', colour: BLACK, change: null, mode: 'none', pending: '', displayLeft: null },
    // createMissingPlayers: every player starts in the wings
    players: script.players.map((p) => ({ character: p.character, x: null, blend: OPAQUE, fade: null, facingLeft: false })),
    speech: null,
    waitLeft: null,
    lightsPending: false,
  }
  const cues: CutSceneCue[] = []
  return { state: performLines(state, cues), cues }
}

/** One frame: colour changes, fades and timers advance; a finished wait lets the script go on. */
export function stepCutScene(prev: CutSceneState): CutSceneStep {
  if (prev.finished) return { state: prev, cues: [] }
  const cues: CutSceneCue[] = []
  let s: CutSceneState = { ...prev, title: stepTitle(prev.title) }
  if (s.backgroundChange) {
    const r = stepTransform(s.backgroundChange.t)
    const change = { ...s.backgroundChange, t: r.t }
    s = { ...s, background: colourAt(change), backgroundChange: r.done ? null : change }
  }
  let fading = false
  s = {
    ...s,
    players: s.players.map((p) => {
      if (!p.fade) return p
      const r = stepTransform(p.fade)
      if (!r.done) fading = true
      return { ...p, blend: r.t.curr, fade: r.done ? null : r.t }
    }),
  }
  let lineDone = false
  if (s.lightsPending && !fading) {
    s = { ...s, lightsPending: false }
    lineDone = true
  }
  if (s.speech) {
    const left = s.speech.framesLeft - 1
    if (left > 0) s = { ...s, speech: { ...s.speech, framesLeft: left } }
    else if (s.speech.phase === 'display') s = { ...s, speech: { ...s.speech, phase: 'delay', framesLeft: TIME_BETWEEN_LINES } }
    else {
      s = { ...s, speech: null }
      lineDone = true
    }
  }
  if (s.waitLeft !== null) {
    const left = s.waitLeft - 1
    s = { ...s, waitLeft: left > 0 ? left : null }
    if (left <= 0) lineDone = true
  }
  return { state: lineDone ? performLines(s, cues) : s, cues }
}

/** What is on the stage this frame, for the renderer. */
export interface CutSceneView {
  background: Rgb
  title: { text: string; colour: Rgb }
  players: { character: string; x: number; alpha: number; facingLeft: boolean }[]
  speech: { character: string; x: number; text: string } | null
}

export function cutSceneView(s: CutSceneState): CutSceneView {
  const onStage = s.players.filter((p): p is CutScenePlayer & { x: number } => p.x !== null)
  const speaker = s.speech?.phase === 'display' ? onStage.find((p) => p.character === s.speech!.character) : undefined
  return {
    background: s.background,
    title: { text: s.title.text, colour: s.title.colour },
    players: onStage.map((p) => ({ character: p.character, x: p.x, alpha: p.blend / OPAQUE, facingLeft: p.facingLeft })),
    speech: speaker && s.speech ? { character: speaker.character, x: speaker.x, text: s.speech.text } : null,
  }
}

/** objScriptPerformer.calcDisplayTimeForLine, in whole frames. */
export function speechFrames(text: string): number {
  return Math.ceil(BASIC_TIME_PER_LINE + text.length * TIME_PER_LETTER)
}

/** objScriptPerformer.performNextLine until a line has to wait; the script finishes after the last line. */
function performLines(start: CutSceneState, cues: CutSceneCue[]): CutSceneState {
  let s = start
  while (!isWaiting(s)) {
    const line = s.script.lines[s.next]
    if (!line) return { ...s, finished: true }
    s = performLine({ ...s, next: s.next + 1 }, line, cues)
  }
  return s
}

const isWaiting = (s: CutSceneState): boolean => s.speech !== null || s.waitLeft !== null || s.lightsPending

function performLine(s: CutSceneState, line: ScriptLine, cues: CutSceneCue[]): CutSceneState {
  const args = line.args
  const text = args.kind === 'text' ? args.text : ''
  const value = args.kind === 'value' ? args.value : undefined
  const other = args.kind === 'character' ? args.character : null
  const who = line.character
  switch (line.command) {
    case 'setStage':
      // putPlayersIntoWings, makePlayersInvisible, backgroundColour(pSetSceneColour)
      return { ...s, backgroundChange: null, background: BLACK, players: s.players.map((p) => ({ ...p, x: null, blend: INVISIBLE, fade: null })) }
    case 'backgroundColour':
      return isRgb(value) ? { ...s, background: value, backgroundChange: null } : s
    case 'backgroundColourTo':
      return isRgb(value) ? { ...s, backgroundChange: colourChange(s.background, value, BACKGROUND_SPEED) } : s
    case 'showTitle':
      return { ...s, title: showTitle(s.title, text) }
    case 'wait':
      return typeof value === 'number' && value > 0 ? { ...s, waitLeft: value } : s
    case 'lightsUp':
    case 'lightsDown': {
      const target = line.command === 'lightsUp' ? OPAQUE : INVISIBLE
      if (who !== null) return s
      return { ...s, lightsPending: s.players.length > 0, players: s.players.map((p) => ({ ...p, fade: transform(p.blend, target, LIGHTS_SPEED) })) }
    }
    case 'playSound':
      if (args.kind === 'sound') cues.push({ kind: 'sound', name: args.member, volume: args.volume })
      return s
    case 'playMusic':
      if (args.kind === 'sound') cues.push({ kind: 'music', track: args.member })
      return s
    case 'speakLine':
      if (who === null) return s
      return { ...autoTurn(s, who), speech: { character: who, text, phase: 'display', framesLeft: speechFrames(text) } }
  }
  if (who === null) return s // other stage commands (fadeUp, fadeDown, walkScroll*) only call lineFinished here
  return updatePlayer(s, who, (p) => {
    switch (line.command) {
      case 'at': case 'propAt': case 'teleportInAt': case 'walkTo':
        return { ...p, x: stageX(value) ?? p.x }
      case 'atPlayer': case 'walkToPlayer':
        return { ...p, x: playerX(s, other) ?? p.x }
      case 'enterStageLeft':
        return { ...p, x: entranceX(s, 'left') }
      case 'enterStageRight':
        return { ...p, x: entranceX(s, 'right') }
      case 'gotoWings': case 'exitStageLeft': case 'exitStageRight': case 'teleportOut':
        return { ...p, x: null }
      case 'turnToFace':
        return faceToward(p, playerX(s, other))
      case 'fadeDown':
        return { ...p, fade: transform(p.blend, INVISIBLE, LIGHTS_SPEED) }
      default:
        return p
    }
  })
}

const isRgb = (v: ScriptValue | undefined): v is Rgb => typeof v === 'object' && 'r' in v

/** modThespian.interpretLoc: a number is an x on the stage floor; a point keeps its x here. */
function stageX(v: ScriptValue | undefined): number | null {
  if (typeof v === 'number') return v
  if (typeof v === 'object' && 'x' in v) return v.x
  return null
}

const playerX = (s: CutSceneState, character: string | null): number | null =>
  s.players.find((p) => p.character === character)?.x ?? null

/** objScriptPerformer.getStageEntranceOnLoc: halfway between the stage edge and the outermost player on stage. */
function entranceX(s: CutSceneState, side: 'left' | 'right'): number {
  const centre = (s.stage.left + s.stage.right) / 2
  const xs = s.players.flatMap((p) => (p.x === null ? [] : [p.x]))
  const extreme = side === 'left' ? Math.min(centre, ...xs) : Math.max(centre, ...xs)
  const edge = side === 'left' ? s.stage.left : s.stage.right
  return (edge + extreme) / 2
}

/** modThespian.turnToFace: flip toward the other player (PointDirPoint -> setSpriteFlipFromDir). */
function faceToward(p: CutScenePlayer, x: number | null): CutScenePlayer {
  if (x === null || p.x === null || x === p.x) return p
  return { ...p, facingLeft: x < p.x }
}

/** objScriptPerformer.turnPlayersToFace: with pAutoTurn every other player turns to the speaker. */
function autoTurn(s: CutSceneState, speaker: string): CutSceneState {
  const x = playerX(s, speaker)
  return { ...s, players: s.players.map((p) => (p.character === speaker ? p : faceToward(p, x))) }
}

function updatePlayer(s: CutSceneState, character: string, fn: (p: CutScenePlayer) => CutScenePlayer): CutSceneState {
  return { ...s, players: s.players.map((p) => (p.character === character ? fn(p) : p)) }
}

/** objCutSceneTitle.showTitle: fade the old title to the background colour first. */
function showTitle(t: Title, text: string): Title {
  return { ...t, pending: text, mode: 'fadeDown', change: colourChange(t.colour, BLACK, TITLE_SPEED), displayLeft: null }
}

/**
 * objCutSceneTitle: fadeDown finishes -> setTitle, startDisplayTimer, revealTitle (to the title
 * colour); the display timer runs out -> hideTitle (back to black; the text stays, unseen).
 */
function stepTitle(prev: Title): Title {
  let t = prev
  if (t.change) {
    const r = stepTransform(t.change.t)
    const change = { ...t.change, t: r.t }
    t = { ...t, colour: colourAt(change), change: r.done ? null : change }
    if (r.done && t.mode === 'fadeDown') {
      t = { ...t, text: t.pending, mode: 'reveal', displayLeft: TITLE_DISPLAY_FRAMES, change: colourChange(t.colour, TITLE_COLOUR, TITLE_SPEED) }
    } else if (r.done) t = { ...t, mode: 'none' }
  }
  if (t.displayLeft !== null && t.mode !== 'fadeDown') {
    const left = t.displayLeft - 1
    t = left > 0 ? { ...t, displayLeft: left } : { ...t, displayLeft: null, mode: 'none', change: colourChange(t.colour, BLACK, TITLE_SPEED) }
  }
  return t
}
