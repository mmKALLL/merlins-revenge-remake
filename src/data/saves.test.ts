import { describe, expect, it } from 'vitest'
import { snapshotOf, type SimSnapshot } from '../debug/sim-snapshot'
import { pageDataHash, startSimOnMap } from '../debug/snapshot-test-data'
import type { RemovableStore } from './favourites'
import { dropSave, MAX_SAVES, readSave, saveKey, savedMapIds, writeSave, type MapSave } from './saves'

const MAP = 'test_maps/combat_test'
const SEED = 12345
const snapshot: SimSnapshot = snapshotOf(startSimOnMap(MAP, SEED), { mapId: MAP, seed: SEED, dataHash: pageDataHash })

const saveOf = (mapId: string, loaded = false): MapSave =>
  ({ snapshot: { ...snapshot, mapId }, loaded, layoutSeed: null, difficulty: 'hard', music: null })

const memoryStore = (): RemovableStore & { data: Map<string, string> } => {
  const data = new Map<string, string>()
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) }
}

describe('saves', () => {
  it('round-trips a save, and dropSave removes it', () => {
    const store = memoryStore()
    writeSave(store, saveOf(MAP, true), 1)
    const back = readSave(store, MAP)
    expect(back?.loaded).toBe(true)
    expect(back?.snapshot.actors).toEqual(snapshot.actors)
    expect(back?.snapshot.rng).toEqual(snapshot.rng)
    expect(savedMapIds(store)).toEqual(new Set([MAP]))
    dropSave(store, MAP)
    expect(readSave(store, MAP)).toBeNull()
    expect(savedMapIds(store).size).toBe(0)
  })

  it('keeps at most MAX_SAVES, dropping the least recently written', () => {
    const store = memoryStore()
    for (let i = 0; i <= MAX_SAVES; i++) writeSave(store, saveOf(`map${i}`), i)
    writeSave(store, saveOf('map1'), MAX_SAVES + 1) // rewriting a kept map drops nothing
    expect(savedMapIds(store).size).toBe(MAX_SAVES)
    expect(savedMapIds(store).has('map0')).toBe(false)
    expect(store.data.has(saveKey('map0'))).toBe(false)
    expect(savedMapIds(store).has('map1')).toBe(true)
  })

  it('reads a save of another snapshot version, or one that does not parse, as none and drops it', () => {
    const store = memoryStore()
    writeSave(store, { ...saveOf(MAP), snapshot: { ...snapshot, version: 99 } }, 1)
    expect(readSave(store, MAP)).toBeNull()
    expect(store.data.has(saveKey(MAP))).toBe(false)
    expect(savedMapIds(store).size).toBe(0)
    store.data.set(saveKey(MAP), '{not json')
    expect(readSave(store, MAP)).toBeNull()
    expect(store.data.has(saveKey(MAP))).toBe(false)
  })

  it('when storage is full, drops the oldest other save and writes the new one', () => {
    const store = memoryStore()
    writeSave(store, saveOf('old'), 1)
    writeSave(store, saveOf('newer'), 2)
    let fullOnce = true
    const full: RemovableStore = {
      ...store,
      setItem: (k, v) => {
        if (k === saveKey(MAP) && fullOnce) {
          fullOnce = false
          throw new Error('QuotaExceededError')
        }
        store.setItem(k, v)
      },
    }
    writeSave(full, saveOf(MAP), 3)
    expect(readSave(store, MAP)).not.toBeNull()
    expect(savedMapIds(store)).toEqual(new Set(['newer', MAP]))
  })

  it('survives blocked storage', () => {
    const blocked: RemovableStore = {
      getItem: () => { throw new Error('blocked') },
      setItem: () => { throw new Error('blocked') },
      removeItem: () => { throw new Error('blocked') },
    }
    expect(() => writeSave(blocked, saveOf(MAP))).not.toThrow()
    expect(readSave(blocked, MAP)).toBeNull()
    expect(savedMapIds(blocked).size).toBe(0)
  })
})
