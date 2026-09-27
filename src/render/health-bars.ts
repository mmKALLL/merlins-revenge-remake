// Health bars over recently damaged enemies (remake addition, owner request). The original only showed
// a unit's energy while the mouse rolled over it (characterEnergyRollOverMaster, a 4 px tall surround);
// this keeps that small bar but shows it for a while after the unit loses energy. Render-only: damage
// is noticed by comparing each actor's energy with the previous draw, so the simulation is untouched.
import { Container, Graphics, type Sprite } from 'pixi.js'
import type { ActorDef } from '../mr-open/mr-actor-data'
import type { ActorState, SimState } from '../sim/state'

/** How long a bar stays after the last energy loss, and the last part of it that fades out (ticks at 30 Hz). */
const SHOW_TICKS = 90
const FADE_TICKS = 15
/** Bar size in game pixels (the original's rollover surround is 4 px tall: 1 px border around a 2 px bar). */
const BAR_W = 16
const BAR_H = 4
/** Gap between the bar and the top of the sprite. */
const GAP = 2

const NOT_DRAWN = new Set(['objBullet', 'objSpell'])
const GONE_MODES = new Set<ActorState['mode']>(['die', 'dead', 'finish'])

/** Energy fraction 1 -> green, 0 -> red; also used for Merlin's HUD bar. */
export function barColour(f: number): number {
  const r = Math.round(255 * Math.min(1, 2 * (1 - f)))
  const g = Math.round(255 * Math.min(1, 2 * f))
  return (r << 16) | (g << 8)
}

export class HealthBars {
  readonly layer = new Container()
  private lastEnergy = new Map<number, number>()
  private shownUntil = new Map<number, number>()
  private bars = new Map<number, Graphics>()

  constructor(private defs: Record<string, ActorDef>) {}

  /** Call after the actor sprites are positioned for this frame. */
  update(s: SimState, sprites: ReadonlyMap<number, Sprite>): void {
    const seen = new Set<number>()
    for (const a of s.actors) {
      const def = this.defs[a.def]
      if (!def || a.id === s.playerId || NOT_DRAWN.has(def.objType) || def.energy <= 0) continue
      seen.add(a.id)
      const before = this.lastEnergy.get(a.id)
      if (before !== undefined && a.energy < before) this.shownUntil.set(a.id, s.tick + SHOW_TICKS)
      this.lastEnergy.set(a.id, a.energy)
      const left = (this.shownUntil.get(a.id) ?? 0) - s.tick
      const spr = sprites.get(a.id)
      if (left <= 0 || !spr || GONE_MODES.has(a.mode)) {
        this.hide(a.id)
        continue
      }
      const bar = this.barFor(a.id)
      this.paint(bar, a.energy / def.energy)
      const top = spr.y - spr.texture.height * spr.anchor.y * Math.abs(spr.scale.y)
      bar.position.set(Math.round(spr.x - BAR_W / 2), Math.round(top - GAP - BAR_H))
      bar.alpha = Math.min(1, left / FADE_TICKS)
      bar.visible = true
    }
    for (const id of [...this.lastEnergy.keys()]) {
      if (seen.has(id)) continue
      this.lastEnergy.delete(id)
      this.shownUntil.delete(id)
      this.bars.get(id)?.destroy()
      this.bars.delete(id)
    }
  }

  private barFor(id: number): Graphics {
    let bar = this.bars.get(id)
    if (!bar) {
      bar = new Graphics()
      this.bars.set(id, bar)
      this.layer.addChild(bar)
    }
    return bar
  }

  private hide(id: number): void {
    const bar = this.bars.get(id)
    if (bar) bar.visible = false
  }

  private paint(bar: Graphics, fraction: number): void {
    const f = Math.max(0, Math.min(1, fraction))
    const inner = BAR_W - 2
    const fill = Math.round(inner * f)
    bar.clear()
    bar.rect(0, 0, BAR_W, BAR_H).fill(0x000000)
    bar.rect(1, 1, inner, BAR_H - 2).fill(0x333333)
    if (fill > 0) bar.rect(1, 1, fill, BAR_H - 2).fill(barColour(f))
  }
}
