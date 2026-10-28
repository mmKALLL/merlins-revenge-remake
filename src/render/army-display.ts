// Merlin's reserve army on the HUD (remake; docs/notes/engine-mechanics-hud.md §6): each unit type
// waiting in the reserve as its stand frame, shrunk to fit, with its count ("x2"). Two layouts to
// compare (Settings, Army display): a column in the right margin, where the original's
// armyMaster.displayNextSummons drew (the prg_armyMaster mark), or a row in the strip above the play
// view, between the current weapon icon and the potions. Hidden while the reserve is empty.
import { Container, Sprite, Text, type Texture } from 'pixi.js'
import type { LoadedSprite } from '../data/loaders'
import type { ActorDef } from '../mr-open/mr-actor-data'
import { GAME_SCREEN } from '../mr-open/mr-hud'
import { playerOf } from '../sim/actors'
import type { SimState } from '../sim/state'
import { armyDisplayEntries, type ArmyDisplayMode, type ArmyEntry } from './army-entries'
import { PIXEL_TEXT } from './text-options'

const FONT = { fontFamily: 'monospace', fontSize: 9, fill: 0xffffff }

/** The right margin: one entry under another, the icon over its count, centred in the margin. */
const COLUMN = {
  iconBox: 26, // the largest icon side; frames are only ever shrunk
  top: GAME_SCREEN.army.y + 4,
  bottom: GAME_SCREEN.army.y + GAME_SCREEN.army.h,
  countGap: 1, // between an icon and its count
  entryGap: 4, // between one entry's count and the next icon
}

/** The weapon icon at the wizard mark is this wide (hud/weapon-selector, 18 x 16). */
const WEAPON_ICON_WIDTH = 18
/** The top strip: entries side by side, each icon with its count to its right. */
const ROW = {
  iconBox: 14,
  top: 1,
  left: GAME_SCREEN.wizard.x + WEAPON_ICON_WIDTH + 8,
  right: GAME_SCREEN.potions.x, // potionMaster's display rect starts here
  countGap: 1,
  countDrop: 3, // counts sit this much lower than the icons' tops, like the medikit counter
  entryGap: 6,
}

export class ArmyDisplay {
  readonly layer = new Container()
  private drawn = ''

  constructor(
    private sprites: Record<string, LoadedSprite>,
    private defs: Record<string, ActorDef>,
    private mode: ArmyDisplayMode,
  ) {}

  setMode(mode: ArmyDisplayMode): void {
    this.mode = mode
  }

  update(s: SimState): void {
    const p = playerOf(s)
    const entries = this.mode === 'off' ? [] : armyDisplayEntries(s.army[p.team], this.defs[p.def]?.armyMembers ?? [])
    const key = `${this.mode} ${entries.map((e) => `${e.typ}:${e.count}`).join(' ')}`
    if (key === this.drawn) return
    this.drawn = key
    for (const c of this.layer.removeChildren()) c.destroy()
    if (this.mode === 'right') this.drawColumn(entries)
    if (this.mode === 'top') this.drawRow(entries)
  }

  /** Stops at the margin's bottom: entries that do not fit are left out. */
  private drawColumn(entries: ArmyEntry[]): void {
    const centre = GAME_SCREEN.army.x + GAME_SCREEN.army.w / 2
    let y = COLUMN.top
    for (const e of entries) {
      const count = this.countText(e.count)
      if (y + COLUMN.iconBox + COLUMN.countGap + count.height > COLUMN.bottom) {
        count.destroy()
        break
      }
      this.addIcon(e.typ, centre - COLUMN.iconBox / 2, y, COLUMN.iconBox)
      y += COLUMN.iconBox + COLUMN.countGap
      count.position.set(Math.round(centre - count.width / 2), y)
      this.layer.addChild(count)
      y += count.height + COLUMN.entryGap
    }
  }

  /** Stops short of the potions: entries that do not fit are left out. */
  private drawRow(entries: ArmyEntry[]): void {
    let x = ROW.left
    for (const e of entries) {
      const count = this.countText(e.count)
      const countX = x + ROW.iconBox + ROW.countGap
      if (countX + count.width > ROW.right) {
        count.destroy()
        break
      }
      this.addIcon(e.typ, x, ROW.top, ROW.iconBox)
      count.position.set(countX, ROW.top + ROW.countDrop)
      this.layer.addChild(count)
      x = Math.ceil(countX + count.width) + ROW.entryGap
    }
  }

  /** The unit's stand frame shrunk to fit a `box` square at (left, top), standing on its bottom, centred across. */
  private addIcon(typ: string, left: number, top: number, box: number): void {
    const tex = this.standFrame(typ)
    if (!tex) return
    const k = Math.min(1, box / tex.width, box / tex.height)
    const spr = new Sprite(tex)
    spr.scale.set(k)
    spr.position.set(Math.round(left + (box - tex.width * k) / 2), Math.round(top + box - tex.height * k))
    this.layer.addChild(spr)
  }

  private countText(n: number): Text {
    return new Text({ text: `x${n}`, ...PIXEL_TEXT, style: FONT })
  }

  private standFrame(typ: string): Texture | undefined {
    const frames = this.sprites[this.defs[typ]?.name ?? '']?.frames
    return frames?.['stand']?.[0] ?? frames?.['walk']?.[0]
  }
}
