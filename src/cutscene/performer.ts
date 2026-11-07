// Plays a parsed cut scene one frame at a time: a pure port of the parts of cutSceneMaster,
// objScriptPerformer, modThespian, objCutSceneTitle, modFader and objTransformer that the stage
// needs (docs/notes/engine-mechanics-map-complete.md, "Cut scenes"). Lines run one after another;
// most finish at once (lineFinished), while speech, `wait` and the lights hold the script until
// they are done. Background and title colour changes run alongside.
//
// Supported: setStage, at, atPlayer, gotoWings, turnToFace, speakLine, wait, showTitle,
// backgroundColour, backgroundColourTo, lightsUp, lightsDown, fadeDown (a player), fadeUp/fadeDown
// (the stage: no-ops as in the engine), playSound, playMusic, goWastedMode, the walks (walkTo,
// walkToPlayer, enterStage* and exitStage* walk (modMoveToLoc) and the script runs on at once:
// lineFinished does not wait for the walk), the teleports (teleportInAt, teleportOut: modTeleport's
// stretch, the script running on) and the props (modProp: propAt, produceProp, dropProp,
// putAwayProp). goMode, walkScroll* and backgroundColourRandomFlash are skipped.
import { TELEPORT_TICKS } from '../mr-open/mr-army'
import type { Vec } from '../mr-open/mr-geometry'
import { arrived, frameMove } from '../mr-open/mr-pathfinding'
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
/** modWastedMode.wastedModeOn: the sprite's blend and its height in px (setSpriteHeight; the width stays). */
export const WASTED_BLEND = 30
export const WASTED_HEIGHT = 60
/**
 * modMoveToLoc.moveTowardsLocSpeed sets the walk vector to the actor's #walkSpeed (act_merlin 4,
 * act_ulin 2), and objMoveXY's walking friction (50 %) halves it before the move, as for every CPU
 * walker (engine-mechanics-combat.md): 2 px a frame for Merlin, the playable Merlin's walking
 * speed too. A character the cast does not list walks at Merlin's speed.
 */
const WALK_SPEED = 4
const WALK_FRICTION = 0.5
/**
 * modProp #propCarryLoc: where a held prop's reg point hangs from its holder's, x mirrored by the
 * holder's facing. Only act_ochreHydra sets one (point(10,-10)); this default (assumed, modProp is
 * not in the notes) puts it at a 16 px character's hand.
 */
export const DEFAULT_PROP_CARRY_LOC: Vec = { x: 8, y: -8 }
/**
 * objScriptPerformer.calcStageLeftOffLoc / calcStageRightOffLoc: a spot just past the stage's edge.
 * Assumed: one character width (Merlin's frames are 16 px) beyond it, so he is out of sight there.
 */
export const OFF_STAGE_DISTANCE = 16

/** The stage the players stand on, in the renderer's coordinates (cutSceneMaster.pStageRect). */
export interface StageRect { left: number; right: number }

/** A player's own data: the actor of its character's key (actorMaster.newActor, act_<character>). */
export interface CastMember {
  /** #walkSpeed: the walk vector's length before the walking friction */
  walkSpeed: number
  /** modProp #propCarryLoc */
  propCarryLoc: Vec
  /** #initFaceDir -1: it starts facing left */
  startsFacingLeft: boolean
}
/** Character -> its actor's data; a character not listed takes DEFAULT_CAST_MEMBER. */
export type Cast = Readonly<Record<string, CastMember>>
export const DEFAULT_CAST_MEMBER: CastMember = { walkSpeed: WALK_SPEED, propCarryLoc: DEFAULT_PROP_CARRY_LOC, startsFacingLeft: false }

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

/** The player's strip: modAnimSet shows the walk strip while modMoveToLoc moves it. */
export type CutSceneStrip = 'stand' | 'walk'

/** modTeleport: a teleport in or out playing, `age` frames into its TELEPORT_TICKS. */
export interface CutSceneTeleport { kind: 'in' | 'out'; age: number }

export interface CutScenePlayer {
  character: string
  /** stage x of the player's middle; null while it waits in the wings (off stage) */
  x: number | null
  /** sprite blend 0-100 */
  blend: number
  fade: Transform | null
  facingLeft: boolean
  /** modMoveToLoc pMoveToLocTarget: the stage x it walks to; null while it stands */
  walkTarget: number | null
  /** frames the current strip has played (the renderer loops it by its frame delays) */
  stripFrames: number
  /** modWastedMode: the sprite's height in px; null keeps the frame's own */
  height: number | null
  /** modProp: the player holding this prop (produceProp); it hangs from that player, its own x null */
  holder: string | null
  teleport: CutSceneTeleport | null
}

