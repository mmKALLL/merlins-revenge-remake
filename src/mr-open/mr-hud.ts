// The game screen's HUD (docs/notes/engine-mechanics-hud.md): where the score's gameScreen marks put
// the room, the medikit and potion displays and Merlin's health bar, and how objEnergyBar /
// objMulticolourEnergyBar size and colour that bar.
import type { Rgb } from '../cutscene/script'

export interface MarkRect { x: number; y: number; w: number; h: number }

/**
 * The sprites on the score's gameScreen frame (240) of merlin_engine_76_speed.dir, in stage px
 * (the stage is 640x320). screenMaster.getMarks reads them; objScreen.startObjects / startPrgs hand
 * each loc to its object.
 */
export const GAME_SCREEN = {
  /** dd_map_to_play: objMapController -> objMap.pLocation, the room sprite's top-left (objRoom.onScreen). */
  map: { x: 32, y: 16 },
  /** prg_medikitMaster: objMedikitDisplayer's displayLoc, the icon's top-left. */
  medikit: { x: 32, y: 0 },
  /** prg_potionMaster: potionMaster.calcDisplayRect; the display is right-aligned to its right edge. */
  potions: { x: 470, y: 0, w: 138, h: 16 },
  /** health_grey_locz151: the word "health", drawn as is (ink copy). */
  healthLabel: { x: 32, y: 306 },
  /** health_bar_surround: the bar's frame (ink background transparent: its white inside shows the stage). */
  healthSurround: { x: 104, y: 305, w: 100, h: 14 },
} as const

/** objEnergyBar #barBorder default: the bar is the surround rect inflated by -2. */
export const ENERGY_BAR_BORDER = 2

/** The bar inside its surround (objEnergyBar.updateBarOnSurround). */
export function energyBarRect(surround: MarkRect, border: number = ENERGY_BAR_BORDER): MarkRect {
  return { x: surround.x + border, y: surround.y + border, w: surround.w - 2 * border, h: surround.h - 2 * border }
}

/** VarPercent(energy, [0, max]) (clamped to 0-100). */
export function energyPercent(energy: number, maxEnergy: number): number {
  if (maxEnergy <= 0 || energy >= maxEnergy) return 100
  return energy <= 0 ? 0 : (energy / maxEnergy) * 100
}

/** objEnergyBar.updateEnergy: VarValRange(percent, [0, maxBarWidth]), as a whole sprite width. */
export function energyBarLength(percent: number, maxLength: number): number {
  return Math.round((Math.max(0, Math.min(100, percent)) / 100) * maxLength)
}

/** objMulticolourEnergyBar #colourRange: the colours at 0 %, 50 % and 100 %. */
export const ENERGY_BAR_COLOURS: readonly Rgb[] = [{ r: 255, g: 0, b: 0 }, { r: 255, g: 255, b: 0 }, { r: 0, g: 200, b: 0 }]

/** VarFloor: integer(x * 1000) with the thousandths dropped (Lingo integer() rounds). */
function varFloor(x: number): number {
  const thousandths = Math.round(x * 1000)
  return (thousandths - (thousandths % 1000)) / 1000
}

/** VarColRange: `percent` of the way from one colour to the other (rgb() takes whole values). */
function colourRange(percent: number, from: Rgb, to: Rgb): Rgb {
  const k = Math.max(0, Math.min(100, percent)) / 100
  const mix = (a: number, b: number) => Math.round(a + (b - a) * k)
  return { r: mix(from.r, to.r), g: mix(from.g, to.g), b: mix(from.b, to.b) }
}

/**
 * objMulticolourEnergyBar.updateEnergy: the range the percent falls in (red to yellow below 50 %,
 * yellow to green above), the colour stepping with the whole percent; full energy is the last colour.
 */
export function multicolourBarColour(percent: number, colours: readonly Rgb[] = ENERGY_BAR_COLOURS): Rgb {
  const ranges = colours.length - 1
  const rangePercent = Math.trunc(100 / ranges) // Lingo integer division
  const range = varFloor(percent / rangePercent) // 0-based (the Lingo's colRange - 1)
  if (range >= ranges) return colours[ranges]!
  const along = (varFloor(percent) % rangePercent) * ranges
  return colourRange(along, colours[range]!, colours[range + 1]!)
}
