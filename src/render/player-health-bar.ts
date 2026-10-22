// Merlin's health bar in the strip below the play view (objPlayerMerlinCharacter.init ->
// objMulticolourEnergyBar; docs/notes/engine-mechanics-hud.md): the "health" label and the bar's
// surround at their gameScreen marks, and inside the surround a bar filling from the left, coloured
// red -> yellow -> green with the energy.
import { Container, Graphics, Sprite } from 'pixi.js'
import type { HudTextures } from '../data/loaders'
import { GAME_SCREEN, energyBarLength, energyBarRect, energyPercent, multicolourBarColour } from '../mr-open/mr-hud'

const BAR = energyBarRect(GAME_SCREEN.healthSurround)

export class PlayerHealthBar {
  readonly layer = new Container()
  private bar = new Graphics()
  private drawn = ''

  /** `textures` null (not converted): the bar alone, without its label and surround. */
  constructor(textures: HudTextures | null) {
    if (textures) {
      const label = new Sprite(textures.healthLabel)
      label.position.set(GAME_SCREEN.healthLabel.x, GAME_SCREEN.healthLabel.y)
      const surround = new Sprite(textures.healthSurround)
      surround.position.set(GAME_SCREEN.healthSurround.x, GAME_SCREEN.healthSurround.y)
      this.layer.addChild(label, surround)
    }
    this.bar.position.set(BAR.x, BAR.y)
    this.layer.addChild(this.bar) // the bar sprite sits one locZ above its surround
  }

  update(energy: number, maxEnergy: number): void {
    const percent = energyPercent(energy, maxEnergy)
    const length = energyBarLength(percent, BAR.w)
    const { r, g, b } = multicolourBarColour(percent)
    const key = `${length} ${r} ${g} ${b}`
    if (key === this.drawn) return
    this.drawn = key
    this.bar.clear()
    if (length > 0) this.bar.rect(0, 0, length, BAR.h).fill((r << 16) | (g << 8) | b)
  }
}
