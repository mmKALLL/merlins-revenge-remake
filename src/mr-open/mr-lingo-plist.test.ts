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

  it('reports the offset of a syntax error', () => {
    expect(() => parseLingo('[#a: ]')).toThrow(/offset 5/)
  })
})
