import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseTileKey } from './mr-tile-key'

const header = '[#name: "x", #type: #field]\ntileSize | point(32,32)\n'

describe('parseTileKey', () => {
  it('parses tile size and one symbol per line, skipping comments', () => {
    const k = parseTileKey(`${header}-- c\n#none\n#solid\n\n#solid\n`)
    expect(k.tileSize).toEqual({ x: 32, y: 32 })
    expect(k.symbols).toEqual(['none', 'solid', 'none', 'solid'])
  })

  it('keeps every blank line as a none slot, dropping only the final newline', () => {
    // an all-blank key like the Passive key: 5 blank lines = 5 slots
    const k = parseTileKey(`${header}\n\n\n\n\n`)
    expect(k.symbols).toEqual(['none', 'none', 'none', 'none', 'none'])
    // four newline-terminated blank lines are four slots
    expect(parseTileKey(`${header}\n\n\n\n`).symbols).toHaveLength(4)
    // trailing blanks after a symbol are slots too
    expect(parseTileKey(`${header}#solid\n\n\n`).symbols).toEqual(['solid', 'none', 'none'])
  })

  it('counts an explicit #none on the last line as a slot', () => {
    expect(parseTileKey(`${header}#solid\n#none\n`).symbols).toEqual(['solid', 'none'])
    expect(parseTileKey(`${header}#solid\n#none`).symbols).toEqual(['solid', 'none'])
  })

  it('reads the real keys with the engine slot counts', () => {
    const active = parseTileKey(readFileSync('assets/tile-keys/merlinOpenActive.txt', 'utf8'))
    expect(active.tileSize).toEqual({ x: 32, y: 32 })
    expect(active.symbols[0]).toBe('none')
    expect(active.symbols[1]).toBe('solid')
    expect(active.symbols).toHaveLength(261)
    expect(parseTileKey(readFileSync('assets/tile-keys/merlinOpenObjects.txt', 'utf8')).symbols).toHaveLength(228)
    const passive = parseTileKey(readFileSync('assets/tile-keys/merlinOpenPassive.txt', 'utf8'))
    expect(passive.symbols).toHaveLength(58)
    expect(passive.symbols.every((s) => s === 'none')).toBe(true)
  })

  it('exposes solidity by 1-based tile index', () => {
    const k = parseTileKey(`${header}#none\n#solid\n`)
    expect(k.isSolid(0)).toBe(false) // empty tile
    expect(k.isSolid(1)).toBe(false)
    expect(k.isSolid(2)).toBe(true)
    expect(k.isSolid(99)).toBe(false) // beyond key
  })
})
