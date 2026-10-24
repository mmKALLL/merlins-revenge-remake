import { AudioEngine } from './audio/audio'
import { InputLog } from './debug/sim-snapshot'
import { installStateExport } from './debug/state-export'
import { GAME_COMPLETE_SCRIPT, endSequenceView, startEndSequence, stepEndSequence, type EndSequence } from './cutscene/end-sequence'
import { needsSprite, type ActorDef } from './mr-open/mr-actor-data'
import { ARMY_SUMMON } from './mr-open/mr-army'
import {
  loadActors, loadCutScene, loadExitArrows, loadHudTextures, loadMap, loadSprite, loadTeams, loadTileset, loadWeaponSelectorTextures, WEAPON_ICON_KEYS, type LoadedSprite,
} from './data/loaders'
import { framesPerSecond, loadDebugInfo, loadFrameRate, loadLastMap, loadRandomMaps, loadSeedInUrl, loadSpaceMode, loadZoom, saveDebugInfo, saveFrameRate, saveLastMap, saveRandomMaps, saveSeedInUrl, saveSpaceMode, saveZoom } from './data/preferences'
import { LoadQueue } from './data/load-queue'
import { loadBestScores, saveBestScores, withRunScore } from './data/best-scores'
import { browserStore } from './data/favourites'
import { InputTracker } from './input/keyboard'
import { attachTouchControls, wantsTouchControls, type TouchControls } from './input/touch'
import { energyLookup, type EnergyOf } from './gen/floor'
import { ROGUELITE_MAP_ID, currentMapId, generateMap, generateMapSteps, isGeneratedMapId } from './gen/generated-maps'
import { rogueliteFloorMap } from './gen/roguelite-biomes'
import { runStepsAsync } from './gen/steps'
import type { Vec } from './mr-open/mr-geometry'
import { GAME_SCREEN } from './mr-open/mr-hud'
import type { MapDefinition } from './mr-open/mr-map-format'
import type { CameraMode } from './render/camera'
import { CUTSCENE_STAGE_X } from './render/cutscene-overlay'
import { frameCanvas } from './render/dom-sprite'
import { DEFAULT_ZOOM, SPELL_ICONS, Scene, type RenderConfig, type ZoomSetting } from './render/scene'
import { TICK_MS, type AnimationSet, type SimState, type WorldMode } from './sim/state'
import { playerOf } from './sim/actors'
import { carryOver } from './sim/carry-over'
import { holdsScroll } from './sim/rewards'
import { armyKeyAction } from './sim/tick-army'
import { createSim, findStartPos, stepSim } from './sim/tick'
import { buildWorldGrid, type WorldGrid } from './sim/world-grid'
import { PLAY_VIEW } from './sim/view'
import { switchWorldMode } from './sim/world-mode'
import { nextAppState, PLAYING, simRuns, TITLE, visiblePanel, type AppAction, type AppState, type PanelKey } from './ui/app-state'
import { helpPanel } from './ui/help-panel'
import { loadingScreen, type LoadingScreen } from './ui/loading-screen'
import { endRun, enterFloor, nextFloorPlan, startRun, type RunState } from './run/run'
import { rewardPickups, rewardPools, rollRewards } from './run/rewards'
import { floorPick, type PickArt, type PickOffer, type SpriteArt, type UnitArt } from './ui/floor-pick'
import { mapUrl, setupMapBrowser } from './ui/map-browser'
import { mapsPanel } from './ui/maps-panel'
import { menuButton } from './ui/menu-button'
import { MenuOverlay, type MenuPanel } from './ui/overlay'
import { pauseMenu } from './ui/pause-menu'
import { settingsPanel } from './ui/settings-panel'
import { FrameLimiter, TickClock } from './ui/tick-clock'
import { titleScreen } from './ui/title-screen'

