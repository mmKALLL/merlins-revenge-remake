import { AudioEngine } from './audio/audio'
import { InputLog } from './debug/sim-snapshot'
import { installStateExport } from './debug/state-export'
import { GAME_COMPLETE_SCRIPT, endSequenceView, startEndSequence, stepEndSequence, type EndSequence } from './cutscene/end-sequence'
import { needsSprite, type ActorDef } from './mr-open/mr-actor-data'
import { loadActors, loadCutScene, loadExitArrows, loadMap, loadSprite, loadTeams, loadTileset, type LoadedSprite } from './data/loaders'
import { InputTracker } from './input/keyboard'
import { attachTouchControls, wantsTouchControls } from './input/touch'
import { setupMapBrowser } from './map-browser'
import type { Vec } from './mr-open/mr-geometry'
import type { CameraMode } from './render/camera'
import { CUTSCENE_STAGE_X } from './render/cutscene-overlay'
import { DEFAULT_ZOOM, Scene, ZOOM_SETTINGS, type RenderConfig, type ZoomSetting } from './render/scene'
import { TICK_MS, type AnimationSet, type WorldMode } from './sim/state'
import { createSim, findStartPos, stepSim } from './sim/tick'
import { buildWorldGrid } from './sim/world-grid'
import { PLAY_VIEW } from './sim/view'
import { switchWorldMode } from './sim/world-mode'

const params = new URLSearchParams(location.search)
/** A map id is its path under assets/maps without .txt; URLSearchParams decodes %2F. */
const mapId = params.get('map') ?? 'works/mriiidemoiv'
const seed = Number(params.get('seed')) || (Date.now() >>> 0)

const cfg: RenderConfig = {
  logical: { w: 640, h: 320 },
  playOffset: { x: 32, y: 0 }, // assumption: 32 px side margins; verify against the original stage
  view: PLAY_VIEW, // the sim's default SimConfig view too (Space aims on screen)
  cameraMode: params.get('camera') === 'follow' ? 'follow' : 'room',
  spriteScale: 1,
  debug: params.get('debug') !== '0',
}
/** The follow camera plays the map as one continuous room (remake feature); the room camera keeps the original rooms. */
const worldModeFor = (camera: CameraMode): WorldMode => (camera === 'follow' ? 'continuous' : 'rooms')

/** Records the camera in the URL (without a reload), so reloading the page keeps it. */
function rememberCamera(camera: CameraMode): void {
  params.set('camera', camera)
  history.replaceState(history.state, '', `${location.pathname}?${params}${location.hash}`)
}

const ZOOM_KEY = 'mr-remake.zoom'
/** Longest frame the tick loop catches up on (ms); a longer pause (background tab) is dropped. */
const MAX_FRAME_MS = 250
/** Weight of the latest frame in the smoothed fps readout. */
const FPS_NEW_WEIGHT = 0.1

