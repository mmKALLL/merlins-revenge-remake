// The score (remake feature, engine notes hud "Scoring") in the strip below the play view, at its
// right end: the map's total, then the current room's points still to win in green ("+1234"). The
// room points keep a slot as wide as "+9999" that ends at the play view's right edge (x 608, where
// potionMaster right-aligns the potions above), so the total stays put as they count down. A run
// played in the continuous world shows a grey note instead.
import { Container, Text } from 'pixi.js'
import { GAME_SCREEN } from '../mr-open/mr-hud'
import { currentRoomPoints, ROOM_POINTS_MAX } from '../sim/score'
import type { SimState } from '../sim/state'
import type { Size } from '../sim/view'
import { PIXEL_TEXT } from './text-options'

const FONT = { fontFamily: 'monospace', fontSize: 11 }
const COLOURS = { total: 0xffffff, room: 0x00c800, void: 0x808080 } // room: the health bar's green, rgb(0,200,0)
/** Between the total and the room points. */
const GAP = 8
const VOID_NOTE = 'SCORE: — (OPEN WORLD)'

export class ScoreHud {
  readonly layer = new Container()
  private total = this.text(COLOURS.total)
  private room = this.text(COLOURS.room)
  private note = this.text(COLOURS.void)
  private drawn = ''
  private readonly roomLeft: number

  /** stage: the logical screen; view: the play view on it, from GAME_SCREEN.map */
  constructor(stage: Size, view: Size) {
    const strip = { top: GAME_SCREEN.map.y + view.h, height: stage.h - GAME_SCREEN.map.y - view.h }
    const right = GAME_SCREEN.map.x + view.w
    this.note.text = VOID_NOTE
    this.room.text = `+${ROOM_POINTS_MAX}`
    this.total.text = '0'
    this.roomLeft = right - Math.ceil(this.room.width)
    const top = strip.top + Math.max(0, Math.round((strip.height - this.total.height) / 2))
    for (const t of [this.total, this.room, this.note]) t.y = top
    this.note.x = Math.round(right - this.note.width)
    this.room.x = this.roomLeft
    this.layer.addChild(this.total, this.room, this.note)
  }

  update(s: SimState): void {
    const roomPoints = currentRoomPoints(s)
    const key = `${s.score.valid} ${s.score.total} ${roomPoints}`
    if (key === this.drawn) return
    this.drawn = key
    this.note.visible = !s.score.valid
    this.total.visible = s.score.valid
    this.room.visible = roomPoints !== null
    if (!s.score.valid) return
    this.total.text = String(s.score.total)
    this.total.x = Math.round(this.roomLeft - GAP - this.total.width)
    if (roomPoints !== null) this.room.text = `+${roomPoints}`
  }

  private text(fill: number): Text {
    return new Text({ text: '', ...PIXEL_TEXT, style: { ...FONT, fill } })
  }
}