/** `x`: where the speech went up, centred on the speaker then (null: the speaker was in the wings). */
interface Speech { character: string; text: string; x: number | null; phase: 'display' | 'delay'; framesLeft: number }

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
  cast: Cast
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
export function startCutScene(script: CutSceneScript, stage: StageRect, cast: Cast = {}): CutSceneStep {
  const state: CutSceneState = {
    script,
    stage,
    cast,
    next: 0,
    finished: false,
    background: BLACK,
    backgroundChange: null,
    title: { text: '', colour: BLACK, change: null, mode: 'none', pending: '', displayLeft: null },
    // createMissingPlayers: every player starts in the wings
    players: script.players.map((p) => ({
      character: p.character, x: null, blend: OPAQUE, fade: null, facingLeft: castMember(cast, p.character).startsFacingLeft,
      walkTarget: null, stripFrames: 0, height: null, holder: null, teleport: null,
    })),
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
    players: s.players.map((player) => {
      const p = stepTeleport(stepWalk(player, castMember(s.cast, player.character).walkSpeed))
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
  players: CutScenePlayerView[]
  speech: { character: string; x: number; text: string } | null
}

export interface CutScenePlayerView {
  character: string
  x: number
  alpha: number
  facingLeft: boolean
  strip: CutSceneStrip
  stripFrames: number
  /** the sprite stretched to this many px tall about its reg point (null: as drawn) */
  height: number | null
  teleport: CutSceneTeleport | null
  /** a held prop: its reg point hangs `carry` px from its holder's (mirrored already) */
  heldBy: { character: string; carry: Vec } | null
}

export function cutSceneView(s: CutSceneState): CutSceneView {
  const speech = s.speech?.phase === 'display' && s.speech.x !== null ? { character: s.speech.character, x: s.speech.x, text: s.speech.text } : null
  return {
    background: s.background,
    title: { text: s.title.text, colour: s.title.colour },
    players: s.players.flatMap((p) => {
      const x = playerX(s, p.character)
      if (x === null) return []
      const holder = p.holder === null ? undefined : s.players.find((h) => h.character === p.holder)
      return [{
        character: p.character, x, alpha: p.blend / OPAQUE, facingLeft: holder ? holder.facingLeft : p.facingLeft,
        strip: stripOf(p), stripFrames: p.stripFrames, height: p.height, teleport: p.teleport,
        heldBy: holder ? { character: holder.character, carry: carryOffset(s, holder) } : null,
      }]
    }),
    speech,
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
      return { ...s, backgroundChange: null, background: BLACK, players: s.players.map((p) => ({ ...placed(p, null), blend: INVISIBLE, fade: null })) }
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
      return { ...autoTurn(s, who), speech: { character: who, text, x: playerX(s, who), phase: 'display', framesLeft: speechFrames(text) } }
  }
  if (who === null) return s // other stage commands (fadeUp, fadeDown, walkScroll*) only call lineFinished here
  switch (line.command) {
    case 'produceProp':
      return other === null ? s : produceProp(s, who, other)
    case 'dropProp':
      return dropProp(s, who)
    case 'putAwayProp':
      return updateHeldProp(s, who, (prop) => placed(prop, null))
  }
  return updatePlayer(s, who, (p) => {
    switch (line.command) {
      case 'at': case 'propAt':
        return placed(p, stageX(value) ?? p.x)
      case 'teleportInAt': {
        const x = stageX(value)
        return x === null ? p : { ...placed(p, x), teleport: { kind: 'in', age: 0 } }
      }
      case 'teleportOut':
        return p.x === null ? p : { ...p, walkTarget: null, teleport: { kind: 'out', age: 0 } }
      case 'atPlayer':
        return placed(p, playerX(s, other) ?? p.x)
      case 'walkTo':
        return walkTo(p, stageX(value))
      case 'walkToPlayer':
        return walkTo(p, playerX(s, other))
      case 'enterStageLeft': case 'enterStageRight': {
        // modThespian.enterStage*: put at the off-stage spot, then walkTo the entrance
        const side = line.command === 'enterStageLeft' ? 'left' : 'right'
        return walkTo(placed(p, offStageX(s, side)), entranceX(s, side, p.character))
      }
      case 'exitStageLeft':
        return walkTo(p, offStageX(s, 'left'))
      case 'exitStageRight':
        return walkTo(p, offStageX(s, 'right'))
      case 'gotoWings':
        return placed(p, null)
      case 'turnToFace':
        return faceToward(p, playerX(s, other))
      case 'fadeDown':
        return { ...p, fade: transform(p.blend, INVISIBLE, LIGHTS_SPEED) }
      case 'goWastedMode':
        return { ...p, blend: WASTED_BLEND, height: WASTED_HEIGHT }
      default:
        return p
    }
  })
}

const stripOf = (p: CutScenePlayer): CutSceneStrip => (p.walkTarget === null ? 'stand' : 'walk')

/** A player put somewhere (in the wings for null) at once: a walk or teleport stops there, a held prop is let go. */
function placed(p: CutScenePlayer, x: number | null): CutScenePlayer {
  return { ...p, x, walkTarget: null, stripFrames: p.walkTarget === null ? p.stripFrames : 0, holder: null, teleport: null }
}

const castMember = (cast: Cast, character: string): CastMember => cast[character] ?? DEFAULT_CAST_MEMBER

/** Where a prop `holder` holds hangs from its reg point: its propCarryLoc, mirrored when it faces left. */
function carryOffset(s: CutSceneState, holder: CutScenePlayer): Vec {
  const loc = castMember(s.cast, holder.character).propCarryLoc
  return { x: holder.facingLeft ? -loc.x : loc.x, y: loc.y }
}

/** modProp.produceProp: `prop` comes out of the wings (or off the stage) into `holder`'s hand; a prop it held before is put away. */
function produceProp(s: CutSceneState, holder: string, prop: string): CutSceneState {
  const emptyHanded = updateHeldProp(s, holder, (p) => placed(p, null))
  return updatePlayer(emptyHanded, prop, (p) => ({ ...placed(p, null), holder }))
}

/**
 * modProp.dropProp: the prop `holder` holds stands on the stage below its holder (assumed: at the
 * holder's x; in the intro Merlin then walks to the dropped potion in the 37 frames the script gives him).
 */
function dropProp(s: CutSceneState, holder: string): CutSceneState {
  const x = s.players.find((p) => p.character === holder)?.x ?? null
  return updateHeldProp(s, holder, (prop) => placed(prop, x))
}

function updateHeldProp(s: CutSceneState, holder: string, fn: (prop: CutScenePlayer) => CutScenePlayer): CutSceneState {
  return { ...s, players: s.players.map((p) => (p.holder === holder ? fn(p) : p)) }
}

/** modTeleport: a teleport in ends standing; one out ends in the wings. */
function stepTeleport(p: CutScenePlayer): CutScenePlayer {
  if (!p.teleport) return p
  const age = p.teleport.age + 1
  if (age < TELEPORT_TICKS) return { ...p, teleport: { ...p.teleport, age } }
  return p.teleport.kind === 'in' ? { ...p, teleport: null } : placed(p, null)
}

/**
 * modThespian.walkTo -> modMoveToLoc.moveToLoc: the player walks there from where it stands. One in
 * the wings has no stage spot to walk from and is put there (a simplification of the port's).
 */
function walkTo(p: CutScenePlayer, x: number | null): CutScenePlayer {
  if (x === null) return p
  if (p.x === null) return placed(p, x)
  const facingLeft = x === p.x ? p.facingLeft : x < p.x // modMoveToLoc.moveHorizReaction
  return { ...p, walkTarget: x, facingLeft, stripFrames: p.walkTarget === null ? 0 : p.stripFrames }
}

/** modMoveToLoc.update: within the arrival distance the walk ends; else a frame's step toward the target. */
function stepWalk(p: CutScenePlayer, walkSpeed: number): CutScenePlayer {
  const stripFrames = p.stripFrames + 1
  if (p.walkTarget === null || p.x === null) return { ...p, stripFrames }
  const at = { x: p.x, y: 0 }
  const target = { x: p.walkTarget, y: 0 }
  if (arrived(at, target)) return { ...p, walkTarget: null, stripFrames: 0 }
  return { ...p, x: p.x + frameMove(at, target, walkSpeed).x * (1 - WALK_FRICTION), stripFrames }
}

const isRgb = (v: ScriptValue | undefined): v is Rgb => typeof v === 'object' && 'r' in v

/** modThespian.interpretLoc: a number is an x on the stage floor; a point keeps its x here. */
function stageX(v: ScriptValue | undefined): number | null {
  if (typeof v === 'number') return v
  if (typeof v === 'object' && 'x' in v) return v.x
  return null
}

/** objScriptPerformer.calcStageLeftOffLoc / calcStageRightOffLoc. */
const offStageX = (s: CutSceneState, side: 'left' | 'right'): number =>
  side === 'left' ? s.stage.left - OFF_STAGE_DISTANCE : s.stage.right + OFF_STAGE_DISTANCE

/** The player's stage x; a held prop's is its holder's, carried (null in the wings). */
function playerX(s: CutSceneState, character: string | null): number | null {
  const p = s.players.find((q) => q.character === character)
  if (!p || p.holder === null) return p?.x ?? null
  const holder = s.players.find((h) => h.character === p.holder)
  return holder?.x == null ? null : holder.x + carryOffset(s, holder).x
}

/**
 * objScriptPerformer.getStageEntranceOnLoc: halfway between the stage edge and the outermost player
 * on stage (other than the one entering).
 */
function entranceX(s: CutSceneState, side: 'left' | 'right', entering: string): number {
  const centre = (s.stage.left + s.stage.right) / 2
  const xs = s.players.flatMap((p) => (p.x === null || p.character === entering ? [] : [p.x]))
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
