import { needsSprite } from './mr-open/mr-actor-data'
import { loadActors, loadMap, loadSprite, loadTeams, loadTileset, type LoadedSprite } from './data/loaders'
import { InputTracker } from './input/keyboard'
import type { Vec } from './mr-open/mr-geometry'
import { Scene, type RenderConfig } from './render/scene'
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
