// Health bars under recently damaged enemies (remake addition, owner request). The original showed a
// unit's energy only while the mouse rolled over it (characterEnergyRollOverMaster /
// objMoveableEnergyBar): a 4 px tall bar just below the unit, as wide as its stand frame
// (modEnergy.calcEnergyRectBottom). This keeps that bar but shows it for a while after the unit loses
// energy. Render-only: damage is noticed by comparing each actor's energy with the previous draw.
import { Container, Graphics } from 'pixi.js'
import type { ActorDef } from '../mr-open/mr-actor-data'
import type { Vec } from '../mr-open/mr-geometry'
import type { ActorState, SimState } from '../sim/state'

/** How long a bar stays after the last energy loss (ticks at 30 Hz); it then hides at once. */
const SHOW_TICKS = 90
/** Bar height in game pixels (objMoveableEnergyBar pSurroundHeight: 1 px border around a 2 px bar). */
const BAR_H = 4

const NOT_DRAWN = new Set(['objBullet', 'objSpell'])
const GONE_MODES = new Set<ActorState['mode']>(['die', 'dead', 'finish'])

/** Energy fraction 1 -> green, 0 -> red; also used for Merlin's HUD bar. */
export function barColour(f: number): number {
  const r = Math.round(255 * Math.min(1, 2 * (1 - f)))
  const g = Math.round(255 * Math.min(1, 2 * f))
  return (r << 16) | (g << 8)
}

/** A sprite's stand frame: its size and registration point (the unit's position within it). */
export interface StandBox { w: number; h: number; reg: Vec }

export class HealthBars {
  readonly layer = new Container()
  private lastEnergy = new Map<number, number>()
  private shownUntil = new Map<number, number>()
  private bars = new Map<number, Graphics>()

  constructor(private defs: Record<string, ActorDef>) {}

  /** `posOf` gives the actor's drawn (interpolated) position, `standBox` its sprite's stand frame. */
  update(s: SimState, posOf: (a: ActorState) => Vec, standBox: (spriteName: string) => StandBox | undefined): void {
    const seen = new Set<number>()
    for (const a of s.actors) {
      const def = this.defs[a.def]
      if (!def || a.id === s.playerId || NOT_DRAWN.has(def.objType) || def.energy <= 0) continue
      seen.add(a.id)
      const before = this.lastEnergy.get(a.id)
      if (before !== undefined && a.energy < before) this.shownUntil.set(a.id, s.tick + SHOW_TICKS)
      this.lastEnergy.set(a.id, a.energy)
      const ticksLeft = (this.shownUntil.get(a.id) ?? 0) - s.tick
      const box = standBox(def.name)
      if (ticksLeft <= 0 || !box || GONE_MODES.has(a.mode)) {
        this.hide(a.id)
        continue
      }
      const bar = this.barFor(a.id)
      this.paint(bar, a.energy / def.energy, box.w)
      // the stand frame placed at the unit (mirrored with it), bar starting at its bottom edge
      const pos = posOf(a)
      const x = a.facingLeft ? pos.x - (box.w - box.reg.x) : pos.x - box.reg.x
      bar.position.set(Math.round(x), Math.round(pos.y - box.reg.y + box.h))
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

  private paint(bar: Graphics, fraction: number, width: number): void {
    const f = Math.max(0, Math.min(1, fraction))
    const inner = width - 2
    const fill = Math.round(inner * f)
    bar.clear()
    bar.rect(0, 0, width, BAR_H).fill(0x000000)
    bar.rect(1, 1, inner, BAR_H - 2).fill(0x333333)
    if (fill > 0) bar.rect(1, 1, fill, BAR_H - 2).fill(barColour(f))
  }
}