const params = new URLSearchParams(location.search)
/** The map Play starts when none has been played yet. */
const DEFAULT_MAP = 'works/mriiidemoiv'
/** A map id from the URL or storage, with an id from before a rename brought up to date. */
const upToDate = (id: string | null): string | null => (id === null ? null : currentMapId(id))
/**
 * A map id is its path under assets/maps without .txt; URLSearchParams decodes %2F. A page opened
 * with ?map= starts that map at once (map links, the Maps menu); without it the title screen shows.
 */
const linkedMap = upToDate(params.get('map'))
const lastPlayedMap = (): string | null => upToDate(loadLastMap())
const seed = Number(params.get('seed')) || (Date.now() >>> 0)

const cfg: RenderConfig = {
  logical: { w: 640, h: 320 },
  playOffset: GAME_SCREEN.map, // the room's top-left on the stage (the score's dd_map_to_play mark)
  view: PLAY_VIEW, // the sim's default SimConfig view too (Space aims on screen)
  cameraMode: params.get('camera') === 'follow' ? 'follow' : 'room',
  spriteScale: 1,
  debug: loadDebugInfo(params.get('debug')),
}
/** The follow camera plays the map as one continuous room (remake feature); the room camera keeps the original rooms. */
const worldModeFor = (camera: CameraMode): WorldMode => (camera === 'follow' ? 'continuous' : 'rooms')
/** The map lists show the best scores of the player's camera, the next run's world mode. */
const scoreModeShown = (): WorldMode => worldModeFor(cfg.cameraMode)

/** Records a query parameter in the URL (without a reload), so reloading the page keeps it; null removes it. */
function rememberParam(name: string, value: string | null): void {
  if (value === null) params.delete(name)
  else params.set(name, value)
  const query = params.toString()
  history.replaceState(history.state, '', `${location.pathname}${query ? `?${query}` : ''}${location.hash}`)
}

/** Whether generated maps put their seed into the URL (a setting, on by default). */
let seedInUrl = loadSeedInUrl()
/** The current generated layout's seed, null before one is built. */
let layoutSeedShown: number | null = null

/** Records a generated layout's seed, in the URL too while seedInUrl is on. */
function rememberSeed(layoutSeed: number): void {
  layoutSeedShown = layoutSeed
  rememberParam('seed', seedInUrl ? String(layoutSeed) : null)
}

/** A generated map for a seed; the seed goes into the URL (no reload) so the layout can be shared. */
function generatedMapWithSeedInUrl(mapId: string, layoutSeed: number, energyOf: EnergyOf): MapDefinition {
  rememberSeed(layoutSeed)
  return generateMap(mapId, layoutSeed, energyOf)
}

/** Work (ms) between the loading screen's repaints while a generated map is built. */
const BUILD_SLICE_MS = 25
const nextFrame = (): Promise<void> => new Promise((resolve) => requestAnimationFrame(() => resolve()))

/** generatedMapWithSeedInUrl, pausing now and then so the loading screen shows the progress (0..1); the same map. */
function buildGeneratedMapWithSeedInUrl(mapId: string, layoutSeed: number, energyOf: EnergyOf, onProgress: (fraction: number) => void): Promise<MapDefinition> {
  rememberSeed(layoutSeed)
  return runStepsAsync(generateMapSteps(mapId, layoutSeed, energyOf), { onProgress, pause: nextFrame, sliceMs: BUILD_SLICE_MS })
}

/** Reports the step under way and how far the whole load has got (0..1), for the loading screen. */
type LoadProgress = (step: string, fraction: number) => void
/** The loading bar: building a generated map fills it up to MAP_SHARE, the asset files up to FILES_END; starting the game is the rest. */
const MAP_SHARE = 0.3
const FILES_END = 0.95

/** Queues a file load so the loading bar counts it as it arrives. */
type TrackLoad = <T>(load: () => Promise<T>) => Promise<T>
/** File loads running at once (a browser opens about six connections to a host anyway). */
const LOADS_AT_ONCE = 6

/** Longest frame the tick loop catches up on (ms); a longer pause (background tab) is dropped. */
const MAX_FRAME_MS = 250
/** Weight of the latest frame in the smoothed fps readout. */
const FPS_NEW_WEIGHT = 0.1

