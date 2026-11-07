// Draws the end and game over sequences and a map's intro over the whole canvas: the game fading
// to black, then the cut scene stage (cutSceneMaster's background rect, objCutSceneTitle, the
// players and modThespian's cut scene speech), then the "map complete" prompt. The animScreenEnd and
// animScreenGameOver layouts are not extracted, so the stage and title positions below are
// assumptions within the 640x320 screen.
import { Container, Graphics, Sprite, Text, type Texture } from 'pixi.js'
import { teleportLook } from '../mr-open/mr-army'
import type { Vec } from '../mr-open/mr-geometry'
import type { EndSequenceView } from '../cutscene/end-sequence'
import type { CutScenePlayerView, CutSceneStrip, StageRect } from '../cutscene/performer'
import type { Rgb } from '../cutscene/script'
import type { Size } from './camera'
import { PIXEL_TEXT } from './text-options'

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
const PROMPT_TEXT = 'Map complete. Press Enter or click to play it again,\nor open the menu (Esc or ☰) to pick another map.'
const PROMPT_STYLE = { fill: '#aaaaaa', fontFamily: 'monospace', fontSize: 12, align: 'center' } as const

/** A character's frame and registration point (the frame centre when unknown). */
export interface CharacterFrame { texture: Texture; reg: Vec }
/** A character's frame of a strip, `stripFrames` frames into it. */
export type CharacterFrameFor = (character: string, strip: CutSceneStrip, stripFrames: number) => CharacterFrame | undefined

/** Held props draw in front of the players. */
const HELD_PROP_Z = 1

const hex = (c: Rgb): number => (c.r << 16) | (c.g << 8) | c.b

export class CutSceneOverlay {
  readonly layer = new Container()
  private cover = new Graphics()
  private stage = new Graphics()
  private title = new Text({ text: '', ...PIXEL_TEXT, style: TITLE_STYLE })
  private speech = new Text({ text: '', ...PIXEL_TEXT, style: SPEECH_STYLE })
  private prompt = new Text({ text: PROMPT_TEXT, ...PIXEL_TEXT, style: PROMPT_STYLE })
  /** the players, seen only between the stage's sides (assumed): off stage is out of sight */
  private cast = new Container()
  private players = new Map<string, Sprite>()

  constructor(private screen: Size, private frameFor: CharacterFrameFor) {
    this.title.anchor.set(0.5, 0)
    this.title.position.set(screen.w / 2, TITLE_Y)
    this.speech.anchor.set(0.5, 1)
    this.prompt.anchor.set(0.5)
    this.prompt.position.set(screen.w / 2, screen.h / 2)
    const { left, right } = CUTSCENE_STAGE
    const wings = new Graphics().rect(left, 0, right - left, screen.h).fill(0xffffff)
    this.cast.mask = wings
    this.cast.sortableChildren = true // held props in front of their holders
    this.layer.addChild(this.cover, this.stage, this.title, wings, this.cast, this.speech, this.prompt)
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
      // standing players first, so the props they hold hang from them and in front of them
      const regs = new Map<string, Vec>()
      for (const p of scene.players) {
        if (p.heldBy) continue
        const reg = this.drawPlayer(p)
        if (reg) regs.set(p.character, reg)
      }
      for (const p of scene.players) {
        const holderReg = p.heldBy && regs.get(p.heldBy.character)
        if (holderReg && this.drawHeldProp(p, holderReg)) seen.add(p.character)
      }
      for (const character of regs.keys()) seen.add(character)
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

  /**
   * The player's frame hung from its registration point, the frame's bottom on the stage floor; a
   * set height stretches it about that point (a Director sprite's height keeps its loc). A teleport
   * stretches it with its bottom on the floor (modTeleport, as in the game). Returns where its
   * registration point is drawn, or undefined when it has no frame.
   */
  private drawPlayer(p: CutScenePlayerView): Vec | undefined {
    const frame = this.frameFor(p.character, p.strip, p.stripFrames)
    if (!frame) return undefined
    const { texture, reg } = frame
    const floor = CUTSCENE_STAGE.bottom - STAGE_FLOOR_HEIGHT
    const at = { x: Math.round(p.x), y: floor - (texture.height - reg.y) }
    const spr = this.styledSprite(p, frame, at)
    spr.scale.y = p.height === null ? 1 : p.height / texture.height
    if (p.teleport) {
      const look = teleportLook(p.teleport.kind, p.teleport.age, texture.height)
      spr.anchor.y = 1
      spr.position.y = floor
      spr.scale.y = look.height / texture.height
      spr.alpha *= look.alpha
    }
    return at
  }

  /** A held prop (modProp): its registration point `carry` px from its holder's. */
  private drawHeldProp(p: CutScenePlayerView, holderReg: Vec): boolean {
    const frame = this.frameFor(p.character, p.strip, p.stripFrames)
    if (!frame || !p.heldBy) return false
    const { carry } = p.heldBy
    this.styledSprite(p, frame, { x: holderReg.x + carry.x, y: holderReg.y + carry.y })
    return true
  }

  /** The player's sprite on `frame`, its registration point at `at`, facing and faded as the view says. */
  private styledSprite(p: CutScenePlayerView, frame: CharacterFrame, at: Vec): Sprite {
    const { texture, reg } = frame
    const spr = this.playerSprite(p.character)
    spr.texture = texture
    spr.anchor.set(reg.x / texture.width, reg.y / texture.height)
    spr.position.set(at.x, at.y)
    spr.scale.set(p.facingLeft ? -1 : 1, 1)
    spr.alpha = p.alpha
    spr.zIndex = p.heldBy ? HELD_PROP_Z : 0
    return spr
  }

  private playerSprite(character: string): Sprite {
    let spr = this.players.get(character)
    if (spr) return spr
    spr = new Sprite()
    this.players.set(character, spr)
    this.cast.addChild(spr)
    return spr
  }
}
