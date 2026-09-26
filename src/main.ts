import { AudioEngine } from './audio/audio'
import { needsSprite, type ActorDef } from './mr-open/mr-actor-data'
import { loadActors, loadMap, loadMapIndex, loadSprite, loadTeams, loadTileset, type LoadedSprite } from './data/loaders'
import { InputTracker } from './input/keyboard'
import type { Vec } from './mr-open/mr-geometry'
import { DEFAULT_ZOOM, Scene, ZOOM_SETTINGS, type RenderConfig, type ZoomSetting } from './render/scene'
import { TICK_MS, type AnimationSet } from './sim/state'
import { createSim, findStartPos, stepSim } from './sim/tick'
import { buildWorldGrid } from './sim/world-grid'

const params = new URLSearchParams(location.search)
const mapName = params.get('map') ?? 'mriv_small'
const seed = Number(params.get('seed')) || (Date.now() >>> 0)

const cfg: RenderConfig = {
  logical: { w: 640, h: 320 },
  playOffset: { x: 32, y: 0 }, // assumption: 32 px side margins; verify against the original stage
  view: { w: 576, h: 288 },
  cameraMode: params.get('camera') === 'follow' ? 'follow' : 'room',
  spriteScale: 1,
  debug: params.get('debug') !== '0',
}

const ZOOM_KEY = 'mr-remake.zoom'
/** Longest frame the tick loop catches up on (ms); a longer pause (background tab) is dropped. */
const MAX_FRAME_MS = 250
/** Weight of the latest frame in the smoothed fps readout. */
const FPS_NEW_WEIGHT = 0.1

/** A fresh seed for the restart after the player dies, derived from the last one (an integer hash). */
const nextRunSeed = (seed: number): number => (Math.imul(seed ^ (seed >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0

function loadZoom(): ZoomSetting {
  try {
    const v = localStorage.getItem(ZOOM_KEY)
    const z = ZOOM_SETTINGS.find((s) => String(s) === v)
    if (z !== undefined) return z
  } catch {
    // storage blocked: use the default
  }
  return DEFAULT_ZOOM
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

/** The 1x..4x / fit buttons below the canvas; `reserved` is the controls block kept visible in 'fit' mode. */
function setupZoomButtons(scene: Scene, row: HTMLElement, reserved: HTMLElement): void {
  const buttons = ZOOM_SETTINGS.map((z) => {
    const b = document.createElement('button')
    b.type = 'button'
    b.textContent = z === 'fit' ? 'fit' : `${z}x`
    b.title = z === 'fit' ? 'Largest whole multiple that fits the window' : `${z} screen pixels per game pixel`
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
  scene.fitReserve = reserved.offsetHeight + gap + pad
  select(loadZoom())
}

/** Map list next to the zoom buttons: each entry reloads the page with ?map=<name>, keeping other params. */
async function setupMapList(list: HTMLElement): Promise<void> {
  let maps
  try {
    maps = await loadMapIndex()
  } catch (e) {
    console.warn('map list unavailable:', e)
    list.hidden = true
    return
  }
  let current: HTMLElement | null = null
  for (const m of maps) {
    const q = new URLSearchParams(location.search)
    q.set('map', m.name)
    const a = document.createElement('a')
    a.href = `?${q.toString()}${location.hash}`
    a.textContent = `${m.name} (${m.mapSize.x}x${m.mapSize.y})`
    const li = document.createElement('li')
    li.appendChild(a)
    list.appendChild(li)
    if (m.name === mapName) {
      a.setAttribute('aria-current', 'page')
      current = li
    }
  }
  // scroll the list (not the page) so the current map shows; #maps is position: relative
  if (current) list.scrollTop = current.offsetTop - (list.clientHeight - current.offsetHeight) / 2
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
  const map = await loadMap(mapName)
  const tilesetFor = (layer: string) => {
    const name = map.layers.find((l) => l.name === layer)?.tileSet
    if (!name) throw new Error(`map ${mapName} has no ${layer} layer`)
    return name
  }
  const [passive, active, objects, defs, teams] = await Promise.all([
    loadTileset(tilesetFor('backgroundPassive')),
    loadTileset(tilesetFor('backgroundActive')),
    loadTileset(tilesetFor('objects')),
    loadActors(),
    loadTeams(),
  ])
  const { sprites, anims } = await loadSprites(defs)
  if (!sprites[defs['player']!.name]) throw new Error(`no sprite atlas for the player ("${defs['player']!.name}")`)
  // Duplicates TileKey.isSolid on purpose: the browser gets the converted JSON symbols, not the text key.
  const isSolid = (i: number) => i >= 1 && active.data.symbols[i - 1] === 'solid'
  const grid = buildWorldGrid(map, isSolid, objects.data.symbols)
  const playerTile = objects.data.symbols.indexOf('player') + 1 || null
  const startPos = findStartPos(grid, playerTile)
  let sim = createSim(grid, defs, teams, anims, seed, startPos)
  audio.handle(sim.events) // the start room's music
  let runSeed = seed

  const scene = new Scene(cfg, { backgroundPassive: passive, backgroundActive: active }, sprites, defs)
  const game = document.getElementById('game') ?? document.body
  const controls = document.getElementById('controls')
  const zoomRow = document.getElementById('zoom')
  const soundRow = document.getElementById('sound')
  const mapList = document.getElementById('maps')
  await scene.init(game)
  if (controls) {
    game.appendChild(controls) // below the canvas
    isolateControls(controls)
    if (mapList) await setupMapList(mapList)
    if (soundRow) setupSoundControls(audio, soundRow)
    if (zoomRow) setupZoomButtons(scene, zoomRow, controls)
  }

  const input = new InputTracker()
  input.attach(window)
  // shows what Space fires at; F toggles it
  const spaceMode = document.getElementById('space-mode')
  let shownShort: boolean | null = null
  const showSpaceMode = () => {
    if (!spaceMode || shownShort === input.spaceAimsShort) return
    shownShort = input.spaceAimsShort
    spaceMode.textContent = `Space: ${shownShort ? 'push-back shot' : 'nearest enemy'} (F to toggle)`
  }

  // Pointer position on the canvas in CSS pixels; converted to world pixels each frame.
  let pointer: Vec | null = null
  const canvas = scene.app.canvas
  canvas.addEventListener('pointermove', (e) => { pointer = { x: e.clientX, y: e.clientY } })
  canvas.addEventListener('pointerleave', () => { pointer = null })
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
    while (acc >= TICK_MS) {
      sim = stepSim(sim, input.snapshot())
      audio.handle(sim.events) // every tick stepped this frame, not just the last
      acc -= TICK_MS
      if (sim.restartRequested) {
        // the player died: start the map again with the loaded assets and a fresh seed
        runSeed = nextRunSeed(runSeed)
        sim = createSim(grid, defs, teams, anims, runSeed, startPos)
        audio.handle(sim.events) // the start room's music again
      }
    }
    scene.draw(sim, acc / TICK_MS, fps)
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
  document.body.replaceChildren(pre)
})