/** A fresh seed for the restart after the player dies, derived from the last one (an integer hash). */
const nextRunSeed = (seed: number): number => (Math.imul(seed ^ (seed >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0

/** Atlases no actor is named after: objSpellIcons' summon stage icons. */
const EFFECT_SPRITES = [SPELL_ICONS]

/** One atlas per sprite name of every character, bullet and spell (convert-assets checks they exist), and the effects'. */
async function loadSprites(defs: Record<string, ActorDef>, track: TrackLoad): Promise<{ sprites: Record<string, LoadedSprite>; anims: Record<string, AnimationSet> }> {
  const spriteNames = [...new Set([...Object.values(defs).filter(needsSprite).map((d) => d.name), ...EFFECT_SPRITES])]
  const sprites: Record<string, LoadedSprite> = {}
  const anims: Record<string, AnimationSet> = {}
  for (const [name, sprite] of await Promise.all(spriteNames.map(async (n) => [n, await track(() => loadSprite(n))] as const))) {
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
  /** Whether a restart of a generated map builds a new layout (Settings, Random maps). */
  newLayoutEachRun: () => boolean
  /** Frames a second to draw (Settings, Frame rate); null: every display refresh. */
  targetFps: () => number | null
  /** The on-screen touch controls, when shown (their weapon button shows the current weapon). */
  touch: TouchControls | null
  /** The loading screen, shown again while a roguelite run builds its next floor. */
  loading: LoadingScreen
  /** Back to the title screen (a roguelite run's death ends the run there). */
  quitToTitle: () => void
  /** Roguelite: pauses on the floor pick until the player has picked a biome and a reward (indices into the offer). */
  pickFloor: (offer: PickOffer, art: PickArt) => Promise<{ biome: number; reward: number }>
}

/** A weapon's selector icon as a URL (the touch weapon button). */
const weaponIconUrl = (key: string): string => `${import.meta.env.BASE_URL}generated/hud/weapon-selector/${key}_ws.png`

/** The pick screen draws the scrolls and potions this many times their size. */
const PICK_ART_SCALE = 2
/** The biome cards' enemy icons are drawn at the whole scale nearest to this many px on their longer side (at least 1x; the page shrinks any larger). */
const UNIT_ICON_PX = 48
/** A unit's icon is the first frame of the first of these strips it has. */
const UNIT_ICON_STRIPS = ['stand', 'altStand', 'walk']

/** A map's world grid and where the player starts on it. */
interface World { grid: WorldGrid; startPos: Vec }

/** A loaded map being played. */
interface Game {
  mapId: string
  scene: Scene
  /**
   * A new run of the same map: with the page's seed again (Restart map), or a fresh one (as after a
   * death). A generated map gets a new layout from a fresh seed either way, unless the Random maps
   * setting keeps the layout.
   */
  restart(seedChoice: 'same' | 'fresh'): void
  /** Switches the camera, and the world mode with it, between ticks. */
  setCamera(camera: CameraMode): void
}

/**
 * Loads a map and its assets (reporting the progress), puts the canvas in #game and starts the
 * frame loop. Every file starts loading as soon as it is known; a generated map is built meanwhile.
 */
async function startGame(mapId: string, shell: Shell, onProgress: LoadProgress): Promise<Game> {
  const { audio, input } = shell
  const generated = isGeneratedMapId(mapId)
  let building = generated // the bar shows the build first, then the files
  const filesFrom = generated ? MAP_SHARE : 0
  let filesShown = filesFrom // files found later add to the count: the bar never goes back
  const showFiles = () => {
    if (building) return
    filesShown = Math.max(filesShown, filesFrom + (FILES_END - filesFrom) * (files.done / files.total))
    onProgress('Loading graphics', filesShown)
  }
  const files = new LoadQueue(LOADS_AT_ONCE, showFiles)
  const track: TrackLoad = (load) => files.add(load)
  onProgress('Loading', 0)
  // the rest loads while the map does; a generated map needs the actors' energies (HP budgets) first
  const dataLoading = track(() => Promise.all([loadTeams(), loadExitArrows(), loadCutScene(GAME_COMPLETE_SCRIPT), loadHudTextures(), loadWeaponSelectorTextures()]))
  const [loaded, defs] = await Promise.all([generated ? null : track(() => loadMap(mapId)), track(loadActors)])
  const spritesLoading = loadSprites(defs, track)
  spritesLoading.catch(() => {}) // a failure surfaces at its await below, unless an earlier step fails first
  const energyOf = energyLookup(defs)
  const mapFor = (layoutSeed: number): MapDefinition => loaded ?? generatedMapWithSeedInUrl(mapId, layoutSeed, energyOf)
  const map = loaded ?? await buildGeneratedMapWithSeedInUrl(mapId, seed, energyOf, (f) => onProgress('Building the map', f * MAP_SHARE))
  building = false
  showFiles()
  const layerTileset = async (layer: string) => {
    const name = map.layers.find((l) => l.name === layer)?.tileSet
    if (!name) throw new Error(`map ${mapId} has no ${layer} layer`)
    try {
      return await track(() => loadTileset(name))
    } catch (e) {
      throw new Error(`map ${mapId} (${layer} layer): ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  const [passive, active, objects, [teams, exitArrows, endScript, hud, weaponTextures]] = await Promise.all([
    layerTileset('backgroundPassive'),
    layerTileset('backgroundActive'),
    layerTileset('objects'),
    dataLoading,
  ])
  const { sprites, anims } = await spritesLoading
  onProgress('Starting', FILES_END)
  if (!sprites[defs['player']!.name]) throw new Error(`no sprite atlas for the player ("${defs['player']!.name}")`)
  // Duplicates TileKey.isSolid on purpose: the browser gets the converted JSON symbols, not the text key.
  const isSolid = (i: number) => i >= 1 && active.data.symbols[i - 1] === 'solid'
  const playerTile = objects.data.symbols.indexOf('player') + 1 || null
  const worldOf = (m: MapDefinition): World => {
    const grid = buildWorldGrid(m, isSolid, objects.data.symbols)
    return { grid, startPos: findStartPos(grid, playerTile) }
  }
  let world = worldOf(map)
  let sim = createSim(world.grid, defs, teams, anims, seed, world.startPos, worldModeFor(cfg.cameraMode))
  // a roguelite run: the map is its first floor; Merlin leaving a floor's exit builds the next one
  let run: RunState | null = mapId === ROGUELITE_MAP_ID ? startRun(seed) : null
  let buildingFloor = false
  audio.handle(sim.events) // the start room's music
  /** the seed in the URL: the layout's, and the sim's for Restart map */
  let pageSeed = seed
  let runSeed = seed
  // the map complete end sequence (fade, cut scene, prompt); the sim stops while it runs
  let ending: EndSequence | null = sim.mapComplete ? startEndSequence() : null
  // the map's best score in the run's world mode (a run with the mode switched has no score): a run
  // counts as its rooms are banked, so a death keeps what it reached
  let bests = loadBestScores(browserStore)
  const recordBest = () => {
    const improved = withRunScore(bests, mapId, sim.worldMode, sim.score)
    if (!improved) return
    bests = improved
    saveBestScores(browserStore, improved)
  }
  const restart = (seedChoice: 'same' | 'fresh' = 'fresh') => {
    const newLayout = loaded === null && shell.newLayoutEachRun()
    runSeed = seedChoice === 'same' && !newLayout ? pageSeed : nextRunSeed(runSeed)
    if (newLayout) pageSeed = runSeed
    // a roguelite run starts again on its first floor, whichever floor it had reached
    if (newLayout || run) {
      world = worldOf(mapFor(pageSeed))
      scene.invalidateTiles()
    }
    if (run) run = startRun(pageSeed)
    buildingFloor = false
    sim = createSim(world.grid, defs, teams, anims, runSeed, world.startPos, worldModeFor(scene.cameraMode))
      audio.handle(sim.events) // the start room's music again
    ending = sim.mapComplete ? startEndSequence() : null
  }
  /** The pick screen's art: a sprite's first frame of an animation. */
  const spriteArt: SpriteArt = (name, anim) => {
    const tex = sprites[name]?.frames[anim]?.[0]
    return tex ? frameCanvas(tex, PICK_ART_SCALE) : null
  }
  /** The biome cards' art: a unit's standing frame, scaled up to about UNIT_ICON_PX. */
  const unitArt: UnitArt = (key) => {
    const frames = sprites[defs[key]?.name ?? '']?.frames
    const strip = frames && UNIT_ICON_STRIPS.find((s) => frames[s]?.length)
    const tex = strip ? frames[strip]![0] : undefined
    if (!tex) return null
    return frameCanvas(tex, Math.max(1, Math.round(UNIT_ICON_PX / Math.max(tex.frame.width, tex.frame.height))))
  }
  const pickArt: PickArt = { sprite: spriteArt, unit: unitArt }
  /**
   * Roguelite: Merlin has left the floor's exit. The game pauses on the pick screen; then the
   * picked biome's floor is built with the picked reward as pickups in its start room (the loading
   * screen shows the progress) and its fresh sim takes his record over. After the last floor the run is won.
   */
  const advanceFloor = async (): Promise<void> => {
    if (!run) return
    const plan = nextFloorPlan(run)
    if (plan === 'won') {
      run = endRun(run, 'won')
      ending = startEndSequence()
      return
    }
    const from = run
    buildingFloor = true
    const rewards = rollRewards(from.seed, plan.floor, rewardPools(plan.options), (scroll) => holdsScroll(sim, scroll))
    const biomes = plan.options.map((b) => ({ name: b.name, showcase: b.showcase }))
    const picked = await shell.pickFloor({ floorNumber: plan.floor + 1, biomes, rewards }, pickArt)
    if (run !== from) return // the run was restarted meanwhile
    const biome = plan.options[picked.biome]!
    const next = await runStepsAsync(rogueliteFloorMap(biome, from.seed, plan.floor, energyOf, rewardPickups(rewards[picked.reward]!)), {
      onProgress: (f) => shell.loading.update('Building the next floor', f),
      pause: nextFrame,
      sliceMs: BUILD_SLICE_MS,
    })
    shell.loading.hide()
    if (run !== from) return // the run was restarted meanwhile
    run = enterFloor(from, plan.floor, biome)
    world = worldOf(next)
    scene.invalidateTiles()
    const fresh = createSim(world.grid, defs, teams, anims, plan.seed, world.startPos, worldModeFor(scene.cameraMode))
    sim = carryOver(sim, fresh)
    audio.handle(sim.events) // the new floor's start music
    buildingFloor = false
  }
  /** Roguelite: a death ends the run; there is no restart of the floor. */
  const endRunInDeath = () => {
    if (run?.status !== 'playing') return
    run = endRun(run, 'dead')
    shell.quitToTitle()
  }
  const restartAfterEnding = () => { if (shell.running() && ending?.phase === 'done') restart() }
  window.addEventListener('keydown', (e) => { if (e.key === 'Enter') restartAfterEnding() })

  const scene = new Scene(cfg, { backgroundPassive: passive, backgroundActive: active }, sprites, defs, exitArrows, hud, weaponTextures)
  await scene.init(document.getElementById('game') ?? document.body)
  const setCamera = (camera: CameraMode) => {
    if (camera === scene.cameraMode) return
    cfg.cameraMode = camera // the map lists show this mode's bests
    scene.setCameraMode(camera)
    sim = switchWorldMode(sim, worldModeFor(camera)) // voids the run's score
    rememberParam('camera', camera)
  }

  const inputLog = new InputLog()
  installStateExport({
    mapId, getGrid: () => world.grid, defs, teams, anims, inputs: inputLog, getSim: () => sim, getSeed: () => runSeed,
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
  // a finger is no mouse: on a touch screen Space's mouse mode has no position (the blast button aims at the nearest enemy)
  canvas.addEventListener('pointermove', (e) => { pointer = e.pointerType === 'touch' ? null : { x: e.clientX, y: e.clientY } })
  canvas.addEventListener('pointerleave', () => { pointer = null })
  canvas.addEventListener('pointerdown', restartAfterEnding)
  /** A client position in stage px (the logical 640x320 screen). */
  const toStage = (client: Vec): Vec => {
    const rect = canvas.getBoundingClientRect()
    const zoom = rect.width / cfg.logical.w
    return { x: (client.x - rect.left) / zoom, y: (client.y - rect.top) / zoom }
  }
  const pointerStage = (): Vec | null => (pointer ? toStage(pointer) : null)
  const mouseWorld = (): Vec | null => {
    const origin = scene.origin
    const at = pointerStage()
    if (!at || Number.isNaN(origin.x)) return null
    return { x: at.x - cfg.playOffset.x + origin.x, y: at.y - cfg.playOffset.y + origin.y }
  }
  // a click on an open weapon palette picks that weapon and charges nothing (objPalette.selectionMade)
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch' || e.button !== 0) return
    const key = scene.pickWeapon(toStage({ x: e.clientX, y: e.clientY }))
    if (key !== null) input.pickWeapon(key)
  })
  /** Merlin on the stage: where the weapon palettes open without a mouse position. */
  const playerStage = (): Vec => {
    const p = playerOf(sim)
    return { x: p.pos.x - scene.origin.x + cfg.playOffset.x, y: p.pos.y - scene.origin.y + cfg.playOffset.y }
  }

  // ticks only while no menu is open; the paused picture stays on the canvas under the menu
  const clock = new TickClock(TICK_MS, MAX_FRAME_MS)
  const limiter = new FrameLimiter(shell.targetFps())
  let fps = 0
  const frame = (now: number) => {
    requestAnimationFrame(frame)
    limiter.fps = shell.targetFps()
    if (!limiter.due(now)) return
    const running = shell.running()
    const { ticks, alpha, dt } = clock.frame(now, running)
    if (!running) {
      scene.present() // the paused picture under the menu, kept up through resizes
      return
    }
    fps = fps * (1 - FPS_NEW_WEIGHT) + (1000 / Math.max(1, dt)) * FPS_NEW_WEIGHT
    const mouse = mouseWorld()
    input.setMouseWorld(mouse)
    if (input.takeCameraToggle()) setCamera(scene.cameraMode === 'room' ? 'follow' : 'room')
    if (input.takeMiniMapToggle()) scene.toggleMiniMap()
    if (input.takeWeaponSelector()) scene.openWeaponSelector(pointerStage() ?? playerStage(), sim.tick)
    for (let i = 0; i < ticks && !buildingFloor; i++) {
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
      recordBest()
      if (sim.mapComplete) ending = startEndSequence()
      if (run && sim.events.some((e) => e.kind === 'floorExit')) {
        advanceFloor().catch((e: unknown) => showError(e, mapId))
        break
      }
      if (sim.restartRequested) {
        if (run) {
          endRunInDeath()
          break
        }
        // the player died: start the map again with the loaded assets and a fresh seed
        restart()
      }
    }
    scene.musicTrack = audio.track
    scene.draw(sim, alpha, fps, mouse, pointerStage())
    shell.touch?.showWeapon(weaponIconUrl(sim.arsenal.current))
    shell.touch?.showArmy(armyKeyAction(sim) !== null)
    shell.touch?.showTarget(input.spaceMode)
    scene.drawEndSequence(ending && endSequenceView(ending))
    scene.present()
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
  void setupMapBrowser(mapList, mapId, scoreModeShown)
}

function main(): void {
  // effects decode in the background; the context resumes on the first key or click
  const audio = new AudioEngine()
  audio.attachUnlock(window)
  void audio.preload()
  const touch = wantsTouchControls(params, window)
  // before any canvas exists: its first (desktop-sized) draw must not widen a phone's layout viewport
  if (touch) document.documentElement.classList.add('touch-controls')
  const input = new InputTracker(loadSpaceMode('nearest'), saveSpaceMode)
  input.attach(window)
  const touchControls = touch ? attachTouchControls(document.body, {
    onChange: (move, blast) => input.setTouch(move, blast),
    onNextWeapon: () => input.nextWeapon(),
    onArmy: () => input.touchArmy(),
    onTarget: () => input.toggleTouchTarget(),
    armyIconUrl: weaponIconUrl(ARMY_SUMMON),
    weaponIconUrls: WEAPON_ICON_KEYS.map(weaponIconUrl),
  }) : null

  // shown from the first paint (index.html); the title screen needs it only once a map loads
  const loading = loadingScreen(document)
  if (!linkedMap) loading.hide()
  let state: AppState = linkedMap ? PLAYING : TITLE
  let game: Game | null = null
  let zoom: ZoomSetting = loadZoom(DEFAULT_ZOOM)
  let randomMaps = loadRandomMaps('newEachRun')
  let frameRate = loadFrameRate('60')
  const mapToPlay = () => linkedMap ?? lastPlayedMap() ?? DEFAULT_MAP
  const pickPanel = floorPick()
  const shell: Shell = {
    audio,
    input,
    running: () => game !== null && simRuns(state),
    newLayoutEachRun: () => randomMaps === 'newEachRun',
    targetFps: () => framesPerSecond(frameRate),
    touch: touchControls,
    loading,
    quitToTitle: () => {
      rememberParam('map', null) // a reload shows the title screen too
      dispatch({ kind: 'quit' })
    },
    pickFloor: (offer, art) => new Promise((resolve) => {
      pickPanel.open(offer, art, (biome, reward) => {
        dispatch({ kind: 'picked' })
        resolve({ biome, reward })
      })
      dispatch({ kind: 'pick' })
    }),
  }

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
      quit: shell.quitToTitle,
    }, () => game?.mapId ?? ''),
    maps: mapsPanel(mapToPlay(), back, scoreModeShown),
    settings: settingsPanel({
      zoom: () => zoom,
      setZoom: (z) => {
        zoom = z
        saveZoom(z)
        game?.scene.setZoom(z)
      },
      camera: () => cfg.cameraMode,
      setCamera: (c) => {
        if (game) game.setCamera(c)
        else {
          cfg.cameraMode = c
          rememberParam('camera', c)
        }
      },
      spaceMode: () => input.spaceMode,
      setSpaceMode: (m) => input.setSpaceMode(m),
      randomMaps: () => randomMaps,
      setRandomMaps: (m) => {
        randomMaps = m
        saveRandomMaps(m)
      },
      seedInUrl: () => seedInUrl,
      setSeedInUrl: (on) => {
        seedInUrl = on
        saveSeedInUrl(on)
        if (layoutSeedShown !== null) rememberSeed(layoutSeedShown)
      },
      frameRate: () => frameRate,
      setFrameRate: (r) => {
        frameRate = r
        saveFrameRate(r)
      },
      debugInfo: () => cfg.debug,
      setDebugInfo: (on) => {
        cfg.debug = on
        saveDebugInfo(on)
        rememberParam('debug', null) // the stored choice holds from now on, over a reload too
        game?.scene.setDebugInfo(on)
      },
      audio,
    }, back),
    help: helpPanel(touch, back),
    floorPick: pickPanel,
  }
  const overlay = new MenuOverlay(document.body, panels)
  menuButton(document.body, () => dispatch({ kind: 'pause' }))

  function render(): void {
    document.documentElement.dataset['screen'] = state.screen
    title.setMap(mapToPlay())
    overlay.show(visiblePanel(state))
    const running = simRuns(state)
    input.setEnabled(running)
    if (!running) touchControls?.release() // the menu covers the controls: no press survives it
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
      game = await startGame(mapId, shell, loading.update)
    } catch (e) {
      showError(e, mapId)
      return false
    }
    loading.hide()
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
