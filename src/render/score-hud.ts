// The score (remake feature, engine notes hud "Scoring") in the strip below the play view, at its
// right end: the map's total ("Score: 1234"), then the current room's points still to win in green ("+1234"). The
// room points keep a slot as wide as "+9999" that ends at the play view's right edge (x 608, where
// potionMaster right-aligns the potions above), so the total stays put as they count down. A run
// voided by a world mode switch shows a grey dash in place of the total's number.
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
const VOID_MARK = '—'
const TOTAL_PREFIX = 'Score: '

export class ScoreHud {
  readonly layer = new Container()
  private total = this.text(COLOURS.total)
  private room = this.text(COLOURS.room)
  private voidMark = this.text(COLOURS.void)
  private drawn = ''
  /** Where the total ends: GAP left of the room points' slot. */
  private readonly totalRight: number

  /** stage: the logical screen; view: the play view on it, from GAME_SCREEN.map */
  constructor(stage: Size, view: Size) {
    const strip = { top: GAME_SCREEN.map.y + view.h, height: stage.h - GAME_SCREEN.map.y - view.h }
    const right = GAME_SCREEN.map.x + view.w
    this.voidMark.text = TOTAL_PREFIX + VOID_MARK
    this.room.text = `+${ROOM_POINTS_MAX}`
    this.total.text = TOTAL_PREFIX + '0'
    const roomLeft = right - Math.ceil(this.room.width)
    this.totalRight = roomLeft - GAP
    const top = strip.top + Math.max(0, Math.round((strip.height - this.total.height) / 2))
    for (const t of [this.total, this.room, this.voidMark]) t.y = top
    this.voidMark.x = Math.round(this.totalRight - this.voidMark.width)
    this.room.x = roomLeft
    this.layer.addChild(this.total, this.room, this.voidMark)
  }

  update(s: SimState): void {
    const roomPoints = currentRoomPoints(s)
    const key = `${s.score.valid} ${s.score.total} ${roomPoints}`
    if (key === this.drawn) return
    this.drawn = key
    this.voidMark.visible = !s.score.valid
    this.total.visible = s.score.valid
    this.room.visible = roomPoints !== null
    if (!s.score.valid) return
    this.total.text = TOTAL_PREFIX + String(s.score.total)
    this.total.x = Math.round(this.totalRight - this.total.width)
    if (roomPoints !== null) this.room.text = `+${roomPoints}`
  }

  private text(fill: number): Text {
    return new Text({ text: '', ...PIXEL_TEXT, style: { ...FONT, fill } })
  }
}
