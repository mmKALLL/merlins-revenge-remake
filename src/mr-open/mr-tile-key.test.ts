import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseTileKey } from './mr-tile-key'

describe('parseTileKey', () => {
  it('parses tile size and one symbol per line, skipping comments', () => {
    const k = parseTileKey('[#name: "x", #type: #field]\ntileSize | point(32,32)\n-- c\n#none\n#solid\n\n#solid\n')
    expect(k.tileSize).toEqual({ x: 32, y: 32 })
    expect(k.symbols).toEqual(['none', 'solid', 'none', 'solid'])
  })

  it('reads the real active key', () => {
    const k = parseTileKey(readFileSync('assets/tile-keys/merlinOpenActive.txt', 'utf8'))
    expect(k.tileSize).toEqual({ x: 32, y: 32 })
    expect(k.symbols[0]).toBe('none')
    expect(k.symbols[1]).toBe('solid')
    expect(k.symbols.length).toBeGreaterThan(200)
  })

  it('exposes solidity by 1-based tile index', () => {
    const k = parseTileKey('[#name: "x", #type: #field]\ntileSize | point(32,32)\n#none\n#solid\n')
    expect(k.isSolid(0)).toBe(false) // empty tile
    expect(k.isSolid(1)).toBe(false)
    expect(k.isSolid(2)).toBe(true)
    expect(k.isSolid(99)).toBe(false) // beyond key
  })
})
