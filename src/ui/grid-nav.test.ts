// Pick screen and run summary keyboard navigation: rows up and down, controls left and right.
import { describe, expect, it } from 'vitest'
import { moveInGrid, navDirection } from './grid-nav'

const key = (code: string, mods: Partial<Record<'ctrlKey' | 'altKey' | 'metaKey', boolean>> = {}) =>
  ({ code, ctrlKey: false, altKey: false, metaKey: false, ...mods })

describe('navDirection', () => {
  it('reads the arrows and WASD, and nothing with a modifier held', () => {
    expect(['ArrowUp', 'KeyW', 'ArrowLeft', 'KeyA', 'ArrowDown', 'KeyS', 'ArrowRight', 'KeyD'].map((c) => navDirection(key(c))))
      .toEqual(['up', 'up', 'left', 'left', 'down', 'down', 'right', 'right'])
    expect(navDirection(key('KeyQ'))).toBeNull()
    expect(navDirection(key('KeyS', { metaKey: true }))).toBeNull()
  })
})

describe('moveInGrid', () => {
  const pickRows = [2, 3] // two biomes over three rewards

  it('starts on the first control', () => {
    expect(moveInGrid(pickRows, null, 'right')).toEqual({ row: 0, col: 0 })
    expect(moveInGrid([0, 3], null, 'down')).toEqual({ row: 1, col: 0 })
    expect(moveInGrid([0, 0], null, 'down')).toBeNull()
  })

  it('steps within a row, wrapping at its ends', () => {
    expect(moveInGrid(pickRows, { row: 1, col: 2 }, 'right')).toEqual({ row: 1, col: 0 })
    expect(moveInGrid(pickRows, { row: 0, col: 0 }, 'left')).toEqual({ row: 0, col: 1 })
  })

  it('moves between rows, keeping the column where it can and skipping empty rows', () => {
    expect(moveInGrid(pickRows, { row: 0, col: 1 }, 'down')).toEqual({ row: 1, col: 1 })
    expect(moveInGrid(pickRows, { row: 1, col: 2 }, 'up')).toEqual({ row: 0, col: 1 })
    expect(moveInGrid(pickRows, { row: 1, col: 0 }, 'down')).toEqual({ row: 0, col: 0 })
    expect(moveInGrid([0, 3], { row: 1, col: 1 }, 'up')).toEqual({ row: 1, col: 1 })
  })
})
