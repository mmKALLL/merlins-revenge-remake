import { describe, expect, it } from 'vitest'
import { findTarget, hatedTeams, type Targetable } from './mr-targeting'

const me: Targetable = { id: 1, team: 'goblins', pos: { x: 0, y: 0 }, alive: true }
const teams = { goblins: { hates: [['aldevar'], ['chatters']] }, aldevar: { hates: [] } }

describe('hatedTeams', () => {
  it('returns the first-priority hate group', () => {
    expect(hatedTeams('goblins', teams)).toEqual(['aldevar'])
  })
  it('is empty for peaceful or unknown teams', () => {
    expect(hatedTeams('aldevar', teams)).toEqual([])
    expect(hatedTeams('nobody', teams)).toEqual([])
  })
})

describe('findTarget', () => {
  const hated = ['aldevar']
  it('picks the nearest hostile by reg-point distance', () => {
    const cands: Targetable[] = [
      me,
      { id: 2, team: 'aldevar', pos: { x: 30, y: 40 }, alive: true }, // 50 px
      { id: 3, team: 'aldevar', pos: { x: 10, y: 0 }, alive: true }, // 10 px
    ]
    expect(findTarget(me, cands, hated)).toBe(3)
  })
  it('ignores dead and friendly actors', () => {
    const cands: Targetable[] = [
      me,
      { id: 2, team: 'aldevar', pos: { x: 1, y: 0 }, alive: false },
      { id: 3, team: 'goblins', pos: { x: 2, y: 0 }, alive: true },
      { id: 4, team: 'aldevar', pos: { x: 100, y: 0 }, alive: true },
    ]
    expect(findTarget(me, cands, hated)).toBe(4)
  })
  it('returns null when nobody qualifies', () => {
    expect(findTarget(me, [me, { id: 2, team: 'goblins', pos: { x: 5, y: 5 }, alive: true }], hated)).toBeNull()
    expect(findTarget(me, [], hated)).toBeNull()
  })
  it('keeps the first on ties', () => {
    const cands: Targetable[] = [
      { id: 7, team: 'aldevar', pos: { x: 10, y: 0 }, alive: true },
      { id: 8, team: 'aldevar', pos: { x: -10, y: 0 }, alive: true },
    ]
    expect(findTarget(me, cands, hated)).toBe(7)
  })
})
