// Drawing what the pickups do (docs/notes/engine-mechanics-potions.md §5-6): the collected
// writing fading out, Merlin pulsing while invincible, and the HUD's potions drunk (potionMaster),
// right-aligned in the strip above the play view's right end, and the medikit
// display (objMedikitDisplayer) at that strip's left end, both at their gameScreen marks.
import { Container, Graphics, Sprite, Text, type Texture } from 'pixi.js'
import type { LoadedSprite } from '../data/loaders'
import type { ActorDef } from '../mr-open/mr-actor-data'
import { GAME_SCREEN } from '../mr-open/mr-hud'
import { WRITING_FADE_TICKS, medikitsHeld } from '../mr-open/mr-pickup'
import type { ActorState, SimState } from '../sim/state'
import { PIXEL_TEXT } from './text-options'

/**
 * modInvince.pulseWhite -> modColourTransform: an objTransColor from white to the sprite's normal
 * colour and back (pingpong), 0 -> 100 at speed 10 a tick: ten ticks each way.
 */
const PULSE_WHITE_HALF_TICKS = 10

/** The sprite alpha for an actor: a collected pickup's writing fades out. */
export function pickupAlpha(s: SimState, a: ActorState): number {
  if (a.mode === 'collected') return Math.max(0, 1 - a.age / WRITING_FADE_TICKS)
  return 1
}

/** How white the invincible Merlin is drawn (1 = all white, 0 = normal; pulseWhite), 0 for anyone else. */
export function pulseWhiteness(s: SimState, a: ActorState): number {
  if (a.id !== s.playerId || s.pickups.invinceTicks === 0) return 0
  const phase = s.tick % (2 * PULSE_WHITE_HALF_TICKS)
  const towardNormal = phase < PULSE_WHITE_HALF_TICKS ? phase : 2 * PULSE_WHITE_HALF_TICKS - phase
  return 1 - towardNormal / PULSE_WHITE_HALF_TICKS
}

/** objMedikitDisplayer and potionMaster spacings in px. */
const LAYOUT = {
  spacer: 1, // between the medikit icon, its bar and its counter
  medikitBarWidth: 6,
  counterDrop: 3, // counters sit this much lower than the icons
  titleDrop: 5, // "POTIONS DRUNK" sits this much lower
}
/** potionMaster.displayAlignRight starts from its display rect's top-right corner. */
const POTIONS_TOP_RIGHT = { x: GAME_SCREEN.potions.x + GAME_SCREEN.potions.w, y: GAME_SCREEN.potions.y }
const MEDIKIT_BAR = { colour: 0x00c800, border: 0x000000, background: 0x202020 } // rgb(0,200,0), 1 px border
const TITLE = { text: 'POTIONS DRUNK', colour: 0xa0a0a0 } // potionMaster pTitleText in #smallgrey
const FONT = { fontFamily: 'monospace', fontSize: 9 }
const COUNTER_COLOUR = 0xffffff

export class PickupHud {
  readonly layer = new Container()
  private drawn = ''

  constructor(
    private sprites: Record<string, LoadedSprite>,
    private defs: Record<string, ActorDef>,
  ) {}

  update(s: SimState): void {
    const { potionsDrunk, medikits } = s.pickups
    const key = JSON.stringify([potionsDrunk, medikits.active, medikits.remaining, medikitsHeld(medikits)])
    if (key === this.drawn) return
    this.drawn = key
    for (const c of this.layer.removeChildren()) c.destroy()
    this.addPotionsDrunk(s)
    this.addMedikitDisplay(s)
  }

  /** potionMaster.displayAlignRight: last record first, its count then its icon to the left, then the title. */
  private addPotionsDrunk(s: SimState): void {
    const { potionsDrunk } = s.pickups
    if (potionsDrunk.length === 0) return
    const top = POTIONS_TOP_RIGHT.y
    let x = POTIONS_TOP_RIGHT.x
    for (const { character, count } of [...potionsDrunk].reverse()) {
      x = this.addText(String(count), x, top + LAYOUT.counterDrop, this.counterColour(character))
      x = this.addIcon(this.frame(this.defs[character]?.name, 'stand'), x, top)
    }
    this.addText(TITLE.text, x, top + LAYOUT.titleDrop, TITLE.colour)
  }

  /** objMedikitDisplayer from its display loc rightwards: icon, bar, count. */
  private addMedikitDisplay(s: SimState): void {
    const { medikits } = s.pickups
    const icon = this.frame('medikit', medikits.active ? 'hudOn' : 'hudOff')
    if (!icon) return
    const { x: left, y: top } = GAME_SCREEN.medikit
    const spr = new Sprite(icon)
    spr.position.set(left, top)
    this.layer.addChild(spr)
    const barX = left + icon.width + LAYOUT.spacer
    const maxEnergy = this.defs['player']?.maxEnergy ?? 1
    this.layer.addChild(this.medikitBar(barX, top, icon.height, medikits.remaining / maxEnergy))
    const counter = new Text({ text: String(medikitsHeld(medikits)), ...PIXEL_TEXT, style: { ...FONT, fill: COUNTER_COLOUR } })
    counter.position.set(barX + LAYOUT.medikitBarWidth + LAYOUT.spacer, top + LAYOUT.counterDrop)
    this.layer.addChild(counter)
  }

  /** objEnergyBar #vertical with a 1 px border: the current kit's hitpoints, filling from the bottom. */
  private medikitBar(x: number, top: number, h: number, fraction: number): Graphics {
    const w = LAYOUT.medikitBarWidth
    const inner = h - 2
    const fill = Math.round(Math.max(0, Math.min(1, fraction)) * inner)
    const bar = new Graphics().rect(0, 0, w, h).fill(MEDIKIT_BAR.border).rect(1, 1, w - 2, inner).fill(MEDIKIT_BAR.background)
    if (fill > 0) bar.rect(1, 1 + inner - fill, w - 2, fill).fill(MEDIKIT_BAR.colour)
    bar.position.set(x, top)
    return bar
  }

  /** Places a text with its right edge at `right`; returns its left edge. */
  private addText(text: string, right: number, top: number, colour: number): number {
    const t = new Text({ text, ...PIXEL_TEXT, style: { ...FONT, fill: colour } })
    t.position.set(Math.round(right - t.width), top)
    this.layer.addChild(t)
    return right - t.width
  }

  /** Places an icon with its right edge at `right`; returns its left edge. */
  private addIcon(tex: Texture | undefined, right: number, top: number): number {
    if (!tex) return right
    const spr = new Sprite(tex)
    spr.position.set(Math.round(right - tex.width), top)
    this.layer.addChild(spr)
    return right - tex.width
  }

  private frame(spriteName: string | undefined, strip: string): Texture | undefined {
    return spriteName ? this.sprites[spriteName]?.frames[strip]?.[0] : undefined
  }

  /** objPotion pCounterColour: the potion's #counterColour. */
  private counterColour(character: string): number {
    const c = this.defs[character]?.counterColour
    return c ? (c.r << 16) | (c.g << 8) | c.b : COUNTER_COLOUR
  }
}
