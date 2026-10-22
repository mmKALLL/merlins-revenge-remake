import { describe, expect, it } from 'vitest'
import { parseSpaceMode } from './preferences'

describe('parseSpaceMode', () => {
  it('reads back each Space mode and rejects anything else', () => {
    expect(parseSpaceMode('nearest')).toBe('nearest')
    expect(parseSpaceMode('pushBack')).toBe('pushBack')
    expect(parseSpaceMode('mouse')).toBe('mouse')
    expect(parseSpaceMode(null)).toBeNull()
    expect(parseSpaceMode('short')).toBeNull()
  })
})
