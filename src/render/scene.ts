import { Application, Container, Graphics, Sprite, Text, Texture } from 'pixi.js'
import type { ExitArrowTextures, LoadedSprite, LoadedTileset } from '../data/loaders'
import type { ActorDef } from '../mr-open/mr-actor-data'
import { TILE_PX, type Vec } from '../mr-open/mr-geometry'
import type { LayerName } from '../mr-open/mr-map-format'
import { isSpell, isStepped, playerOf } from '../sim/actors'
import { sleepingFrame } from '../sim/anim'
import { EXPLODE_TICKS } from '../sim/tick-spell'
import { roomKey, type ActorState, type SimState } from '../sim/state'
import { cameraOrigin, chooseZoom, type CameraMode, type Size } from './camera'
import type { EndSequenceView } from '../cutscene/end-sequence'
import { CutSceneOverlay, type CharacterFrame } from './cutscene-overlay'
import { ExitArrowLayer } from './exit-arrows'
import { barColour, HealthBars, type StandBox } from './health-bars'

export interface RenderConfig {
  logical: Size // e.g. 640x320
  playOffset: { x: number; y: number } // where the room area sits on the logical screen, e.g. (32, 0)
  view: Size // play view size in px, e.g. 576x288
  cameraMode: CameraMode
  spriteScale: number // 1: frames drawn at native size
  debug: boolean
}

/**
 * CSS pixels per game pixel; 'fit': the largest whole multiple that fits the window; 'scale': fills
 * the window at any (non-integer) multiple, keeping the aspect ratio.
 */
export type ZoomSetting = 1 | 2 | 3 | 4 | 'fit' | 'scale'
export const ZOOM_SETTINGS: readonly ZoomSetting[] = [1, 2, 3, 4, 'fit', 'scale']
export const DEFAULT_ZOOM: ZoomSetting = 'scale'

const TILE_LAYERS: readonly LayerName[] = ['backgroundPassive', 'backgroundActive']

/** Engine draw layers (actor data `#layerZ`) -> z within the actor container; unknown layers draw with objects. */
const LAYER_Z: Record<string, number> = { gGameObjectLayer: 0, gPlayerLayer: 1, gGameBulletLayer: 2 }