/** A fresh seed for the restart after the player dies, derived from the last one (an integer hash). */
const nextRunSeed = (seed: number): number => (Math.imul(seed ^ (seed >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0

function loadZoom(fallback: ZoomSetting): ZoomSetting {
  try {
    const v = localStorage.getItem(ZOOM_KEY)
    const z = ZOOM_SETTINGS.find((s) => String(s) === v)
    if (z !== undefined) return z
  } catch {
    // storage blocked: use the default
  }
  return fallback
}

function saveZoom(z: ZoomSetting): void {
  try {
    localStorage.setItem(ZOOM_KEY, String(z))
  } catch {
    // storage blocked: the choice lasts for this page only
  }
}

/**
 * Keeps clicks on the controls away from the game's mouse input (window listeners) and keyboard
 * focus. Sliders need their mousedown default to drag; they give focus back on release instead.
 */
function isolateControls(el: HTMLElement): void {
  for (const type of ['mousedown', 'mouseup', 'pointerdown', 'pointerup'] as const) {
    el.addEventListener(type, (e) => {
      e.stopPropagation()
      if (type === 'mousedown' && !(e.target instanceof HTMLInputElement)) e.preventDefault()
    })
  }
}

/** Music and Effects toggles and the master volume slider next to the zoom buttons. */
function setupSoundControls(audio: AudioEngine, row: HTMLElement): void {
  const toggle = (label: string, title: string, get: () => boolean, set: (on: boolean) => void) => {
    const b = document.createElement('button')
    b.type = 'button'
    b.textContent = label
    b.title = title
    const show = () => b.setAttribute('aria-pressed', String(get()))
    b.addEventListener('click', () => {
      set(!get())
      show()
    })
    show()
    row.appendChild(b)
  }
  toggle('Music', 'Music on/off', () => audio.current.music, (on) => audio.setMusic(on))
  toggle('Effects', 'Sound effects on/off', () => audio.current.effects, (on) => audio.setEffects(on))
  const label = document.createElement('label')
  label.textContent = 'Vol'
  label.title = 'Master volume'
  const slider = document.createElement('input')
  slider.type = 'range'
  slider.min = '0'
  slider.max = '100'
  slider.value = String(audio.current.volume)
  slider.setAttribute('aria-label', 'Master volume')
  slider.addEventListener('input', () => audio.setVolume(Number(slider.value)))
  // hand the keyboard back to the game (Space and the arrows must not stay on the slider)
  for (const type of ['change', 'pointerup'] as const) slider.addEventListener(type, () => slider.blur())
  label.appendChild(slider)
  row.appendChild(label)
}

/**
 * The 1x..4x / fit / scale buttons below the canvas; `reserved` is the controls block kept visible
 * in 'fit' and 'scale' modes. With touch controls the canvas fills the screen instead (the controls
 * scroll below it).
 */
function setupZoomButtons(scene: Scene, row: HTMLElement, reserved: HTMLElement, touch: boolean): void {
  const buttons = ZOOM_SETTINGS.map((z) => {
    const b = document.createElement('button')
    b.type = 'button'
    b.textContent = typeof z === 'number' ? `${z}x` : z
    b.title = z === 'fit' ? 'Largest whole multiple that fits the window'
      : z === 'scale' ? 'Fill the window at any multiple (pixels may be uneven)'
        : `${z} screen pixels per game pixel`
    b.addEventListener('click', () => select(z))
    row.appendChild(b)
    return [z, b] as const
  })
  const select = (z: ZoomSetting) => {
    for (const [bz, b] of buttons) b.setAttribute('aria-pressed', String(bz === z))
    saveZoom(z)
    scene.setZoom(z)
  }
  const game = reserved.parentElement
  const style = game ? getComputedStyle(game) : null
  const gap = style ? parseFloat(style.rowGap) || 0 : 0
  const pad = style ? parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) || 0 : 0
  scene.fitReserve = touch ? 0 : reserved.offsetHeight + gap + pad
  select(loadZoom(DEFAULT_ZOOM))
}

/** One atlas per sprite name of every character, bullet and spell (convert-assets checks they exist). */
async function loadSprites(defs: Record<string, ActorDef>): Promise<{ sprites: Record<string, LoadedSprite>; anims: Record<string, AnimationSet> }> {
  const spriteNames = [...new Set(Object.values(defs).filter(needsSprite).map((d) => d.name))]
  const sprites: Record<string, LoadedSprite> = {}
  const anims: Record<string, AnimationSet> = {}
  for (const [name, sprite] of await Promise.all(spriteNames.map(async (n) => [n, await loadSprite(n)] as const))) {
    sprites[name] = sprite
    anims[name] = sprite.anims
  }
  return { sprites, anims }
}

async function main(): Promise<void> {
  // effects decode in the background; the context resumes on the first key or click
  const audio = new AudioEngine()
  audio.attachUnlock(window)
  void audio.preload()
  const map = await loadMap(mapId)
  const layerTileset = async (layer: string) => {
    const name = map.layers.find((l) => l.name === layer)?.tileSet
    if (!name) throw new Error(`map ${mapId} has no ${layer} layer`)
    try {
      return await loadTileset(name)
    } catch (e) {
      throw new Error(`map ${mapId} (${layer} layer): ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  const [passive, active, objects, defs, teams, exitArrows, endScript] = await Promise.all([
    layerTileset('backgroundPassive'),
    layerTileset('backgroundActive'),
    layerTileset('objects'),
    loadActors(),
    loadTeams(),
    loadExitArrows(),
    loadCutScene(GAME_COMPLETE_SCRIPT),
  ])
  const { sprites, anims } = await loadSprites(defs)
  if (!sprites[defs['player']!.name]) throw new Error(`no sprite atlas for the player ("${defs['player']!.name}")`)
  // Duplicates TileKey.isSolid on purpose: the browser gets the converted JSON symbols, not the text key.
  const isSolid = (i: number) => i >= 1 && active.data.symbols[i - 1] === 'solid'
  const grid = buildWorldGrid(map, isSolid, objects.data.symbols)
  const playerTile = objects.data.symbols.indexOf('player') + 1 || null
  const startPos = findStartPos(grid, playerTile)
  let sim = createSim(grid, defs, teams, anims, seed, startPos, worldModeFor(cfg.cameraMode))
  audio.handle(sim.events) // the start room's music
  let runSeed = seed
  // the map complete end sequence (fade, cut scene, prompt); the sim stops while it runs
  let ending: EndSequence | null = sim.mapComplete ? startEndSequence() : null
  const restart = () => {
    runSeed = nextRunSeed(runSeed)
    sim = createSim(grid, defs, teams, anims, runSeed, startPos, worldModeFor(scene.cameraMode))
    audio.handle(sim.events) // the start room's music again
    ending = sim.mapComplete ? startEndSequence() : null
  }
  const restartAfterEnding = () => { if (ending?.phase === 'done') restart() }
  window.addEventListener('keydown', (e) => { if (e.key === 'Enter') restartAfterEnding() })

  const touch = wantsTouchControls(params, window)
  // before the canvas exists: its first (desktop-sized) draw must not widen a phone's layout viewport
  if (touch) document.documentElement.classList.add('touch-controls')
  const scene = new Scene(cfg, { backgroundPassive: passive, backgroundActive: active }, sprites, defs, exitArrows)
  const game = document.getElementById('game') ?? document.body
  const controls = document.getElementById('controls')
  const zoomRow = document.getElementById('zoom')
  const soundRow = document.getElementById('sound')
  const mapList = document.getElementById('maps')
  await scene.init(game)
  if (controls) {
    game.appendChild(controls) // below the canvas
    isolateControls(controls)
    if (mapList) await setupMapBrowser(mapList, mapId)
    if (soundRow) setupSoundControls(audio, soundRow)
    if (zoomRow) setupZoomButtons(scene, zoomRow, controls, touch)
  }

  const input = new InputTracker()
  input.attach(window)
  if (touch) attachTouchControls(document.body, (move, blast) => input.setTouch(move, blast))
  // shows what Space fires at; F toggles it
  const spaceMode = document.getElementById('space-mode')
  let shownShort: boolean | null = null
  const showSpaceMode = () => {
    if (!spaceMode || shownShort === input.spaceAimsShort) return
    shownShort = input.spaceAimsShort
    const target = shownShort ? 'push-back shot' : 'nearest enemy'
    spaceMode.textContent = touch ? `Blast: ${target} (tap to toggle)` : `Space: ${target} (F to toggle)`
  }
  // there is no F key on a phone: tapping the label toggles instead
  spaceMode?.addEventListener('click', () => input.toggleSpaceShort())
  // shows the camera; C switches it, and the world mode with it, between ticks
  const cameraMode = document.getElementById('camera-mode')
  const showCameraMode = () => {
    if (cameraMode) cameraMode.textContent = `Camera: ${scene.cameraMode} (C)`
  }
  showCameraMode()
  const toggleCamera = () => {
    const camera: CameraMode = scene.cameraMode === 'room' ? 'follow' : 'room'
    scene.setCameraMode(camera)
    sim = switchWorldMode(sim, worldModeFor(camera))
    rememberCamera(camera)
    showCameraMode()
  }

  const inputLog = new InputLog()
  installStateExport({
    mapId, grid, defs, teams, anims, inputs: inputLog, getSim: () => sim, getSeed: () => runSeed,
    restore: (s, seed) => {
      sim = s
      runSeed = seed
      ending = s.mapComplete ? startEndSequence() : null // a loaded moment replaces any running end sequence
      // the camera follows the loaded world mode (switchWorldMode keeps a sim already in it)
      if ((scene.cameraMode === 'follow') !== (s.worldMode === 'continuous')) toggleCamera()
    },
  })

  // Pointer position on the canvas in CSS pixels; converted to world pixels each frame.
  let pointer: Vec | null = null
  const canvas = scene.app.canvas
  canvas.addEventListener('pointermove', (e) => { pointer = { x: e.clientX, y: e.clientY } })
  canvas.addEventListener('pointerleave', () => { pointer = null })
  canvas.addEventListener('pointerdown', restartAfterEnding)
  const mouseWorld = (): Vec | null => {
    const origin = scene.origin
    if (!pointer || Number.isNaN(origin.x)) return null
    const rect = canvas.getBoundingClientRect()
    const zoom = rect.width / cfg.logical.w
    return {
      x: (pointer.x - rect.left) / zoom - cfg.playOffset.x + origin.x,
      y: (pointer.y - rect.top) / zoom - cfg.playOffset.y + origin.y,
    }
  }

  let acc = 0
  let last = performance.now()
  let fps = 0
  const frame = (now: number) => {
    const dt = Math.min(MAX_FRAME_MS, now - last)
    last = now
    fps = fps * (1 - FPS_NEW_WEIGHT) + (1000 / Math.max(1, dt)) * FPS_NEW_WEIGHT
    acc += dt
    input.setMouseWorld(mouseWorld())
    if (input.takeCameraToggle()) toggleCamera()
    while (acc >= TICK_MS) {
      acc -= TICK_MS
      if (ending) {
        const r = stepEndSequence(ending, endScript, CUTSCENE_STAGE_X)
        ending = r.seq
        audio.handle(r.cues)
        continue
      }
      const tickInput = input.snapshot()
      inputLog.push(sim.tick, tickInput)
      sim = stepSim(sim, tickInput)
      audio.handle(sim.events) // every tick stepped this frame, not just the last
      if (sim.mapComplete) ending = startEndSequence()
      // the player died: start the map again with the loaded assets and a fresh seed
      if (sim.restartRequested) restart()
    }
    scene.draw(sim, acc / TICK_MS, fps)
    scene.drawEndSequence(ending && endSequenceView(ending))
    showSpaceMode()
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
}

main().catch((e: unknown) => {
  console.error(e)
  const pre = document.createElement('pre')
  pre.style.color = '#fff'
  pre.style.padding = '16px'
  pre.style.whiteSpace = 'pre-wrap'
  pre.textContent = e instanceof Error ? (e.stack ?? e.message) : String(e)
  // keep the map browser, so another map can be picked from the error page
  const mapList = document.getElementById('maps')
  document.body.replaceChildren(pre)
  if (mapList) {
    pre.after(mapList)
    void setupMapBrowser(mapList, mapId)
  }
})
