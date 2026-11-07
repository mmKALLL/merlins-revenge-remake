// Merlin's health bar in the strip below the play view (objPlayerMerlinCharacter.init ->
// objMulticolourEnergyBar; docs/notes/engine-mechanics-hud.md): the "health" label and the bar's
// surround at their gameScreen marks, and inside the surround a bar filling from the left, coloured
// red -> yellow -> green with the energy.
import { Container, Graphics, Sprite } from 'pixi.js'
import type { HudTextures } from '../data/loaders'
import { energyBarLength, energyBarRect, energyPercent, multicolourBarColour, type GameScreen, type MarkRect } from '../mr-open/mr-hud'

export class PlayerHealthBar {
  readonly layer = new Container()
  private bar = new Graphics()
  private drawn = ''
  private readonly barRect: MarkRect

  /** `textures` null (not converted): the bar alone, without its label and surround. */
  constructor(textures: HudTextures | null, marks: GameScreen) {
    if (textures) {
      const label = new Sprite(textures.healthLabel)
      label.position.set(marks.healthLabel.x, marks.healthLabel.y)
      const surround = new Sprite(textures.healthSurround)
      surround.position.set(marks.healthSurround.x, marks.healthSurround.y)
      this.layer.addChild(label, surround)
    }
    this.barRect = energyBarRect(marks.healthSurround)
    this.bar.position.set(this.barRect.x, this.barRect.y)
    this.layer.addChild(this.bar) // the bar sprite sits one locZ above its surround
  }

  update(energy: number, maxEnergy: number): void {
    const percent = energyPercent(energy, maxEnergy)
    const length = energyBarLength(percent, this.barRect.w)
    const { r, g, b } = multicolourBarColour(percent)
    const key = `${length} ${r} ${g} ${b}`
    if (key === this.drawn) return
    this.drawn = key
    this.bar.clear()
    if (length > 0) this.bar.rect(0, 0, length, this.barRect.h).fill((r << 16) | (g << 8) | b)
  }
}
