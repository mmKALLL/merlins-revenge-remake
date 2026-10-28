import { describe, expect, it } from 'vitest'
import { armyDisplayEntries } from './army-entries'

describe('armyDisplayEntries', () => {
  const order = ['warrior', 'archer', 'monk', 'dwarf']

  it('lists the types with units in the armyMembers order, then others by name', () => {
    const reserve = { zombie: 1, dwarf: 1, archer: 2, bat: 3, warrior: 2 }
    expect(armyDisplayEntries(reserve, order)).toEqual([
      { typ: 'warrior', count: 2 },
      { typ: 'archer', count: 2 },
      { typ: 'dwarf', count: 1 },
      { typ: 'bat', count: 3 },
      { typ: 'zombie', count: 1 },
    ])
  })

  it('leaves out emptied types and a missing reserve', () => {
    expect(armyDisplayEntries({ warrior: 0, monk: 1 }, order)).toEqual([{ typ: 'monk', count: 1 }])
    expect(armyDisplayEntries(undefined, order)).toEqual([])
  })
})
