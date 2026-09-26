import { Application, Container, Graphics, Sprite, Text, Texture } from 'pixi.js'
import type { LoadedSprite, LoadedTileset } from '../data/loaders'
import type { ActorDef } from '../mr-open/mr-actor-data'
import { TILE_PX, type Vec } from '../mr-open/mr-geometry'
import type { LayerName } from '../mr-open/mr-map-format'
import { isSpell, playerOf } from '../sim/actors'
import { EXPLODE_TICKS } from '../sim/tick-combat'
import { roomKey, type ActorState, type RoomState, type SimState } from '../sim/state'
import { cameraOrigin, chooseZoom, type CameraMode, type Size } from './camera'

export interface RenderConfig {
  logical: Size // e.g. 640x320
  playOffset: { x: number; y: number } // where the room area sits on the logical screen, e.g. (32, 0)
  view: Size // play view size in px, e.g. 576x288
  cameraMode: CameraMode
  spriteScale: number // 1: frames drawn at native size
  debug: boolean
}

const TILE_LAYERS: readonly LayerName[] = ['backgroundPassive', 'backgroundActive']

/** Engine draw layers (actor data `#layerZ`) -> z within the actor container; unknown layers draw with objects. */
const LAYER_Z: Record<string, number> = { gGameObjectLayer: 0, gPlayerLayer: 1, gGameBulletLayer: 2 }


const BAR = { x: 32, w: 200, h: 8 }

/**
 * The spell frame is a 1-bit black disc on a transparent background. Tint multiplies, so black stays
 * black; Director's 1-bit members take the foreground colour instead. Build a white copy of the disc
 * (any near-white or transparent pixel becomes transparent, everything else opaque white) so the tint
 * gives the charge colour.
 */
function whiteDisc(tex: Texture): Texture {
  const { x, y, width, height } = tex.frame
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return tex
  ctx.drawImage(tex.source.resource as CanvasImageSource, x, y, width, height, 0, 0, width, height)
  const img = ctx.getImageData(0, 0, width, height)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    const blank = d[i + 3]! < 128 || (d[i]! > 200 && d[i + 1]! > 200 && d[i + 2]! > 200)
    d[i] = d[i + 1] = d[i + 2] = 255
    d[i + 3] = blank ? 0 : 255
  }
  ctx.putImageData(img, 0, 0)
  const out = Texture.from(canvas)
  out.source.scaleMode = 'nearest'
  return out
}

/** Energy fraction 1 -> green, 0 -> red. */
function barColour(f: number): number {
  const r = Math.round(255 * Math.min(1, 2 * (1 - f)))
  const g = Math.round(255 * Math.min(1, 2 * f))
  return (r << 16) | (g << 8)
}

export class Scene {
  readonly app = new Application()
  private world = new Container()
  private layers: Partial<Record<LayerName, Container>> = {}
  private tilePool: Sprite[] = []
  /** Graves and actors in world pixels; shifted by -origin each draw. */
  private scrolled = new Container()
  private graveLayer = new Container()
  private actorLayer = new Container()
  private actorSprites = new Map<number, Sprite>()
  private graveKey: { room: string; graves: RoomState['graves'] | null } = { room: '', graves: null }
  private spellTexture: Texture | null = null
  private bar = new Graphics()
  private barFill = -1
  private debugText = new Text({ text: '', style: { fill: '#0f0', fontSize: 10, fontFamily: 'monospace', lineHeight: 11 } })
  private lastOrigin: Vec = { x: NaN, y: NaN }
  private onResize = () => this.applyZoom()

  constructor(
    private cfg: RenderConfig,
    private tilesets: Partial<Record<LayerName, LoadedTileset>>,
    private sprites: Record<string, LoadedSprite>, // by sprite name (ActorDef.name)
    private defs: Record<string, ActorDef>,
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
    // Clip tiles and actors to the play view so nothing spills into the HUD margins.
    const mask = new Graphics().rect(0, 0, this.cfg.view.w, this.cfg.view.h).fill(0xffffff)
    this.world.addChild(mask)
    this.world.mask = mask
    for (const name of TILE_LAYERS) {
      const c = new Container()
      this.layers[name] = c
      this.world.addChild(c)
    }
    // graves above tiles, below every actor
    this.actorLayer.sortableChildren = true
    this.scrolled.addChild(this.graveLayer, this.actorLayer)
    this.world.addChild(this.scrolled)
    const spellFrame = this.sprites[this.defs['spell']?.name ?? '']?.frames['charge']?.[0]
    if (spellFrame) this.spellTexture = whiteDisc(spellFrame)
    const hudY = this.cfg.playOffset.y + this.cfg.view.h // 288: the bottom strip
    this.bar.position.set(BAR.x, hudY + Math.floor((this.cfg.logical.h - hudY - BAR.h) / 2))
    this.app.stage.addChild(this.bar)
    this.debugText.position.set(BAR.x + BAR.w + 8, hudY + 4)
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
    const p = playerOf(s)
    const lerp = (a: ActorState): Vec => ({
      x: a.prevPos.x + (a.pos.x - a.prevPos.x) * alpha,
      y: a.prevPos.y + (a.pos.y - a.prevPos.y) * alpha,
    })
    const ipos = lerp(p)
    const worldSize = { w: s.grid.widthTiles * TILE_PX, h: s.grid.heightTiles * TILE_PX }
    const origin = cameraOrigin(this.cfg.cameraMode, s.grid.roomRectPx(s.room), ipos, this.cfg.view, worldSize)
    if (origin.x !== this.lastOrigin.x || origin.y !== this.lastOrigin.y) {
      this.rebuildTiles(s, origin)
      this.lastOrigin = origin
    }
    this.scrolled.position.set(-origin.x, -origin.y)
    this.syncGraves(s)
    this.syncActors(s, lerp)
    this.drawBar(p.energy / (this.defs[p.def]?.energy || 1))
    this.debugText.visible = this.cfg.debug
    if (this.cfg.debug) {
      this.debugText.text =
        `fps ${fps.toFixed(0)} tick ${s.tick} room ${s.room.x},${s.room.y} actors ${s.actors.length} ` +
        `exits ${s.exitsOpen ? 'open' : 'shut'} cam ${this.cfg.cameraMode}\n` +
        `pos ${p.pos.x.toFixed(1)},${p.pos.y.toFixed(1)} vel ${p.vel.x.toFixed(2)},${p.vel.y.toFixed(2)} ` +
        `energy ${p.energy.toFixed(0)} ${p.mode}`
    }
  }

