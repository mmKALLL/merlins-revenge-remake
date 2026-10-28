// Remake: the golden machine gun's weapon selector icon. The engine never put the gun in the
// palette (it was a mode, not a weapon; docs/notes/engine-mechanics-spells.md §6), so there is no
// gmg_ws member: the icon is the gun of its scroll (gmg_scroll, a picture of the gun) shrunk onto
// the black of the other weapon icons.
import { PNG } from 'pngjs'
import { miniature, paint } from './volley-scroll-art'

/** The weapon selector's icon size (modWeaponSelector's palette tileSize) and where the gun is fitted in it. */
const ICON = { w: 18, h: 16 }
const GUN_FIT = { cx: 9, cy: 8, w: 16, h: 14, coverage: 0.3 }
const BACKGROUND = [0, 0, 0, 255]

/** The gun icon from its scroll's picture (white or transparent around the gun). */
export function gmgIcon(scroll: PNG): PNG {
  const icon = new PNG({ width: ICON.w, height: ICON.h })
  for (let o = 0; o < icon.data.length; o += 4) icon.data.set(BACKGROUND, o)
  paint(icon, miniature(scroll, GUN_FIT), GUN_FIT.cx, GUN_FIT.cy)
  return icon
}
