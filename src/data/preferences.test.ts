import { describe, expect, it } from 'vitest'
import { debugInfoOn, parseSpaceMode } from './preferences'

describe('parseSpaceMode', () => {
  it('reads back each Space mode and rejects anything else', () => {
    expect(parseSpaceMode('nearest')).toBe('nearest')
    expect(parseSpaceMode('pushBack')).toBeNull() // the removed push-back mode falls back to the default
    expect(parseSpaceMode('mouse')).toBe('mouse')
    expect(parseSpaceMode(null)).toBeNull()
    expect(parseSpaceMode('short')).toBeNull()
  })
})

describe('debugInfoOn', () => {
  it('is off by default, follows the stored choice, and the URL parameter overrides both', () => {
    expect(debugInfoOn(null, null)).toBe(false)
    expect(debugInfoOn(null, 'on')).toBe(true)
    expect(debugInfoOn('', null)).toBe(true) // ?debug
    expect(debugInfoOn('1', 'off')).toBe(true)
    expect(debugInfoOn('0', 'on')).toBe(false)
  })
})
