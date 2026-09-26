import { loadMap, loadSprite, loadTileset } from './data/loaders'
import { InputTracker } from './input/keyboard'
import type { Vec } from './mr-open/mr-map-format'
import { Scene, type RenderConfig } from './render/scene'
import { TICK_MS } from './sim/state'
import { createSim, findStartPos, stepSim } from './sim/tick'
import { buildWorldGrid } from './sim/world-grid'

const params = new URLSearchParams(location.search)
const mapName = params.get('map') ?? 'mriv_small'

const cfg: RenderConfig = {
  logical: { w: 640, h: 320 },
  playOffset: { x: 32, y: 0 }, // assumption: 32 px side margins; verify against the original stage
  view: { w: 576, h: 288 },
  cameraMode: params.get('camera') === 'follow' ? 'follow' : 'room',
  spriteScale: 2,
  debug: params.get('debug') !== '0',
}

async function main(): Promise<void> {
  const map = await loadMap(mapName)
  const tilesetFor = (layer: string) => {
    const name = map.layers.find((l) => l.name === layer)?.tileSet
    if (!name) throw new Error(`map ${mapName} has no ${layer} layer`)
    return name
  }
  const [passive, active, objects, merlin] = await Promise.all([
    loadTileset(tilesetFor('backgroundPassive')),
    loadTileset(tilesetFor('backgroundActive')),
    loadTileset(tilesetFor('objects')),
    loadSprite('merlin'),
  ])
  // Duplicates TileKey.isSolid on purpose: the browser gets the converted JSON symbols, not the text key.
  const isSolid = (i: number) => i >= 1 && active.data.symbols[i - 1] === 'solid'
  const grid = buildWorldGrid(map, isSolid)
  const playerTile = objects.data.symbols.indexOf('player') + 1 || null
  let sim = createSim(grid, merlin.anims, findStartPos(grid, playerTile))

  const scene = new Scene(cfg, { backgroundPassive: passive, backgroundActive: active }, merlin)
  await scene.init(document.body)

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
    }
    scene.draw(sim, acc / TICK_MS, fps)
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
}

main().catch((e: unknown) => {
  console.error(e)
  document.body.textContent = String(e)
})
