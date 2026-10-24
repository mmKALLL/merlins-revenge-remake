// The roguelite floor's location sign (src/gen/location-sign.ts): the board is tiles on the map; this
// writes the floor's name on it in the original signs' yellow, centred on the board's face, shrunk to
// fit a long name. Rebuilt only when the map changes (a new floor).
import { Container, Text } from 'pixi.js'
import { TILE_PX } from '../mr-open/mr-geometry'
import type { MapDefinition } from '../mr-open/mr-map-format'
import type { WorldGrid } from '../sim/world-grid'
import { PIXEL_TEXT } from './text-options'

/** The original signs' writing colour, rgb(161, 160, 86). */
const WRITING_COLOUR = 0xa1a056
/** The cut scene speech's font (modThespian: Verdana 10 bold), the game's own lettering. */
const STYLE = { fill: WRITING_COLOUR, fontFamily: 'Verdana, sans-serif', fontSize: 10, fontWeight: 'bold' } as const
/** The board's face within its tiles: rows 2-23 of 32, a few px of frame at each end. */
const FACE = { centreY: 12.5, insetX: 5 }

export class LocationSignLayer {
  readonly layer = new Container()
  private map: MapDefinition | null = null

  /** The sign in world pixels; the layer lives in the scrolled container. */
  sync(grid: WorldGrid): void {
    if (grid.map === this.map) return
    this.map = grid.map
    for (const c of this.layer.removeChildren()) c.destroy()
    const sign = grid.map.locationSign
    if (!sign) return
    const room = grid.roomRectPx(sign.room)
    const left = room.left + sign.tile.x * TILE_PX
    const width = sign.width * TILE_PX
    const text = new Text({ text: sign.text, ...PIXEL_TEXT, style: STYLE })
    text.anchor.set(0.5)
    text.scale.set(Math.min(1, (width - 2 * FACE.insetX) / text.width))
    text.position.set(Math.round(left + width / 2), Math.round(room.top + sign.tile.y * TILE_PX + FACE.centreY))
    this.layer.addChild(text)
  }
}
