// Port of modWeaponSelector's layout (docs/notes/engine-mechanics-spells.md §3): two palettes of
// 18x16 weapon icons in a row each, the spells centred 20 px above the pointer and the other weapons
// 10 px below it, open for 60 ticks; a click on an icon picks that weapon.
import type { Vec } from './mr-geometry'
import { weaponsIn, type Arsenal, type WeaponGroup } from './mr-weapons'

/** The palette definition's tileSize: one icon (`<weapon>_ws`). */
export const ICON = { w: 18, h: 16 } as const
/** pTimer.tim[2]: the palettes close this many ticks after opening. */
export const SELECTOR_TICKS = 60
/** structWeaponSelectorPaletteTypes with structWeaponSelectorPaletteOffsets: each palette's top above or below the pointer. */
const PALETTES: readonly { group: WeaponGroup; dy: number }[] = [{ group: 'magic', dy: -20 }, { group: 'nonMagic', dy: 10 }]

export interface PaletteIcon {
  key: string
  /** top-left in the coordinates the anchor was given in */
  x: number
  y: number
}

/** constructImage + getPaletteOffset for each palette: its icons left to right, the row centred on `anchor`. */
export function selectorLayout(arsenal: Arsenal, anchor: Vec): PaletteIcon[] {
  const icons: PaletteIcon[] = []
  for (const { group, dy } of PALETTES) {
    const weapons = weaponsIn(arsenal, group)
    const left = anchor.x - (weapons.length * ICON.w) / 2
    weapons.forEach((w, i) => icons.push({ key: w.key, x: left + i * ICON.w, y: anchor.y + dy }))
  }
  return icons
}

/** objPalette selection: the icon under `point`, if any. */
export function iconAt(icons: readonly PaletteIcon[], point: Vec): string | null {
  const hit = icons.find((i) => point.x >= i.x && point.x < i.x + ICON.w && point.y >= i.y && point.y < i.y + ICON.h)
  return hit?.key ?? null
}
