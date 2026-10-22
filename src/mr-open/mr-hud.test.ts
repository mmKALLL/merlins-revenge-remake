import { describe, expect, it } from 'vitest'
import { energyBarLength, energyBarRect, energyPercent, multicolourBarColour } from './mr-hud'

describe('objMulticolourEnergyBar colour', () => {
  it('runs red to yellow below half energy and yellow to green above, green only when full', () => {
    expect(multicolourBarColour(0)).toEqual({ r: 255, g: 0, b: 0 })
    expect(multicolourBarColour(25)).toEqual({ r: 255, g: 128, b: 0 })
    expect(multicolourBarColour(50)).toEqual({ r: 255, g: 255, b: 0 })
    expect(multicolourBarColour(75)).toEqual({ r: 128, g: 228, b: 0 })
    expect(multicolourBarColour(100)).toEqual({ r: 0, g: 200, b: 0 })
  })

  it('steps with the whole percent', () => {
    expect(multicolourBarColour(60.9)).toEqual(multicolourBarColour(60))
  })
})

describe('objEnergyBar fill', () => {
  it('fills the surround inset by the border, in proportion to the energy', () => {
    const bar = energyBarRect({ x: 104, y: 305, w: 100, h: 14 })
    expect(bar).toEqual({ x: 106, y: 307, w: 96, h: 10 })
    expect(energyBarLength(energyPercent(100, 200), bar.w)).toBe(48)
    expect(energyBarLength(energyPercent(-5, 200), bar.w)).toBe(0)
    expect(energyBarLength(energyPercent(250, 200), bar.w)).toBe(96)
  })
})
