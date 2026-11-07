import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { TELEPORT_TICKS } from '../mr-open/mr-army'
import { defs } from '../sim/test-data'
import { cutSceneCast } from './cast'
import {
  BLACK, DEFAULT_CAST_MEMBER, OFF_STAGE_DISTANCE, TIME_BETWEEN_LINES, TITLE_COLOUR, TITLE_DISPLAY_FRAMES, WASTED_BLEND, WASTED_HEIGHT, cutSceneView,
  speechFrames, startCutScene, stepCutScene, type Cast, type CutSceneState,
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

describe('walking (modMoveToLoc)', () => {
  const walker = parseCutScene('characters\n#merlin - m\nlines\nsetStage\nm at 100\nm walkTo 300\nwait 200\n')

  it('walks at 2 px a frame on the walk strip, facing the way it goes, and stands within the arrival distance', () => {
    let s = startCutScene(walker, STAGE).state
    expect(s.players[0]).toMatchObject({ x: 100, walkTarget: 300, facingLeft: false })
    s = stepCutScene(s).state
    expect(s.players[0]!.x).toBe(102)
    expect(cutSceneView(s).players[0]!.strip).toBe('walk')
    ;[s] = runUntil(s, (t) => t.players[0]!.walkTarget === null)
    expect(Math.abs(300 - s.players[0]!.x!)).toBeLessThanOrEqual(5)
    expect(cutSceneView(s).players[0]!.strip).toBe('stand')
  })
})

describe('the game over cut scene (You Got Wasted!)', () => {
  const wasted = parseCutScene(readFileSync('assets/cut-scenes/cut_scene_to_play_when_wasted.txt', 'utf8'))
  const merlin = (s: CutSceneState) => s.players[0]!

  it('goes wasted, enters from off stage right and turns to walk off stage left while the script runs on', () => {
    let s = startCutScene(wasted, STAGE).state
    ;[s] = runUntil(s, (t) => merlin(t).x !== null)
    expect(merlin(s)).toMatchObject({ x: STAGE.right + OFF_STAGE_DISTANCE, blend: WASTED_BLEND, height: WASTED_HEIGHT, facingLeft: true })
    ;[s] = runUntil(s, (t) => merlin(t).walkTarget === STAGE.left - OFF_STAGE_DISTANCE)
    const entrance = (STAGE.right + (STAGE.left + STAGE.right) / 2) / 2 // getStageEntranceOnLoc
    expect(merlin(s).x).toBeGreaterThan(entrance) // "wait 10": still on his way in
    ;[s] = runUntil(s, (t) => cutSceneView(t).speech !== null)
    const speech = cutSceneView(s).speech!
    expect(speech.text).toBe('We must try again!')
    expect(speech.x).toBeGreaterThan(STAGE.left)
    expect(speech.x).toBeLessThan(STAGE.right)
    ;[s] = runUntil(s, (t) => merlin(t).walkTarget === null)
    expect(s.finished).toBe(false)
    expect(Math.abs(merlin(s).x! - (STAGE.left - OFF_STAGE_DISTANCE))).toBeLessThanOrEqual(5)
    ;[s] = runUntil(s, (t) => t.finished)
    expect(merlin(s).blend).toBe(0)
  })
})

it('plays the script\'s sounds and finishes a script without waits at once', () => {
  const { state, cues } = startCutScene(parseCutScene('characters\nlines\nplaySound end_level 100\n'), STAGE)
  expect(cues).toEqual([{ kind: 'sound', name: 'end_level', volume: 100 }])
  expect(state.finished).toBe(true)
})

describe('props (modProp)', () => {
  const props = parseCutScene(
    'characters\n#ochreHydra - o\n#blackPotion - bp\n#whiteScroll - ws\nlines\nsetStage\no at 400\no produceProp bp\nwait 1\no walkTo 300\nwait 20\no dropProp\nwait 1\no produceProp ws\nwait 1\no putAwayProp\nwait 1\n',
  )
  const cast: Cast = { ochreHydra: { ...DEFAULT_CAST_MEMBER, propCarryLoc: { x: 10, y: -10 } } }
  const viewOf = (s: CutSceneState, character: string) => cutSceneView(s).players.find((p) => p.character === character)

  it('a produced prop hangs from its holder at its propCarryLoc (mirrored by facing) and goes where it goes', () => {
    let s = startCutScene(props, STAGE, cast).state
    expect(viewOf(s, 'blackPotion')).toMatchObject({ x: 410, heldBy: { character: 'ochreHydra', carry: { x: 10, y: -10 } } })
    ;[s] = runUntil(s, (t) => t.players[0]!.walkTarget !== null)
    s = stepCutScene(s).state
    const holder = viewOf(s, 'ochreHydra')!
    expect(holder.facingLeft).toBe(true)
    expect(viewOf(s, 'blackPotion')).toMatchObject({ x: holder.x - 10, facingLeft: true, heldBy: { carry: { x: -10, y: -10 } } })
  })

  it('a dropped prop stands on the stage where its holder stood; a put away one goes to the wings', () => {
    let s = startCutScene(props, STAGE, cast).state
    ;[s] = runUntil(s, (t) => t.players.find((p) => p.character === 'blackPotion')!.holder === null)
    const dropped = viewOf(s, 'blackPotion')!
    expect(dropped.heldBy).toBeNull()
    expect(dropped.x).toBe(s.players[0]!.x)
    ;[s] = runUntil(s, (t) => t.finished)
    expect(viewOf(s, 'whiteScroll')).toBeUndefined()
    expect(viewOf(s, 'blackPotion')).toBeDefined()
  })
})

describe('teleports (modTeleport)', () => {
  const teleports = parseCutScene('characters\n#ulin - u\nlines\nsetStage\nu teleportInAt 50\nwait 30\nu teleportOut\nwait 30\n')

  it('teleportInAt stretches the player in at its spot and teleportOut out to the wings, each over TELEPORT_TICKS', () => {
    let s = startCutScene(teleports, STAGE).state
    expect(cutSceneView(s).players[0]).toMatchObject({ x: 50, teleport: { kind: 'in', age: 0 } })
    let frames: number
    ;[s, frames] = runUntil(s, (t) => t.players[0]!.teleport === null)
    expect(frames).toBe(TELEPORT_TICKS)
    ;[s] = runUntil(s, (t) => t.players[0]!.teleport?.kind === 'out')
    ;[s, frames] = runUntil(s, (t) => t.players[0]!.x === null)
    expect(frames).toBe(TELEPORT_TICKS)
  })
})

describe('the cast (act_<character> data)', () => {
  it('walks each player at its own #walkSpeed and faces it by #initFaceDir', () => {
    const cast = cutSceneCast(defs)
    expect(cast['ochreHydra']!.propCarryLoc).toEqual({ x: 10, y: -10 })
    const script = parseCutScene('characters\n#ulin - u\nlines\nsetStage\nu at 300\nu walkTo 100\nwait 10\n')
    let s = startCutScene(script, STAGE, cast).state
    expect(s.players[0]!.facingLeft).toBe(true)
    s = stepCutScene(s).state
    expect(s.players[0]!.x).toBe(299) // act_ulin #walkSpeed 2, halved by the walking friction
  })
})

describe('the MR3 intro (mr3IntroFull)', () => {
  const intro = parseCutScene(readFileSync('assets/cut-scenes/mr3IntroFull.txt', 'utf8'))

  it('plays to its end: the potion swap, the powerup sound and both teleports, then the lights go down', () => {
    const started = startCutScene(intro, STAGE, cutSceneCast(defs))
    let s = started.state
    const cues = [...started.cues]
    let swapped = false
    let teleported = false
    for (let i = 0; i < 40000 && !s.finished; i++) {
      const r = stepCutScene(s)
      s = r.state
      cues.push(...r.cues)
      const hp = s.players.find((p) => p.character === 'horriblePotion')!
      swapped ||= hp.x !== null && hp.fade !== null
      teleported ||= s.players.some((p) => p.teleport !== null)
    }
    expect(s.finished).toBe(true)
    expect(swapped).toBe(true)
    expect(teleported).toBe(true)
    expect(cues).toEqual([{ kind: 'sound', name: 'collect_powerup_01', volume: 255 }])
    expect(s.players.every((p) => p.blend === 0 || p.x === null)).toBe(true)
  })
})
