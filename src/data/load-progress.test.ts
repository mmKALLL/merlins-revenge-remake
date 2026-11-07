import { describe, expect, it } from 'vitest'
import { LoadStage, loadedFraction } from './load-progress'

describe('loadedFraction', () => {
  it('fills each stage its share of the weights by the loads it has finished', () => {
    const data = new LoadStage(1)
    const sprites = new LoadStage(3)
    data.total = 2
    data.done = 1
    expect(loadedFraction([data, sprites])).toBe(0.125)
    data.done = 2
    expect(loadedFraction([data, sprites])).toBe(0.25)
  })

  it('does not hold the bar back when a later stage finds its loads', () => {
    const data = new LoadStage(1)
    const pages = new LoadStage(3)
    data.total = data.done = 3
    const before = loadedFraction([data, pages])
    pages.total = 6 // the sprite index is in and names its pages
    expect(loadedFraction([data, pages])).toBe(before)
    pages.done = 1
    expect(loadedFraction([data, pages])).toBeGreaterThan(before)
  })

  it('leaves out a stage of no weight (a map with nothing to build)', () => {
    const build = new LoadStage(0)
    const files = new LoadStage(1)
    files.total = files.done = 1
    expect(loadedFraction([build, files])).toBe(1)
    expect(loadedFraction([])).toBe(0)
  })
})
