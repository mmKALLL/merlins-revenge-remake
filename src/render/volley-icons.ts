// Remake: the projectiles a volley spell stands for, drawn over the spell while it charges and fires
// (src/sim/volley.ts): mini copies of the projectile stacked diagonally, one per projectile up to
// ICON_STACK_MAX and a small black "+" beside the stack for more, after objSpellIcons over the summons.
import { Container, Graphics, Sprite, type Texture } from 'pixi.js'
import type { ActorDef } from '../mr-open/mr-actor-data'
import type { ActorState } from '../sim/state'
import { ICON_PX, ICON_STEP, iconStackPx, volleyIconStack, volleyShotsShown } from '../sim/volley'

/** The "+" for more projectiles than the stack shows: arm length either side of its centre, in game px. */
const PLUS_ARM = 2
/** Gap between the stack and the "+". */
const PLUS_GAP = 1
const PLUS_COLOUR = 0x000000

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
    // the icons' square is centred on the ball; the "+" hangs off its right side
    const half = iconStackPx(shown) / 2
    entry.stack.position.set(Math.round(spellSprite.x - half), Math.round(spellSprite.y - half))
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
 * The icons from the bottom left: each next one ICON_STEP px right of and above the one before and
 * drawn over it, inside the iconStackPx square from (0, 0); the "+" to the right, level with the middle.
 */
function layOut(stack: Container, tex: Texture, count: number): void {
  const { icons, more } = volleyIconStack(count)
  const side = iconStackPx(count)
  const k = Math.min(1, ICON_PX / Math.max(tex.width, tex.height))
  for (let i = 0; i < icons; i++) {
    const icon = new Sprite(tex)
    icon.scale.set(k)
    const cellX = i * ICON_STEP
    const cellY = side - ICON_PX - i * ICON_STEP
    icon.position.set(cellX + Math.round((ICON_PX - icon.width) / 2), cellY + Math.round((ICON_PX - icon.height) / 2))
    stack.addChild(icon)
  }
  if (more) stack.addChild(plusAt(side + PLUS_GAP + PLUS_ARM, Math.floor(side / 2)))
}

/** A 1 px thick "+" centred on (cx, cy). */
function plusAt(cx: number, cy: number): Graphics {
  return new Graphics()
    .rect(cx - PLUS_ARM, cy, PLUS_ARM * 2 + 1, 1)
    .rect(cx, cy - PLUS_ARM, 1, PLUS_ARM * 2 + 1)
    .fill(PLUS_COLOUR)
}
