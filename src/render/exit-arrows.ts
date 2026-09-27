// The current room's exit arrows (objRoom.drawExitArrows paints them onto the room image, so they
// sit above the tiles and below every actor). Rebuilt only when the room, its exits or the rooms'
// state change.
import { Container, Sprite } from 'pixi.js'
import type { ExitArrowTextures } from '../data/loaders'
import { exitArrowsFor } from '../sim/exit-arrows'
import { roomKey, type SimState } from '../sim/state'

export class ExitArrowLayer {
  readonly layer = new Container()
  private key: { room: string; open: boolean; mode: SimState['worldMode'] | null; rooms: SimState['rooms'] | null } =
    { room: '', open: false, mode: null, rooms: null }

  constructor(private textures: ExitArrowTextures | null) {}

  /** Arrows in world pixels; the layer lives in the scrolled container. */
  sync(s: SimState): void {
    const room = roomKey(s.room)
    const k = this.key
    if (k.room === room && k.open === s.exitsOpen && k.mode === s.worldMode && k.rooms === s.rooms) return
    this.key = { room, open: s.exitsOpen, mode: s.worldMode, rooms: s.rooms }
    for (const c of this.layer.removeChildren()) c.destroy()
    if (!this.textures) return
    for (const a of exitArrowsFor(s)) {
      const spr = new Sprite(this.textures[a.colour][a.edge])
      spr.position.set(a.pos.x, a.pos.y)
      this.layer.addChild(spr)
    }
  }
}
