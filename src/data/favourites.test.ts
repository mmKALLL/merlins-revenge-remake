import { describe, expect, it } from 'vitest'
import { FAVOURITES_KEY, favouriteEntries, loadFavourites, saveFavourites, toggleFavourite, type FavouritesStore } from './favourites'

const memoryStore = (initial?: string): FavouritesStore => {
  const data = new Map<string, string>(initial === undefined ? [] : [[FAVOURITES_KEY, initial]])
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) }
}
const blockedStore: FavouritesStore = {
  getItem: () => { throw new Error('blocked') },
  setItem: () => { throw new Error('blocked') },
}

describe('favourite maps', () => {
  it('toggles in the order added and round-trips through storage', () => {
    let ids = toggleFavourite([], 'works/sam')
    ids = toggleFavourite(ids, 'tvsDemo')
    ids = toggleFavourite(ids, 'combat_test')
    ids = toggleFavourite(ids, 'tvsDemo')
    expect(ids).toEqual(['works/sam', 'combat_test'])
    const store = memoryStore()
    saveFavourites(store, ids)
    expect(loadFavourites(store)).toEqual(ids)
  })

  it('reads blocked, malformed or foreign storage as no favourites', () => {
    expect(loadFavourites(blockedStore)).toEqual([])
    expect(() => saveFavourites(blockedStore, ['a'])).not.toThrow()
    expect(loadFavourites(memoryStore('not json'))).toEqual([])
    expect(loadFavourites(memoryStore('{"a":1}'))).toEqual([])
    expect(loadFavourites(memoryStore('["a",2]'))).toEqual([])
  })

  it('lists only maps still in the index, sorted by id', () => {
    const size = { x: 2, y: 1 }
    const index = ['works/sam', 'Beta', 'alpha', 'tvsDemo'].map((id) => ({ id, mapSize: size }))
    expect(favouriteEntries(['works/sam', 'gone', 'Beta', 'alpha'], index).map((e) => e.id)).toEqual(['alpha', 'Beta', 'works/sam'])
  })
})
