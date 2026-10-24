// Remake: the projectiles a volley spell stands for, drawn over the spell while it charges and fires
// (src/sim/volley.ts): mini copies of the projectile in a row, a group of ICON_GROUP as one icon
// with its number, after objSpellIcons over the summons.
import { Container, Sprite, Text, type Texture } from 'pixi.js'
import type { ActorDef } from '../mr-open/mr-actor-data'
import type { ActorState } from '../sim/state'
import { ICON_GROUP, volleyIconGroups, volleyShotsShown } from '../sim/volley'
import { PIXEL_TEXT } from './text-options'

/** The longest side of a mini projectile, in game px. */
const ICON_PX = 8
/** Gap between icons in the row. */
const ICON_GAP = 1
const GROUP_FONT = { fontFamily: 'monospace', fontSize: 8, fontWeight: 'bold' as const, fill: 0xffffff, stroke: { color: 0x000000, width: 2 } }

export class VolleyIcons {
  private rows = new Map<number, { row: Container; shown: number }>()

  constructor(private layer: Container, private projectileTexture: (def: ActorDef) => Texture | undefined) {}

  /** The row over volley spell `a` (drawn at `spellSprite`), rebuilt when its count changes; hidden for other spells. */
  sync(a: ActorState, def: ActorDef, bulletDef: ActorDef | undefined, spellSprite: Sprite): void {
    const atk = a.attack ?? def.attack
    const shown = volleyShotsShown(a.mode, a.charge, atk.volley, a.volley)
    const tex = bulletDef ? this.projectileTexture(bulletDef) : undefined
    let entry = this.rows.get(a.id)
    if (shown === 0 || !tex) {
      if (entry) entry.row.visible = false
      return
    }
    if (!entry) {
      entry = { row: new Container(), shown: 0 }
      this.rows.set(a.id, entry)
      this.layer.addChild(entry.row)
    }
    if (entry.shown !== shown) {
      entry.row.removeChildren().forEach((c) => c.destroy())
      layOut(entry.row, tex, volleyIconGroups(shown))
      entry.shown = shown
    }
    entry.row.visible = true
    entry.row.zIndex = spellSprite.zIndex + 1
    entry.row.position.set(Math.round(spellSprite.x - entry.row.width / 2), Math.round(spellSprite.y - ICON_PX / 2))
  }

  /** Drops the rows of spells no longer drawn (or hidden). */
  prune(seen: ReadonlySet<number>): void {
    for (const [id, { row }] of this.rows) {
      if (seen.has(id) && row.visible) continue
      row.destroy({ children: true })
      this.rows.delete(id)
    }
  }
}

/** The icons left to right: a mini projectile each, a group's with its number on it. */
function layOut(row: Container, tex: Texture, groups: number[]): void {
  const k = ICON_PX / Math.max(tex.width, tex.height)
  let x = 0
  for (const n of groups) {
    const icon = new Sprite(tex)
    icon.scale.set(Math.min(1, k))
    icon.position.set(x, Math.round((ICON_PX - icon.height) / 2))
    row.addChild(icon)
    let width = icon.width
    if (n === ICON_GROUP) {
      const label = new Text({ text: String(n), ...PIXEL_TEXT, style: GROUP_FONT })
      label.position.set(x + icon.width - 2, ICON_PX - label.height + 2)
      row.addChild(label)
      width = icon.width - 2 + label.width
    }
    x += Math.ceil(width) + ICON_GAP
  }
}
