// Remake: the projectiles a volley spell stands for, drawn over the spell while it charges and fires
// (src/sim/volley.ts): mini copies of the projectile stacked diagonally, one per projectile up to
// ICON_STACK_MAX, after objSpellIcons over the summons.
import { Container, Sprite, type Texture } from 'pixi.js'
import type { ActorDef } from '../mr-open/mr-actor-data'
import type { ActorState } from '../sim/state'
import { ICON_PX, ICON_STEP, iconStackPx, volleyIconCount, volleyShotsShown } from '../sim/volley'

/** Per-projectile nudges (px) for icons whose art sits off-centre in their frame (owner: the pin poked out of the ball). */
const ICON_NUDGE: Readonly<Record<string, { x: number; y: number }>> = { smokePin: { x: 0, y: -1 } }

export class VolleyIcons {
  private stacks = new Map<number, { stack: Container; shown: number }>()

  constructor(private layer: Container, private projectileTexture: (def: ActorDef) => Texture | undefined) {}

  /** The stack over volley spell `a` (drawn at `spellSprite`), rebuilt when its count changes; hidden for other spells. */
  sync(a: ActorState, def: ActorDef, bulletDef: ActorDef | undefined, spellSprite: Sprite): void {
    const atk = a.attack ?? def.attack
    const shown = volleyShotsShown(a.mode, a.charge, atk.volley, a.volley)
    const tex = bulletDef ? this.projectileTexture(bulletDef) : undefined
    let entry = this.stacks.get(a.id)
    if (shown === 0 || !tex) {
      if (entry) entry.stack.visible = false
      return
    }
    if (!entry) {
      entry = { stack: new Container(), shown: 0 }
      this.stacks.set(a.id, entry)
      this.layer.addChild(entry.stack)
    }
    if (entry.shown !== shown) {
      entry.stack.removeChildren().forEach((c) => c.destroy())
      layOut(entry.stack, tex, shown)
      entry.shown = shown
    }
    entry.stack.visible = true
    entry.stack.zIndex = spellSprite.zIndex + 1
    // the icons' square is centred on the ball
    const half = iconStackPx(shown) / 2
    const nudge = (bulletDef && ICON_NUDGE[bulletDef.key]) || { x: 0, y: 0 }
    entry.stack.position.set(Math.round(spellSprite.x - half) + nudge.x, Math.round(spellSprite.y - half) + nudge.y)
  }

  /** Drops the stacks of spells no longer drawn (or hidden). */
  prune(seen: ReadonlySet<number>): void {
    for (const [id, { stack }] of this.stacks) {
      if (seen.has(id) && stack.visible) continue
      stack.destroy({ children: true })
      this.stacks.delete(id)
    }
  }
}

/**
 * The icons from the top right: each next one ICON_STEP px left of and below the one before and drawn
 * over it, so the earlier ones peek out at its top right (owner's choice), inside the iconStackPx
 * square from (0, 0).
 */
function layOut(stack: Container, tex: Texture, count: number): void {
  const icons = volleyIconCount(count)
  const side = iconStackPx(count)
  const k = Math.min(1, ICON_PX / Math.max(tex.width, tex.height))
  for (let i = 0; i < icons; i++) {
    const icon = new Sprite(tex)
    icon.scale.set(k)
    const cellX = side - ICON_PX - i * ICON_STEP
    const cellY = i * ICON_STEP
    icon.position.set(cellX + Math.round((ICON_PX - icon.width) / 2), cellY + Math.round((ICON_PX - icon.height) / 2))
    stack.addChild(icon)
  }
}

