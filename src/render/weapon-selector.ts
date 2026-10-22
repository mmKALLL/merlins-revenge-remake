// Merlin's weapons on screen (docs/notes/engine-mechanics-spells.md §3): the weaponSelector
// palettes (Q, modWeaponSelector: the spells above the pointer, the other weapons below it, the
// green box on the current weapon, the yellow box under the pointer, closing after 2 s or on a
// pick), and (remake) the current weapon's icon in the strip above the play view.
import { Container, Sprite, Texture } from 'pixi.js'
import type { WeaponSelectorTextures } from '../data/loaders'
import type { Vec } from '../mr-open/mr-geometry'
import { GAME_SCREEN } from '../mr-open/mr-hud'
import { SELECTOR_TICKS, iconAt, selectorLayout, type PaletteIcon } from '../mr-open/mr-weapon-selector'
import type { Arsenal } from '../mr-open/mr-weapons'

export class WeaponSelectorLayer {
  /** on the stage, above the HUD */
  readonly layer = new Container()
  private current = new Sprite()
  private palette = new Container()
  private open: { anchor: Vec; tick: number } | null = null
  private icons: PaletteIcon[] = []
  private drawnKey = ''

  constructor(private textures: WeaponSelectorTextures | null) {
    this.current.position.set(GAME_SCREEN.wizard.x, GAME_SCREEN.wizard.y)
    this.layer.addChild(this.current, this.palette)
  }

  /** displayWeaponSelector: opens the palettes around `anchor` (stage px) unless already open. */
  show(anchor: Vec, tick: number): void {
    if (this.open) return
    this.open = { anchor, tick }
  }

  get isOpen(): boolean { return this.open !== null }

  /** objPalette.selectionMade: the weapon under `point` (stage px) while open; the palettes close on a pick. */
  pick(point: Vec): string | null {
    if (!this.open) return null
    const key = iconAt(this.icons, point)
    if (key !== null) this.open = null
    return key
  }

  /** Redraws for this frame; the palettes close SELECTOR_TICKS after opening (pTimer). */
  update(arsenal: Arsenal, tick: number, pointer: Vec | null): void {
    if (this.open && tick - this.open.tick >= SELECTOR_TICKS) this.open = null
    this.current.texture = this.iconFor(arsenal.current) ?? Texture.EMPTY
    this.icons = this.open ? selectorLayout(arsenal, this.open.anchor) : []
    const hover = pointer && this.open ? iconAt(this.icons, pointer) : null
    const key = JSON.stringify([this.icons, arsenal.current, hover])
    if (key === this.drawnKey) return
    this.drawnKey = key
    for (const c of this.palette.removeChildren()) c.destroy()
    for (const icon of this.icons) {
      this.addAt(this.iconFor(icon.key), icon)
      if (icon.key === arsenal.current) this.addAt(this.textures?.greenBox, icon)
      if (icon.key === hover) this.addAt(this.textures?.yellowBox, icon)
    }
  }

  private iconFor(key: string): Texture | undefined {
    return this.textures?.icons[key]
  }

  /** An icon or a selection box (both ICON-sized members) with its top-left at `at`. */
  private addAt(tex: Texture | undefined, at: Vec): void {
    if (!tex) return
    const spr = new Sprite(tex)
    spr.position.set(Math.round(at.x), Math.round(at.y))
    this.palette.addChild(spr)
  }
}
