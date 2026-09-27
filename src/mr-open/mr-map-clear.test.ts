import { describe, expect, it } from 'vitest'
import { GAME_COMPLETE_SOUND, isClearOnMiniMap, isMapClear, miniMapStatus } from './mr-map-clear'

describe('miniMapStatus (objTileMap.getMiniMapStatus #miniMap)', () => {
  it('is the highest status on [#clr, #inf, #fre, #spe] among the keys, #clr for none', () => {
    expect(miniMapStatus([])).toBe('clr')
    expect(miniMapStatus(['clr', 'inf'])).toBe('inf')
    expect(miniMapStatus(['inf', 'fre'])).toBe('fre')
    expect(miniMapStatus(['spe', 'inf', 'fre'])).toBe('spe')
  })
  it('skips keys without a status (getPos of VOID is 0)', () => {
    expect(miniMapStatus([undefined, 'clr'])).toBe('clr')
  })
})

describe('isClearOnMiniMap (objRoom.getMiniMapStatus sets pRoomCleared on #clr)', () => {
  it('counts a room as cleared only when every key is #clr', () => {
    expect(isClearOnMiniMap(['clr', undefined])).toBe(true)
    expect(isClearOnMiniMap(['clr', 'inf'])).toBe(false)
    // friendly and special actors (scrolls) keep an unvisited room uncleared too
    expect(isClearOnMiniMap(['fre'])).toBe(false)
    expect(isClearOnMiniMap(['spe'])).toBe(false)
  })
})

describe('isMapClear (objMap.isMapClear)', () => {
  it('is true only when every room is cleared', () => {
    expect(isMapClear([true, true])).toBe(true)
    expect(isMapClear([true, false])).toBe(false)
  })
})

it('the game-complete sound is GameInitGlobals gGameCompleteSound', () => {
  expect(GAME_COMPLETE_SOUND).toBe('end_level')
})
