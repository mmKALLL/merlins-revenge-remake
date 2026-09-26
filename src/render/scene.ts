import { Application, Container, Graphics, Sprite, Text } from 'pixi.js'
import type { LoadedSprite, LoadedTileset } from '../data/loaders'
import type { LayerName, Vec } from '../mr-open/mr-map-format'
import type { SimState } from '../sim/state'
import { TILE_PX } from '../sim/world-grid'
import { cameraOrigin, chooseZoom, type CameraMode, type Size } from './camera'

export interface RenderConfig {
  logical: Size // e.g. 640x320
  playOffset: { x: number; y: number } // where the room area sits on the logical screen, e.g. (32, 0)
  view: Size // play view size in px, e.g. 576x288
  cameraMode: CameraMode
  spriteScale: number // 2: 16 px frames drawn at 32 px
  debug: boolean
}

const TILE_LAYERS: readonly LayerName[] = ['backgroundPassive', 'backgroundActive']

export class Scene {
  readonly app = new Application()
  private world = new Container()
  private layers: Partial<Record<LayerName, Container>> = {}
  private tilePool: Sprite[] = []
  private player = new Sprite()
  private debugText = new Text({ text: '', style: { fill: '#0f0', fontSize: 10, fontFamily: 'monospace' } })
  private lastOrigin: Vec = { x: NaN, y: NaN }
  private onResize = () => this.applyZoom()

  constructor(
    private cfg: RenderConfig,
    private tilesets: Partial<Record<LayerName, LoadedTileset>>,
    private merlin: LoadedSprite,
  ) {}

  /** World pixel shown at the top-left of the play view in the last draw (NaN before the first draw). */
  get origin(): Vec {
    return { ...this.lastOrigin }
  }

  async init(parent: HTMLElement): Promise<void> {
    await this.app.init({
      width: this.cfg.logical.w,
      height: this.cfg.logical.h,
      background: '#000',
      antialias: false,
      roundPixels: true,
    })
    parent.appendChild(this.app.canvas)
    this.world.position.set(this.cfg.playOffset.x, this.cfg.playOffset.y)
    this.app.stage.addChild(this.world)
    // Clip tiles and the player to the play view so nothing spills into the HUD margins.
    const mask = new Graphics().rect(0, 0, this.cfg.view.w, this.cfg.view.h).fill(0xffffff)
    this.world.addChild(mask)
    this.world.mask = mask
    for (const name of TILE_LAYERS) {
      const c = new Container()
      this.layers[name] = c
      this.world.addChild(c)
    }
    this.player.anchor.set(0.5)
    this.player.scale.set(this.cfg.spriteScale)
    this.world.addChild(this.player)
    this.debugText.position.set(2, this.cfg.logical.h - 12)
    this.app.stage.addChild(this.debugText)
    this.applyZoom()
    window.addEventListener('resize', this.onResize)
  }

  destroy(): void {
    window.removeEventListener('resize', this.onResize)
    this.app.destroy()
  }

  applyZoom(): void {
    const z = chooseZoom(this.cfg.logical, { w: window.innerWidth, h: window.innerHeight })
    this.app.canvas.style.width = `${this.cfg.logical.w * z}px`
    this.app.canvas.style.height = `${this.cfg.logical.h * z}px`
  }

  /** alpha in [0,1): how far between the previous and current tick the display is. */
  draw(s: SimState, alpha: number, fps: number): void {
    const p = s.player
    const ipos = { x: p.prevPos.x + (p.pos.x - p.prevPos.x) * alpha, y: p.prevPos.y + (p.pos.y - p.prevPos.y) * alpha }
    const worldSize = { w: s.grid.widthTiles * TILE_PX, h: s.grid.heightTiles * TILE_PX }
    const origin = cameraOrigin(this.cfg.cameraMode, s.grid.roomRectPx(s.room), ipos, this.cfg.view, worldSize)
    if (origin.x !== this.lastOrigin.x || origin.y !== this.lastOrigin.y) {
      this.rebuildTiles(s, origin)
      this.lastOrigin = origin
    }
    const frames = this.merlin.frames[p.anim] ?? this.merlin.frames['stand']!
    this.player.texture = frames[p.animFrame % frames.length]!
    this.player.scale.x = (p.facingLeft ? -1 : 1) * this.cfg.spriteScale
    this.player.position.set(Math.round(ipos.x - origin.x), Math.round(ipos.y - origin.y))
    this.debugText.visible = this.cfg.debug
    if (this.cfg.debug) {
      this.debugText.text =
        `fps ${fps.toFixed(0)} tick ${s.tick} room ${s.room.x},${s.room.y} ` +
        `pos ${p.pos.x.toFixed(1)},${p.pos.y.toFixed(1)} vel ${p.vel.x.toFixed(2)},${p.vel.y.toFixed(2)} cam ${this.cfg.cameraMode}`
    }
  }

  private rebuildTiles(s: SimState, origin: Vec): void {
    let used = 0
    const firstTx = Math.floor(origin.x / TILE_PX) + 1
    const firstTy = Math.floor(origin.y / TILE_PX) + 1
    const cols = Math.ceil(this.cfg.view.w / TILE_PX) + 1
    const rows = Math.ceil(this.cfg.view.h / TILE_PX) + 1
    for (const name of TILE_LAYERS) {
      const container = this.layers[name]!
      container.removeChildren()
      const ts = this.tilesets[name]
      if (!ts) continue
      for (let ty = firstTy; ty < firstTy + rows; ty++) {
        for (let tx = firstTx; tx < firstTx + cols; tx++) {
          const idx = s.grid.tileAt(name, tx, ty)
          if (idx === 0) continue
          const tex = ts.textures[idx - 1]
          if (!tex) continue
          const spr = this.tilePool[used] ?? (this.tilePool[used] = new Sprite())
          used++
          spr.texture = tex
          spr.position.set((tx - 1) * TILE_PX - origin.x, (ty - 1) * TILE_PX - origin.y)
          container.addChild(spr)
        }
      }
    }
  }
}
