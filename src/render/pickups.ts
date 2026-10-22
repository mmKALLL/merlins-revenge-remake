// Drawing what the pickups do (docs/notes/engine-mechanics-potions.md §5-6): the collected
// writing fading out, Merlin pulsing while invincible, and the HUD's potions drunk (potionMaster)
// and medikit display (objMedikitDisplayer), right-aligned in the strip below the play view.
import { Container, Graphics, Sprite, Text, type Texture } from 'pixi.js'
import type { LoadedSprite } from '../data/loaders'
import type { ActorDef } from '../mr-open/mr-actor-data'
import { WRITING_FADE_TICKS, medikitsHeld } from '../mr-open/mr-pickup'
import type { ActorState, SimState } from '../sim/state'

/** Ticks per alpha pulse of the invincible Merlin (modInvince.pulseWhite; the remake fades instead of whitening). */
const INVINCE_PULSE_TICKS = 10
const INVINCE_MIN_ALPHA = 0.35

/** The sprite alpha for an actor: a collected pickup's writing fades out, an invincible Merlin pulses. */
export function pickupAlpha(s: SimState, a: ActorState): number {
  if (a.mode === 'collected') return Math.max(0, 1 - a.age / WRITING_FADE_TICKS)
  if (a.id !== s.playerId || s.pickups.invinceTicks === 0) return 1
  const wave = (1 + Math.cos((2 * Math.PI * s.tick) / INVINCE_PULSE_TICKS)) / 2
  return INVINCE_MIN_ALPHA + (1 - INVINCE_MIN_ALPHA) * wave
}

/** objMedikitDisplayer and potionMaster spacings in px. */
const LAYOUT = {
  spacer: 1, // between the medikit icon, its bar and its counter
  medikitBarWidth: 6,
  counterDrop: 3, // counters sit this much lower than the icons
  titleDrop: 5, // "POTIONS DRUNK" sits this much lower
  groupGap: 8, // remake: between the medikit display and the potions
}
const MEDIKIT_BAR = { colour: 0x00c800, border: 0x000000, background: 0x202020 } // rgb(0,200,0), 1 px border
const TITLE = { text: 'POTIONS DRUNK', colour: 0xa0a0a0 } // potionMaster pTitleText in #smallgrey
const FONT = { fontFamily: 'monospace', fontSize: 9 }
const COUNTER_COLOUR = 0xffffff

export class PickupHud {
  readonly layer = new Container()
  private drawn = ''

  /** `right` and `top`: the HUD's top-right corner on the logical screen. */
  constructor(
    private sprites: Record<string, LoadedSprite>,
    private defs: Record<string, ActorDef>,
    private right: number,
    private top: number,
  ) {}

  update(s: SimState): void {
    const { potionsDrunk, medikits } = s.pickups
    const key = JSON.stringify([potionsDrunk, medikits.active, medikits.remaining, medikitsHeld(medikits)])
    if (key === this.drawn) return
    this.drawn = key
    for (const c of this.layer.removeChildren()) c.destroy()
    let x = this.right
    // potionMaster.displayAlignRight: last record first, its count then its icon to the left
    for (const { character, count } of [...potionsDrunk].reverse()) {
      x = this.addText(String(count), x, LAYOUT.counterDrop, this.counterColour(character))
      x = this.addIcon(this.frame(this.defs[character]?.name, 'stand'), x)
    }
    if (potionsDrunk.length > 0) x = this.addText(TITLE.text, x, LAYOUT.titleDrop, TITLE.colour) - LAYOUT.groupGap
    this.addMedikitDisplay(s, x)
  }

  /** objMedikitDisplayer, laid out from `right` leftwards: icon, bar, count (the original's left-to-right order). */
  private addMedikitDisplay(s: SimState, right: number): void {
    const { medikits } = s.pickups
    const icon = this.frame('medikit', medikits.active ? 'hudOn' : 'hudOff')
    if (!icon) return
    let x = this.addText(String(medikitsHeld(medikits)), right, LAYOUT.counterDrop, COUNTER_COLOUR) - LAYOUT.spacer
    x -= LAYOUT.medikitBarWidth
    const maxEnergy = this.defs['player']?.maxEnergy ?? 1
    this.layer.addChild(this.medikitBar(x, icon.height, medikits.remaining / maxEnergy))
    this.addIcon(icon, x - LAYOUT.spacer)
  }

  /** objEnergyBar #vertical with a 1 px border: the current kit's hitpoints, filling from the bottom. */
  private medikitBar(x: number, h: number, fraction: number): Graphics {
    const w = LAYOUT.medikitBarWidth
    const inner = h - 2
    const fill = Math.round(Math.max(0, Math.min(1, fraction)) * inner)
    const bar = new Graphics().rect(0, 0, w, h).fill(MEDIKIT_BAR.border).rect(1, 1, w - 2, inner).fill(MEDIKIT_BAR.background)
    if (fill > 0) bar.rect(1, 1 + inner - fill, w - 2, fill).fill(MEDIKIT_BAR.colour)
    bar.position.set(x, this.top)
    return bar
  }

  /** Places a text with its right edge at `right`; returns its left edge. */
  private addText(text: string, right: number, drop: number, colour: number): number {
    const t = new Text({ text, style: { ...FONT, fill: colour } })
    t.position.set(Math.round(right - t.width), this.top + drop)
    this.layer.addChild(t)
    return right - t.width
  }

  /** Places an icon with its right edge at `right`; returns its left edge. */
  private addIcon(tex: Texture | undefined, right: number): number {
    if (!tex) return right
    const spr = new Sprite(tex)
    spr.position.set(Math.round(right - tex.width), this.top)
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
