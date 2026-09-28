import { AudioEngine } from './audio/audio'
import { InputLog } from './debug/sim-snapshot'
import { installStateExport } from './debug/state-export'
import { GAME_COMPLETE_SCRIPT, endSequenceView, startEndSequence, stepEndSequence, type EndSequence } from './cutscene/end-sequence'
import { needsSprite, type ActorDef } from './mr-open/mr-actor-data'
import { loadActors, loadCutScene, loadExitArrows, loadMap, loadSprite, loadTeams, loadTileset, type LoadedSprite } from './data/loaders'
import { loadLastMap, loadZoom, saveLastMap, saveZoom } from './data/preferences'
import { InputTracker } from './input/keyboard'
import { attachTouchControls, wantsTouchControls } from './input/touch'
import { generateMap, isGeneratedMapId } from './gen/generated-maps'
import type { Vec } from './mr-open/mr-geometry'
import type { MapDefinition } from './mr-open/mr-map-format'
import type { CameraMode } from './render/camera'
import { CUTSCENE_STAGE_X } from './render/cutscene-overlay'
import { DEFAULT_ZOOM, Scene, type RenderConfig, type ZoomSetting } from './render/scene'
import { TICK_MS, type AnimationSet, type WorldMode } from './sim/state'
import { createSim, findStartPos, stepSim } from './sim/tick'
import { buildWorldGrid } from './sim/world-grid'
import { PLAY_VIEW } from './sim/view'
import { switchWorldMode } from './sim/world-mode'
import { nextAppState, PLAYING, simRuns, TITLE, visiblePanel, type AppAction, type AppState, type PanelKey } from './ui/app-state'
import { helpPanel } from './ui/help-panel'
import { mapUrl, setupMapBrowser } from './ui/map-browser'
import { mapsPanel } from './ui/maps-panel'
import { menuButton } from './ui/menu-button'
import { MenuOverlay, type MenuPanel } from './ui/overlay'
import { pauseMenu } from './ui/pause-menu'
import { settingsPanel } from './ui/settings-panel'
import { TickClock } from './ui/tick-clock'
import { titleScreen } from './ui/title-screen'

const params = new URLSearchParams(location.search)
/** The map Play starts when none has been played yet. */
const DEFAULT_MAP = 'works/mriiidemoiv'
/**
 * A map id is its path under assets/maps without .txt; URLSearchParams decodes %2F. A page opened
 * with ?map= starts that map at once (map links, the Maps menu); without it the title screen shows.
 */
const linkedMap = params.get('map')
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

/** Records a query parameter in the URL (without a reload), so reloading the page keeps it; null removes it. */
function rememberParam(name: string, value: string | null): void {
  if (value === null) params.delete(name)
  else params.set(name, value)
  const query = params.toString()
  history.replaceState(history.state, '', `${location.pathname}${query ? `?${query}` : ''}${location.hash}`)
}

/** A generated floor for the seed; the seed goes into the URL (no reload) so the floor can be shared. */
function generatedMapWithSeedInUrl(mapId: string): MapDefinition {
  rememberParam('seed', String(seed))
  return generateMap(mapId, seed)
}

/** Longest frame the tick loop catches up on (ms); a longer pause (background tab) is dropped. */
const MAX_FRAME_MS = 250
/** Weight of the latest frame in the smoothed fps readout. */
const FPS_NEW_WEIGHT = 0.1

