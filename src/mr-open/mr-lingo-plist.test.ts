import { describe, expect, it } from 'vitest'
import { parseLingo } from './mr-lingo-plist'

describe('parseLingo', () => {
  it('parses numbers, strings and symbols', () => {
    expect(parseLingo('42')).toBe(42)
    expect(parseLingo('0.0625')).toBeCloseTo(0.0625)
    expect(parseLingo('"hi"')).toBe('hi')
    expect(parseLingo('#none')).toEqual({ sym: 'none' })
  })

  it('parses linear lists', () => {
    expect(parseLingo('[1, 2, [3, 4]]')).toEqual([1, 2, [3, 4]])
    expect(parseLingo('[]')).toEqual([])
  })

  it('parses property lists into plain objects', () => {
    expect(parseLingo('[#a: 1, #b: "x"]')).toEqual({ a: 1, b: 'x' })
    expect(parseLingo('[:]')).toEqual({})
  })

  it('parses point() and rgb()', () => {
    expect(parseLingo('point(18, 9)')).toEqual({ x: 18, y: 9 })
    expect(parseLingo('rgb(0,255,0)')).toEqual({ r: 0, g: 255, b: 0 })
  })

  it('ignores whitespace and newlines', () => {
    expect(parseLingo('[\n#up:13,\n#down: 1\n]')).toEqual({ up: 13, down: 1 })
  })

  it('tolerates stray closing brackets after the root value, as value() does', () => {
    expect(parseLingo('[#a: 1]]\n')).toEqual({ a: 1 })
    expect(() => parseLingo('[#a: 1] x')).toThrow(/offset 8.*trailing/)
  })

  it('reports the offset of a syntax error', () => {
    expect(() => parseLingo('[#a: ]')).toThrow(/offset 5/)
  })

  it('parses bare identifiers as references', () => {
    expect(parseLingo('[#layerZ: gGameObjectLayer]')).toEqual({ layerZ: { ident: 'gGameObjectLayer' } })
  })

  it('parses generic calls with nested arguments', () => {
    expect(parseLingo('point(random(450), 300)')).toEqual({ call: 'point', args: [{ call: 'random', args: [450] }, 300] })
    expect(parseLingo('member("a", "gfx")')).toEqual({ call: 'member', args: ['a', 'gfx'] })
  })

  it('still returns plain points and colours for numeric point() and rgb()', () => {
    expect(parseLingo('point(1, 2)')).toEqual({ x: 1, y: 2 })
  })

  it('parses numbers without a leading zero', () => {
    expect(parseLingo('[#a: .5, #b: -.25]')).toEqual({ a: 0.5, b: -0.25 })
  })
})
