// Draws the end sequence over the whole canvas: the game fading to black, then the cut scene stage
// (cutSceneMaster's background rect, objCutSceneTitle, the players and modThespian's cut scene
// speech), then the "map complete" prompt. The animScreenEnd layout is not extracted, so the stage
// and title positions below are assumptions within the 640x320 screen.
import { Container, Graphics, Sprite, Text, type Texture } from 'pixi.js'
import type { Vec } from '../mr-open/mr-geometry'
import type { EndSequenceView } from '../cutscene/end-sequence'
import type { StageRect } from '../cutscene/performer'
import type { Rgb } from '../cutscene/script'
import type { Size } from './camera'

/** The stage rect (assumed): the play view's width, below room for the title and speech. */
export const CUTSCENE_STAGE = { left: 32, top: 112, right: 608, bottom: 288 }
export const CUTSCENE_STAGE_X: StageRect = { left: CUTSCENE_STAGE.left, right: CUTSCENE_STAGE.right }
/** cutSceneMaster.pStageFloorHeight: players stand this far above the stage rect's bottom. */
const STAGE_FLOOR_HEIGHT = 16
/** cutSceneMaster.pSpeechGap: speech sits this far above the stage rect's top. */
const SPEECH_GAP = 4
/** modThespian #speechWidthCutscene and its Verdana 10 bold text member. */
const SPEECH_WIDTH = 300
const SPEECH_STYLE = { fill: '#ffffff', fontFamily: 'Verdana, sans-serif', fontSize: 10, fontWeight: 'bold', wordWrap: true, wordWrapWidth: SPEECH_WIDTH, align: 'center' } as const
/** objCutSceneTitle's text member (its font is not known; assumed bold). */
const TITLE_Y = 40
const TITLE_STYLE = { fontFamily: 'Verdana, sans-serif', fontSize: 20, fontWeight: 'bold' } as const
const PROMPT_TEXT = 'Map complete. Press Enter or click to play it again,\nor pick another map below.'
const PROMPT_STYLE = { fill: '#aaaaaa', fontFamily: 'monospace', fontSize: 12, align: 'center' } as const

/** A character's stand frame and registration point (the frame centre when unknown). */
export interface CharacterFrame { texture: Texture; reg: Vec }

const hex = (c: Rgb): number => (c.r << 16) | (c.g << 8) | c.b

export class CutSceneOverlay {
  readonly layer = new Container()
  private cover = new Graphics()
  private stage = new Graphics()
  private title = new Text({ text: '', style: TITLE_STYLE })
  private speech = new Text({ text: '', style: SPEECH_STYLE })
  private prompt = new Text({ text: PROMPT_TEXT, style: PROMPT_STYLE })
  private players = new Map<string, Sprite>()

  constructor(private screen: Size, private frameFor: (character: string) => CharacterFrame | undefined) {
    this.title.anchor.set(0.5, 0)
    this.title.position.set(screen.w / 2, TITLE_Y)
    this.speech.anchor.set(0.5, 1)
    this.prompt.anchor.set(0.5)
    this.prompt.position.set(screen.w / 2, screen.h / 2)
    this.layer.addChild(this.cover, this.stage, this.title, this.speech, this.prompt)
    this.layer.visible = false
  }

  draw(view: EndSequenceView | null): void {
    this.layer.visible = view !== null
    if (!view) return
    this.cover.clear().rect(0, 0, this.screen.w, this.screen.h).fill({ color: 0, alpha: view.fade })
    this.prompt.visible = view.done
    const scene = view.cutScene
    this.stage.visible = this.title.visible = this.speech.visible = scene !== null
    const seen = new Set<string>()
    if (scene) {
      const { left, top, right, bottom } = CUTSCENE_STAGE
      this.stage.clear().rect(left, top, right - left, bottom - top).fill(hex(scene.background))
      this.title.text = scene.title.text
      this.title.style.fill = hex(scene.title.colour)
      for (const p of scene.players) {
        const spr = this.playerSprite(p.character)
        if (!spr) continue
        seen.add(p.character)
        spr.position.set(Math.round(p.x), bottom - STAGE_FLOOR_HEIGHT - (spr.texture.height - spr.anchor.y * spr.texture.height))
        spr.scale.x = p.facingLeft ? -1 : 1
        spr.alpha = p.alpha
      }
      this.speech.visible = scene.speech !== null
      if (scene.speech) {
        this.speech.text = scene.speech.text
        // displaySpeechCutScene: centred on the speaker, kept inside the stage
        const half = this.speech.width / 2
        this.speech.position.set(Math.max(left + half, Math.min(right - half, scene.speech.x)), top - SPEECH_GAP)
      }
    }
    for (const [character, spr] of this.players) spr.visible = seen.has(character)
  }

  private playerSprite(character: string): Sprite | undefined {
    let spr = this.players.get(character)
    if (spr) return spr
    const frame = this.frameFor(character)
    if (!frame) return undefined
    spr = new Sprite(frame.texture)
    spr.anchor.set(frame.reg.x / frame.texture.width, frame.reg.y / frame.texture.height)
    this.players.set(character, spr)
    this.layer.addChildAt(spr, this.layer.getChildIndex(this.speech))
    return spr
  }
}