/** The player's energy bar in the HUD strip below the play view: x, size and empty colour. */
const BAR = { x: 32, w: 200, h: 8, background: 0x202020 }
/** The debug readout sits right of the bar: gap to the bar, offset from the HUD strip's top. */
const DEBUG_TEXT = { gap: 8, top: 4 }
const NO_TINT = 0xffffff
/** Cut scene characters drawn with an actor's sprite under another key (#merlin plays as the player). */
const CUTSCENE_ACTOR: Record<string, string> = { merlin: 'player' }

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
  private healthBars: HealthBars
  private exitArrows: ExitArrowLayer
  /** Bullet rotation by actor id: the last non-zero velocity's angle, kept once the bullet lands. */
  private bulletAngles = new Map<number, number>()
  private graveKey: { room: string; rooms: SimState['rooms'] | null } = { room: '', rooms: null }
  private spellTexture: Texture | null = null
  private bar = new Graphics()
  private barFill = -1
  private cutScene: CutSceneOverlay | null = null
  private debugText = new Text({ text: '', style: { fill: '#0f0', fontSize: 10, fontFamily: 'monospace', lineHeight: 11 } })
  private lastOrigin: Vec = { x: NaN, y: NaN }
  private onResize = () => this.applyZoom()
  private zoom: ZoomSetting = DEFAULT_ZOOM

  constructor(
    private cfg: RenderConfig,
    private tilesets: Partial<Record<LayerName, LoadedTileset>>,
    private sprites: Record<string, LoadedSprite>, // by sprite name (ActorDef.name)
    private defs: Record<string, ActorDef>,
    exitArrows: ExitArrowTextures | null = null,
  ) {
    this.healthBars = new HealthBars(defs)
    this.exitArrows = new ExitArrowLayer(exitArrows)
  }

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
    // exit arrows (painted on the room image) and graves above tiles, below every actor
    this.actorLayer.sortableChildren = true
    this.scrolled.addChild(this.exitArrows.layer, this.graveLayer, this.actorLayer, this.healthBars.layer)
    this.world.addChild(this.scrolled)
    const spellFrame = this.sprites[this.defs['spell']?.name ?? '']?.frames['charge']?.[0]
    if (spellFrame) this.spellTexture = whiteDisc(spellFrame)
    const hudY = this.cfg.playOffset.y + this.cfg.view.h // top of the HUD strip below the play view
    this.bar.position.set(BAR.x, hudY + Math.floor((this.cfg.logical.h - hudY - BAR.h) / 2))
    this.app.stage.addChild(this.bar)
    this.debugText.position.set(BAR.x + BAR.w + DEBUG_TEXT.gap, hudY + DEBUG_TEXT.top)
    this.app.stage.addChild(this.debugText)
    this.cutScene = new CutSceneOverlay(this.cfg.logical, (character) => this.cutSceneFrame(character))
    this.app.stage.addChild(this.cutScene.layer)
    this.applyZoom()
    window.addEventListener('resize', this.onResize)
  }

  destroy(): void {
    window.removeEventListener('resize', this.onResize)
    this.app.destroy()
  }

  get cameraMode(): CameraMode { return this.cfg.cameraMode }
  /** Switches between the room camera and the follow camera from the next draw on. */
  setCameraMode(mode: CameraMode): void {
    this.cfg = { ...this.cfg, cameraMode: mode }
  }

  setZoom(zoom: ZoomSetting): void {
    this.zoom = zoom
    this.applyZoom()
  }

  /**
   * Fixed multipliers are CSS pixels, so browser zoom scales the canvas on top of them;
   * 'fit' and 'scale' fill the window instead (whole and fractional multiples).
   */
  applyZoom(): void {
    const room = { w: window.innerWidth, h: window.innerHeight }
    const z = this.zoom === 'fit'
      ? chooseZoom(this.cfg.logical, room)
      : this.zoom === 'scale'
        ? Math.max(0.25, Math.min(room.w / this.cfg.logical.w, room.h / this.cfg.logical.h))
        : this.zoom
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
    this.exitArrows.sync(s)
    this.syncGraves(s)
    this.syncActors(s, lerp)
    this.healthBars.update(s, lerp, (name) => this.standBox(name))
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

  /** The end sequence over the whole screen (the game fading out, the cut scene, the prompt); null hides it. */
  drawEndSequence(view: EndSequenceView | null): void {
    this.cutScene?.draw(view)
  }

  /** A cut scene character's stand frame: the sprite of the actor with its key (or its stand-in). */
  private cutSceneFrame(character: string): CharacterFrame | undefined {
    const name = this.defs[CUTSCENE_ACTOR[character] ?? character]?.name
    const texture = name ? this.frameFor(name, 'stand', 0) : undefined
    if (!name || !texture) return undefined
    return { texture, reg: this.regFor(name, 'stand', 0) ?? { x: texture.width / 2, y: texture.height / 2 } }
  }

  private syncActors(s: SimState, lerp: (a: ActorState) => Vec): void {
    const seen = new Set<number>()
    for (const a of s.actors) {
      const def = this.defs[a.def]
      if (!def) continue
      const spell = isSpell(s, a)
      // a sleeper of a continuous world is left untouched by the sim (unless it walks an idle
      // wander, animated by the sim); its stand strip loops here
      const frame = isStepped(a) ? a.animFrame : sleepingFrame(s.anims[def.name]?.[a.anim], s.tick)
      const tex = spell ? this.spellTexture : this.frameFor(def.name, a.anim, frame)
      if (!tex) continue
      seen.add(a.id)
      const spr = this.actorSprite(a.id)
      spr.texture = tex
      spr.zIndex = LAYER_Z[def.layerZ] ?? 0
      const pos = lerp(a)
      // Wide frames (attacks) grow toward the facing direction so the back edge stays where the
      // stand frame's back edge is, instead of the body jumping as a centred frame would.
      const bullet = def.objType === 'objBullet'
      // Frames with a known reg point (extracted with their Director member) hang from it, which also
      // keeps a wide attack frame's body in place; frames without one are centred.
      const reg = spell ? undefined : this.regFor(def.name, a.anim, frame)
      spr.anchor.set(reg ? reg.x / tex.width : 0.5, reg ? reg.y / tex.height : 0.5)
      const shift = spell || bullet || reg ? 0 : ((tex.width - this.standWidth(def.name, tex.width)) / 2) * (a.facingLeft ? -1 : 1)
      spr.position.set(Math.round(pos.x + shift * this.cfg.spriteScale), Math.round(pos.y))
      if (spell) this.styleSpell(spr, a, def, tex)
      else if (bullet) this.styleBullet(spr, a)
      else this.styleCharacter(spr, a)
    }
    for (const [id, spr] of this.actorSprites) {
      if (seen.has(id)) continue
      spr.destroy()
      this.actorSprites.delete(id)
      this.bulletAngles.delete(id)
    }
  }

  /** The actor's sprite, created on its first draw. */
  private actorSprite(id: number): Sprite {
    let spr = this.actorSprites.get(id)
    if (!spr) {
      spr = new Sprite()
      spr.anchor.set(0.5)
      this.actorSprites.set(id, spr)
      this.actorLayer.addChild(spr)
    }
    return spr
  }

  /**
   * The white disc scaled to the charge and tinted with the attack's chargeColour, fading out while
   * it explodes. The spell carries its caster's attack (objSpell.setSpellProperties); the sim already
   * multiplied `charge` by chargeExplodeFactor when it switched to explode.
   */
  private styleSpell(spr: Sprite, a: ActorState, def: ActorDef, tex: Texture): void {
    const atk = a.attack ?? def.attack
    const exploding = a.mode === 'explode'
    const size = exploding ? a.charge : a.charge * atk.chargeSize
    const k = size / tex.width
    spr.scale.set(k, k)
    const c = atk.chargeColour
    spr.tint = (c.r << 16) | (c.g << 8) | c.b
    spr.alpha = exploding ? Math.max(0, 1 - a.age / EXPLODE_TICKS) : 1
    spr.rotation = 0
  }

  /** modRotational #once: turned to the launch velocity, never mirrored; the art points along +x. */
  private styleBullet(spr: Sprite, a: ActorState): void {
    if (a.vel.x !== 0 || a.vel.y !== 0) this.bulletAngles.set(a.id, Math.atan2(a.vel.y, a.vel.x))
    spr.rotation = this.bulletAngles.get(a.id) ?? 0
    spr.scale.set(this.cfg.spriteScale)
    spr.tint = NO_TINT
    spr.alpha = 1
  }

  /** Characters mirror to face left. */
  private styleCharacter(spr: Sprite, a: ActorState): void {
    spr.rotation = 0
    spr.scale.set((a.facingLeft ? -1 : 1) * this.cfg.spriteScale, this.cfg.spriteScale)
    spr.tint = NO_TINT
    spr.alpha = 1
  }

  /** Width of the sprite's stand frame (or first walk frame); `fallback` if it has neither. */
  private standWidth(spriteName: string, fallback: number): number {
    const frames = this.sprites[spriteName]?.frames
    return (frames?.['stand']?.[0] ?? frames?.['walk']?.[0])?.width ?? fallback
  }

  /** The stand frame's size and registration point (centre when the atlas records none). */
  private standBox(spriteName: string): StandBox | undefined {
    const tex = this.frameFor(spriteName, 'stand', 0)
    if (!tex) return undefined
    const reg = this.regFor(spriteName, 'stand', 0) ?? { x: tex.width / 2, y: tex.height / 2 }
    return { w: tex.width, h: tex.height, reg }
  }

  /** Atlas frame for (sprite, anim, frame), falling back to stand, then the first walk frame. */
  private frameFor(spriteName: string, anim: string, frame: number): Texture | undefined {
    const sprite = this.sprites[spriteName]
    if (!sprite) return undefined
    const strip = sprite.frames[anim]
    if (strip && strip.length) return strip[frame % strip.length]
    return sprite.frames['stand']?.[0] ?? sprite.frames['walk']?.[0]
  }

  /** The frame's registration point when the atlas records one (same frame choice as frameFor). */
  private regFor(spriteName: string, anim: string, frame: number): Vec | undefined {
    const sprite = this.sprites[spriteName]
    if (!sprite) return undefined
    const strip = sprite.frames[anim]
    if (strip && strip.length) return sprite.regs[anim]?.[frame % strip.length]
    return sprite.frames['stand'] ? sprite.regs['stand']?.[0] : sprite.regs['walk']?.[0]
  }

  /** The current room's graves, or every room's in a continuous world. */
  private syncGraves(s: SimState): void {
    const room = roomKey(s.room)
    if (this.graveKey.room === room && this.graveKey.rooms === s.rooms) return
    this.graveKey = { room, rooms: s.rooms }
    const graves = s.worldMode === 'continuous' ? Object.values(s.rooms).flatMap((r) => r.graves) : (s.rooms[room]?.graves ?? [])
    for (const c of this.graveLayer.removeChildren()) c.destroy()
    for (const g of graves) {
      const name = this.defs[g.def]?.name
      const tex = name ? this.sprites[name]?.frames['grave']?.[0] : undefined
      if (!tex) continue
      const spr = new Sprite(tex)
      const reg = name ? this.sprites[name]?.regs['grave']?.[0] : undefined
      spr.anchor.set(reg ? reg.x / tex.width : 0.5, reg ? reg.y / tex.height : 0.5)
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
    this.bar.rect(0, 0, BAR.w, BAR.h).fill(BAR.background)
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
