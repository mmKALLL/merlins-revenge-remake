import { describe, expect, it } from 'vitest'
import type { MapDefinition } from '../src/mr-open/mr-map-format'
import { EMPTY_SYMBOL, applyMapPatch } from './map-patch'

const SYMBOLS = ['none', 'player', 'goblinWarrior']
const map: MapDefinition = {
  mapSize: { x: 1, y: 1 }, roomSize: { x: 3, y: 2 }, startRoom: { x: 1, y: 1 },
  layers: [{ name: 'objects', tileSet: 'o' }],
  rooms: [{ num: 1, layers: { objects: [[0, 3, 0], [2, 0, 0]] } }],
}

describe('applyMapPatch', () => {
  it('places a symbol, and the empty symbol clears a tile', () => {
    const patched = applyMapPatch(map, { objects: [{ room: 1, col: 3, row: 2, symbol: 'goblinWarrior' }, { room: 1, col: 2, row: 1, symbol: EMPTY_SYMBOL }] }, SYMBOLS, 'test')
    expect(patched.rooms[0]!.layers.objects).toEqual([[0, 0, 0], [2, 0, 3]])
    expect(map.rooms[0]!.layers.objects).toEqual([[0, 3, 0], [2, 0, 0]]) // the original is untouched
  })
})
