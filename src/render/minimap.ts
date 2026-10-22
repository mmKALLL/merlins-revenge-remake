// The mini-map over the play view (modMiniMap.displayMiniMap; docs/notes/engine-mechanics-minimap.md):
// the map image hangs from its bottom-right corner at the room's bottom-right corner
// (objRoom.getMiniMapLoc), at #scale, and fades as Merlin or the mouse comes near that corner. In
// the continuous world (remake) a yellow cell-sized marker slides over the cells where the view is.
import { Container, Graphics } from 'pixi.js'
import type { Vec } from '../mr-open/mr-geometry'
import { CELL_IMAGES, CURRENT_COLOUR, MINI_MAP, cellOrigin, fitScale, miniMapBlend, miniMapImageSize, type CellImage, type MiniMapCell } from '../mr-open/mr-minimap'
import { miniMapCells, miniMapShown } from '../sim/minimap'
import type { SimState } from '../sim/state'
import type { Size } from './camera'

const PERCENT = 100
const BACKGROUND = 0x000000

/** Where the view is, for the blend and the continuous world's marker; positions in play view px. */
export interface MiniMapViewInfo {
  player: Vec
  mouse: Vec | null
  /** world px at the view's top-left */
  origin: Vec
  roomPx: Size
}

export class MiniMapLayer {
  readonly layer = new Container()
  private cells = new Graphics()
  private marker = new Graphics()
  private drawnKey = ''
  /** Remake: the N key hides the mini-map altogether. */
  private hidden = false

  constructor(private readonly view: Size) {
    this.layer.addChild(this.cells, this.marker)
  }

  toggle(): void {
    this.hidden = !this.hidden
  }

  update(s: SimState, info: MiniMapViewInfo): void {
    this.layer.visible = !this.hidden && miniMapShown(s)
    if (!this.layer.visible) return
    const mapSize = s.grid.map.mapSize
    const size = miniMapImageSize(mapSize)
    const scale = fitScale(size, this.view)
    this.redrawCells(miniMapCells(s), size)
    this.layer.scale.set(scale)
    this.layer.position.set(this.view.w - size.x * scale, this.view.h - size.y * scale)
    this.marker.visible = s.worldMode === 'continuous'
    if (this.marker.visible) this.placeMarker(info)
    const corner = { x: this.view.w, y: this.view.h }
    this.layer.alpha = miniMapBlend(corner, info.player, info.mouse) / PERCENT
  }

  /** modMiniMap.drawMap: a black image, then each room's status image copied into its cell. */
  private redrawCells(cells: MiniMapCell[][], size: Vec): void {
    const key = cells.map((row) => row.join(',')).join(';')
    if (key === this.drawnKey) return
    this.drawnKey = key
    const g = this.cells.clear()
    g.rect(0, 0, size.x, size.y).fill(BACKGROUND)
    cells.forEach((row, y) => row.forEach((cell, x) => drawImage(g, CELL_IMAGES[cell], cellOrigin({ x: x + 1, y: y + 1 }))))
  }

  /** Remake: the view as a miniCurrent-coloured marker (one cell for a room-sized view), snapped to map image px. */
  private placeMarker(info: MiniMapViewInfo): void {
    const { cellPx, border } = MINI_MAP
    const w = Math.round((this.view.w / info.roomPx.w) * cellPx)
    const h = Math.round((this.view.h / info.roomPx.h) * cellPx)
    this.marker.clear().rect(0, 0, w, h).fill(CURRENT_COLOUR)
    this.marker.position.set(
      border.left + Math.round((info.origin.x / info.roomPx.w) * cellPx),
      border.top + Math.round((info.origin.y / info.roomPx.h) * cellPx),
    )
  }
}

function drawImage(g: Graphics, image: CellImage, at: Vec): void {
  image.forEach((row, y) => row.forEach((colour, x) => g.rect(at.x + x, at.y + y, 1, 1).fill(colour)))
}