  private syncActors(s: SimState, lerp: (a: ActorState) => Vec): void {
    const seen = new Set<number>()
    for (const a of s.actors) {
      const def = this.defs[a.def]
      if (!def) continue
      const spell = isSpell(s, a)
      const tex = spell ? this.spellTexture : this.frameFor(def.name, a.anim, a.animFrame)
      if (!tex) continue
      seen.add(a.id)
      let spr = this.actorSprites.get(a.id)
      if (!spr) {
        spr = new Sprite()
        spr.anchor.set(0.5)
        this.actorSprites.set(a.id, spr)
        this.actorLayer.addChild(spr)
      }
      spr.texture = tex
      spr.zIndex = LAYER_Z[def.layerZ] ?? 0
      const pos = lerp(a)
      // Wide frames (attacks) grow toward the facing direction so the back edge stays where the
      // stand frame's back edge is, instead of the body jumping as a centred frame would.
      const shift = spell ? 0 : ((tex.width - this.standWidth(def.name, tex.width)) / 2) * (a.facingLeft ? -1 : 1)
      spr.position.set(Math.round(pos.x + shift * this.cfg.spriteScale), Math.round(pos.y))
      if (spell) {
        // the spell carries its caster's attack (objSpell.setSpellProperties); the sim already
        // multiplied `charge` by chargeExplodeFactor when it switched to explode
        const atk = a.attack ?? def.attack
        const exploding = a.mode === 'explode'
        const size = exploding ? a.charge : a.charge * atk.chargeSize
        const k = size / tex.width
        spr.scale.set(k, k)
        const c = atk.chargeColour
        spr.tint = (c.r << 16) | (c.g << 8) | c.b
        spr.alpha = exploding ? Math.max(0, 1 - a.age / EXPLODE_TICKS) : 1
      } else {
        spr.scale.set((a.facingLeft ? -1 : 1) * this.cfg.spriteScale, this.cfg.spriteScale)
        spr.tint = 0xffffff
        spr.alpha = 1
      }
    }
    for (const [id, spr] of this.actorSprites) {
      if (seen.has(id)) continue
      spr.destroy()
      this.actorSprites.delete(id)
    }
  }

  /** Width of the sprite's stand frame (or first walk frame); `fallback` if it has neither. */
  private standWidth(spriteName: string, fallback: number): number {
    const frames = this.sprites[spriteName]?.frames
    return (frames?.['stand']?.[0] ?? frames?.['walk']?.[0])?.width ?? fallback
  }

  /** Atlas frame for (sprite, anim, frame), falling back to stand, then the first walk frame. */
  private frameFor(spriteName: string, anim: string, frame: number): Texture | undefined {
    const sprite = this.sprites[spriteName]
    if (!sprite) return undefined
    const strip = sprite.frames[anim]
    if (strip && strip.length) return strip[frame % strip.length]
    return sprite.frames['stand']?.[0] ?? sprite.frames['walk']?.[0]
  }

  private syncGraves(s: SimState): void {
    const room = roomKey(s.room)
    const graves = s.rooms[room]?.graves ?? []
    if (this.graveKey.room === room && this.graveKey.graves === graves) return
    this.graveKey = { room, graves }
    for (const c of this.graveLayer.removeChildren()) c.destroy()
    for (const g of graves) {
      const name = this.defs[g.def]?.name
      const tex = name ? this.sprites[name]?.frames['grave']?.[0] : undefined
      if (!tex) continue
      const spr = new Sprite(tex)
      spr.anchor.set(0.5)
      spr.scale.set(this.cfg.spriteScale)
      spr.position.set(Math.round(g.pos.x), Math.round(g.pos.y))
      this.graveLayer.addChild(spr)
    }
  }

  private drawBar(fraction: number): void {
    const f = Math.max(0, Math.min(1, fraction))
    const fill = Math.round(f * BAR.w)
    if (fill === this.barFill) return
    this.barFill = fill
    this.bar.clear()
    this.bar.rect(0, 0, BAR.w, BAR.h).fill(0x202020)
    if (fill > 0) this.bar.rect(0, 0, fill, BAR.h).fill(barColour(f))
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
