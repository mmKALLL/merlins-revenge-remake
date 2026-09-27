import { describe, expect, it } from 'vitest'
import {
  arrowColour, combineExitTiles, exitArrowRectsForEdge, exitArrowsForRoom, exitTilesToRanges, imageDrawRepeatedPositions,
  isHostileForExitArrows, type EdgeLists, type ExitTile,
} from './mr-screen-exits'

const TILE = { x: 32, y: 32 }
const IMAGE = { w: 576, h: 288 }
const ARROW = { w: 16, h: 16 }
const S: ExitTile = 'solid'
const N: ExitTile = 'none'

describe('combineExitTiles (ListCombineExitTiles)', () => {
  it('is solid where either side is solid', () => {
    expect(combineExitTiles([S, N, N, S], [N, N, S, S])).toEqual([S, N, S, S])
  })
  it('is empty when either side is empty (map edge)', () => {
    expect(combineExitTiles([], [N, N])).toEqual([])
    expect(combineExitTiles([N, N], [])).toEqual([])
  })
})

describe('exitTilesToRanges (convertExitTilesToRangesEdge)', () => {
  it('turns runs of #none into pixel ranges along the edge', () => {
    expect(exitTilesToRanges([S, N, N, S, N, S], 'top', TILE)).toEqual([[32, 96], [128, 160]])
  })
  it('closes a run that reaches the last tile at the end of that tile', () => {
    expect(exitTilesToRanges([S, S, N, N], 'left', TILE)).toEqual([[64, 128]])
    expect(exitTilesToRanges([N, N, N], 'bottom', TILE)).toEqual([[0, 96]])
  })
  it('uses the tile height on the left and right edges', () => {
    expect(exitTilesToRanges([S, N], 'right', { x: 32, y: 16 })).toEqual([[16, 32]])
  })
  it('gives no ranges for a solid or empty edge', () => {
    expect(exitTilesToRanges([S, S], 'top', TILE)).toEqual([])
    expect(exitTilesToRanges([], 'top', TILE)).toEqual([])
  })
})

describe('exitArrowRectsForEdge (convertExitRangesToArrowRectsEdge)', () => {
  const ranges: [number, number][] = [[32, 96]]
  it('lies along the inside of each edge, gExitArrowThickness deep', () => {
    expect(exitArrowRectsForEdge(ranges, 'left', IMAGE)).toEqual([{ left: 0, top: 32, right: 16, bottom: 96 }])
    expect(exitArrowRectsForEdge(ranges, 'top', IMAGE)).toEqual([{ left: 32, top: 0, right: 96, bottom: 16 }])
    expect(exitArrowRectsForEdge(ranges, 'right', IMAGE)).toEqual([{ left: 560, top: 32, right: 576, bottom: 96 }])
    expect(exitArrowRectsForEdge(ranges, 'bottom', IMAGE)).toEqual([{ left: 32, top: 272, right: 96, bottom: 288 }])
  })
})

describe('imageDrawRepeatedPositions (ImageDrawRepeated)', () => {
  it('tiles whole copies from the rect\'s top-left', () => {
    expect(imageDrawRepeatedPositions(ARROW, { left: 32, top: 0, right: 96, bottom: 16 })).toEqual([
      { x: 32, y: 0 }, { x: 48, y: 0 }, { x: 64, y: 0 }, { x: 80, y: 0 },
    ])
  })
  it('drops a partial copy (integer division of the sizes)', () => {
    expect(imageDrawRepeatedPositions(ARROW, { left: 0, top: 0, right: 40, bottom: 20 })).toEqual([{ x: 0, y: 0 }, { x: 16, y: 0 }])
  })
})

describe('colour (drawExitArrowsOnImage, getHostile)', () => {
  it('is red when the neighbour has a hostile, else green', () => {
    expect(arrowColour(true)).toBe('rdd')
    expect(arrowColour(false)).toBe('grn')
  })
  it('counts only #inf on the exit-arrow progression [#clr, #inf]', () => {
    expect(isHostileForExitArrows(['clr', 'fre', 'spe'])).toBe(false)
    expect(isHostileForExitArrows(['clr', 'inf'])).toBe(true)
    expect(isHostileForExitArrows([])).toBe(false)
  })
})

describe('exitArrowsForRoom (objRoom.drawExitArrows)', () => {
  const edges = (e: Partial<EdgeLists<ExitTile>>): EdgeLists<ExitTile> => ({ left: [], top: [], right: [], bottom: [], ...e })
  const noHostiles = { left: false, top: false, right: false, bottom: false }

  it('draws where both sides are open, coloured by the neighbour on that edge', () => {
    const mine = edges({ right: [S, N, N, S], top: [N, N] })
    const theirs = edges({ right: [S, S, N, N], top: [N, N] })
    const arrows = exitArrowsForRoom(mine, theirs, { ...noHostiles, top: true }, TILE, { w: 128, h: 128 }, ARROW)
    expect(arrows).toEqual([
      { edge: 'top', colour: 'rdd', pos: { x: 0, y: 0 } },
      { edge: 'top', colour: 'rdd', pos: { x: 16, y: 0 } },
      { edge: 'top', colour: 'rdd', pos: { x: 32, y: 0 } },
      { edge: 'top', colour: 'rdd', pos: { x: 48, y: 0 } },
      { edge: 'right', colour: 'grn', pos: { x: 112, y: 64 } },
      { edge: 'right', colour: 'grn', pos: { x: 112, y: 80 } },
    ])
  })

  it('draws nothing on a map edge', () => {
    expect(exitArrowsForRoom(edges({ left: [N, N] }), edges({}), noHostiles, TILE, IMAGE, ARROW)).toEqual([])
  })
})