/** A fresh seed for the restart after the player dies, derived from the last one (an integer hash). */
const nextRunSeed = (seed: number): number => (Math.imul(seed ^ (seed >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0

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

/** What a running game takes from the page. */
interface Shell {
  audio: AudioEngine
  input: InputTracker
  /** Whether the simulation advances (no menu open). */
  running: () => boolean
}

/** A loaded map being played. */
interface Game {
  mapId: string
  scene: Scene
  /** A new run of the same map: with the page's seed again (Restart map), or a fresh one (as after a death). */
  restart(seedChoice: 'same' | 'fresh'): void
  /** Switches the camera, and the world mode with it, between ticks. */
  setCamera(camera: CameraMode): void
}

/** Loads a map and its assets, puts the canvas in #game and starts the frame loop. */
async function startGame(mapId: string, shell: Shell): Promise<Game> {
  const { audio, input } = shell
  const map = isGeneratedMapId(mapId) ? generatedMapWithSeedInUrl(mapId) : await loadMap(mapId)
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
  const restart = (seedChoice: 'same' | 'fresh' = 'fresh') => {
    runSeed = seedChoice === 'same' ? seed : nextRunSeed(runSeed)
    sim = createSim(grid, defs, teams, anims, runSeed, startPos, worldModeFor(scene.cameraMode))
    audio.handle(sim.events) // the start room's music again
    ending = sim.mapComplete ? startEndSequence() : null
  }
  const restartAfterEnding = () => { if (shell.running() && ending?.phase === 'done') restart() }
  window.addEventListener('keydown', (e) => { if (e.key === 'Enter') restartAfterEnding() })

  const scene = new Scene(cfg, { backgroundPassive: passive, backgroundActive: active }, sprites, defs, exitArrows)
  await scene.init(document.getElementById('game') ?? document.body)
  const setCamera = (camera: CameraMode) => {
    if (camera === scene.cameraMode) return
    scene.setCameraMode(camera)
    sim = switchWorldMode(sim, worldModeFor(camera))
    rememberParam('camera', camera)
  }

  const inputLog = new InputLog()
  installStateExport({
    mapId, grid, defs, teams, anims, inputs: inputLog, getSim: () => sim, getSeed: () => runSeed,
    restore: (s, seed) => {
      sim = s
      runSeed = seed
      ending = s.mapComplete ? startEndSequence() : null // a loaded moment replaces any running end sequence
      // the camera follows the loaded world mode (switchWorldMode keeps a sim already in it)
      setCamera(s.worldMode === 'continuous' ? 'follow' : 'room')
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

  // ticks only while no menu is open; the paused picture stays on the canvas under the menu
  const clock = new TickClock(TICK_MS, MAX_FRAME_MS)
  let fps = 0
  const frame = (now: number) => {
    requestAnimationFrame(frame)
    const running = shell.running()
    const { ticks, alpha, dt } = clock.frame(now, running)
    if (!running) return
    fps = fps * (1 - FPS_NEW_WEIGHT) + (1000 / Math.max(1, dt)) * FPS_NEW_WEIGHT
    input.setMouseWorld(mouseWorld())
    if (input.takeCameraToggle()) setCamera(scene.cameraMode === 'room' ? 'follow' : 'room')
    for (let i = 0; i < ticks; i++) {
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
    scene.draw(sim, alpha, fps)
    scene.drawEndSequence(ending && endSequenceView(ending))
  }
  requestAnimationFrame(frame)
  return { mapId, scene, restart, setCamera }
}

/** Replaces the page with the error, keeping a map browser so another map can be picked. */
function showError(e: unknown, mapId: string): void {
  console.error(e)
  const pre = document.createElement('pre')
  pre.style.color = '#fff'
  pre.style.padding = '16px'
  pre.style.whiteSpace = 'pre-wrap'
  pre.textContent = e instanceof Error ? (e.stack ?? e.message) : String(e)
  const mapList = document.createElement('ul')
  mapList.id = 'maps'
  document.documentElement.dataset['screen'] = 'error'
  document.body.replaceChildren(pre, mapList)
  void setupMapBrowser(mapList, mapId)
}

function main(): void {
  // effects decode in the background; the context resumes on the first key or click
  const audio = new AudioEngine()
  audio.attachUnlock(window)
  void audio.preload()
  const touch = wantsTouchControls(params, window)
  // before any canvas exists: its first (desktop-sized) draw must not widen a phone's layout viewport
  if (touch) document.documentElement.classList.add('touch-controls')
  const input = new InputTracker()
  input.attach(window)
  if (touch) attachTouchControls(document.body, (move, blast) => input.setTouch(move, blast))

  let state: AppState = linkedMap ? PLAYING : TITLE
  let game: Game | null = null
  let zoom: ZoomSetting = loadZoom(DEFAULT_ZOOM)
  const mapToPlay = () => linkedMap ?? loadLastMap() ?? DEFAULT_MAP
  const shell: Shell = { audio, input, running: () => game !== null && simRuns(state) }

  const back = () => dispatch({ kind: 'back' })
  const title = titleScreen({
    play: () => void play(),
    open: (panel) => dispatch({ kind: 'open', panel }),
  })
  const panels: Record<PanelKey, MenuPanel> = {
    title,
    pause: pauseMenu({
      resume: () => dispatch({ kind: 'resume' }),
      open: (panel) => dispatch({ kind: 'open', panel }),
      restart: () => {
        game?.restart('same')
        dispatch({ kind: 'resume' })
      },
      quit: () => {
        rememberParam('map', null) // a reload shows the title screen too
        dispatch({ kind: 'quit' })
      },
    }, () => game?.mapId ?? ''),
    maps: mapsPanel(mapToPlay(), back),
    settings: settingsPanel({
      zoom: () => zoom,
      setZoom: (z) => {
        zoom = z
        saveZoom(z)
        game?.scene.setZoom(z)
      },
      camera: () => game?.scene.cameraMode ?? cfg.cameraMode,
      setCamera: (c) => {
        if (game) game.setCamera(c)
        else {
          cfg.cameraMode = c
          rememberParam('camera', c)
        }
      },
      spaceShort: () => input.spaceAimsShort,
      setSpaceShort: (on) => { if (on !== input.spaceAimsShort) input.toggleSpaceShort() },
      audio,
    }, back),
    help: helpPanel(touch, back),
  }
  const overlay = new MenuOverlay(document.body, panels)
  menuButton(document.body, () => dispatch({ kind: 'pause' }))

  function render(): void {
    document.documentElement.dataset['screen'] = state.screen
    title.setMap(mapToPlay())
    overlay.show(visiblePanel(state))
    const running = simRuns(state)
    input.setEnabled(running)
    audio.setPaused(!running)
    // no menu button keeps the focus while playing: Space and Enter belong to the game
    if (running && document.activeElement instanceof HTMLElement) document.activeElement.blur()
  }

  function dispatch(action: AppAction): void {
    if (action.kind === 'pause' && !game) return // still loading
    state = nextAppState(state, action)
    render()
  }

  async function play(): Promise<void> {
    const mapId = mapToPlay()
    audio.setPaused(false) // inside the click: browsers start audio only from a user gesture
    // a generated floor gets a fresh seed in a fresh page (mapUrl drops the seed)
    if (game?.mapId === mapId && !isGeneratedMapId(mapId)) {
      game.restart('fresh')
      rememberParam('map', mapId)
      dispatch({ kind: 'play' })
      return
    }
    if (game || isGeneratedMapId(mapId)) {
      location.assign(mapUrl(mapId)) // one map per page: another map loads in a fresh page
      return
    }
    title.setLoading(true)
    rememberParam('map', mapId)
    if (!(await load(mapId))) return
    title.setLoading(false)
    dispatch({ kind: 'play' })
  }

  /** Starts a map; false (with the error on the page) when it failed to load. */
  async function load(mapId: string): Promise<boolean> {
    try {
      game = await startGame(mapId, shell)
    } catch (e) {
      showError(e, mapId)
      return false
    }
    game.scene.setZoom(zoom)
    saveLastMap(mapId)
    return true
  }

  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.repeat) return
    e.preventDefault()
    dispatch({ kind: state.screen === 'playing' ? 'pause' : 'back' })
  })

  render()
  if (linkedMap) void load(linkedMap).then(render)
}

main()
