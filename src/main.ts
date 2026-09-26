import { needsSprite } from './mr-open/mr-actor-data'
import { loadActors, loadMap, loadSprite, loadTeams, loadTileset, type LoadedSprite } from './data/loaders'
import { InputTracker } from './input/keyboard'
import type { Vec } from './mr-open/mr-geometry'
import { Scene, ZOOM_SETTINGS, type RenderConfig, type ZoomSetting } from './render/scene'
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

function loadZoom(): ZoomSetting {
  try {
    const v = localStorage.getItem(ZOOM_KEY)
    const z = ZOOM_SETTINGS.find((s) => String(s) === v)
    if (z !== undefined) return z
  } catch {
    // storage blocked: use the default
  }
  return 2
}

function saveZoom(z: ZoomSetting): void {
  try {
    localStorage.setItem(ZOOM_KEY, String(z))
  } catch {
    // storage blocked: the choice lasts for this page only
  }
}

/** The 1x..4x / fit buttons below the canvas. */
function setupZoomButtons(scene: Scene, row: HTMLElement): void {
  // keep clicks on the buttons away from the game's mouse input (window listeners) and keyboard focus
  for (const type of ['mousedown', 'mouseup', 'pointerdown', 'pointerup'] as const) {
    row.addEventListener(type, (e) => {
      e.stopPropagation()
      if (type === 'mousedown') e.preventDefault()
    })
  }
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
  const game = row.parentElement
  const gap = game ? parseFloat(getComputedStyle(game).rowGap) || 0 : 0
  const pad = game ? parseFloat(getComputedStyle(game).paddingTop) + parseFloat(getComputedStyle(game).paddingBottom) : 0
  scene.fitReserve = row.offsetHeight + gap + (pad || 0)
  select(loadZoom())
}

async function main(): Promise<void> {
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
  // One atlas per sprite name of every character, bullet and spell (convert-assets checks they exist).
  const spriteNames = [...new Set(Object.values(defs).filter(needsSprite).map((d) => d.name))]
  const sprites: Record<string, LoadedSprite> = {}
  const anims: Record<string, AnimationSet> = {}
  for (const [name, sprite] of await Promise.all(spriteNames.map(async (n) => [n, await loadSprite(n)] as const))) {
    sprites[name] = sprite
    anims[name] = sprite.anims
  }
  if (!sprites[defs['player']!.name]) throw new Error(`no sprite atlas for the player ("${defs['player']!.name}")`)
  // Duplicates TileKey.isSolid on purpose: the browser gets the converted JSON symbols, not the text key.
  const isSolid = (i: number) => i >= 1 && active.data.symbols[i - 1] === 'solid'
  const grid = buildWorldGrid(map, isSolid, objects.data.symbols)
  const playerTile = objects.data.symbols.indexOf('player') + 1 || null
  const startPos = findStartPos(grid, playerTile)
  let sim = createSim(grid, defs, teams, anims, seed, startPos)
  let runSeed = seed

  const scene = new Scene(cfg, { backgroundPassive: passive, backgroundActive: active }, sprites, defs)
  const game = document.getElementById('game') ?? document.body
  const zoomRow = document.getElementById('zoom')
  await scene.init(game)
  if (zoomRow) {
    game.appendChild(zoomRow) // below the canvas
    setupZoomButtons(scene, zoomRow)
  }

  const input = new InputTracker()
  input.attach(window)

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
    const dt = Math.min(250, now - last)
    last = now
    fps = fps * 0.9 + (1000 / Math.max(1, dt)) * 0.1
    acc += dt
    input.setMouseWorld(mouseWorld())
    while (acc >= TICK_MS) {
      sim = stepSim(sim, input.snapshot())
      acc -= TICK_MS
      if (sim.restartRequested) {
        // the player died: start the map again with the loaded assets and a fresh seed
        runSeed = (Math.imul(runSeed ^ (runSeed >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0
        sim = createSim(grid, defs, teams, anims, runSeed, startPos)
      }
    }
    scene.draw(sim, acc / TICK_MS, fps)
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
