import { describe, expect, it } from 'vitest'
import { deserializeSim, serializeSim, snapshotOf } from '../debug/sim-snapshot'
import { pageDataHash, pageDefs, pageTeams, startSimOnMap } from '../debug/snapshot-test-data'
import { ROGUELITE_MAP_ID } from '../gen/generated-maps'
import { anims } from '../sim/test-data'
import { stepSim } from '../sim/tick'
import { NO_INPUT, type SimState } from '../sim/state'
import { afterGameOver, roomCleared, shouldAutoSave } from './autosave'
import type { RemovableStore } from './favourites'
import { readSave, writeSave, type MapSave } from './saves'

const MAP = 'test_maps/combat_test'
const SEED = 4242
/** Ticks the test gives the kill cheat to clear the start room. */
const MAX_TICKS = 300
const KILL = { ...NO_INPUT, cheatKillAll: true }

/** The sim stepped (the kill cheat held) until a tick clears a room. */
function untilRoomCleared(s: SimState): { before: SimState; after: SimState } {
  for (let i = 0; i < MAX_TICKS; i++) {
    const after = stepSim(s, KILL)
    if (roomCleared(s, after)) return { before: s, after }
    s = after
  }
  throw new Error('no room cleared')
}

const memoryStore = (): RemovableStore => {
  const data = new Map<string, string>()
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) }
}

const cleared = untilRoomCleared(startSimOnMap(MAP, SEED))
const moment = { autoSave: true, mapId: MAP, markExit: false, ...cleared }

describe('autosave', () => {
  it('saves after a room clear on a normal map with Auto-save on', () => {
    expect(shouldAutoSave(moment)).toBe(true)
    expect(shouldAutoSave({ ...moment, after: cleared.before, before: cleared.before })).toBe(false) // no clear this tick
    expect(shouldAutoSave({ ...moment, autoSave: false })).toBe(false)
  })

  it('never saves a roguelite floor', () => {
    expect(shouldAutoSave({ ...moment, markExit: true })).toBe(false)
    expect(shouldAutoSave({ ...moment, mapId: ROGUELITE_MAP_ID })).toBe(false)
  })

  it('never saves Merlin dying', () => {
    const dying = { ...cleared.after, actors: cleared.after.actors.map((a) => (a.id === cleared.after.playerId ? { ...a, energy: 0 } : a)) }
    expect(shouldAutoSave({ ...moment, after: dying })).toBe(false)
    expect(shouldAutoSave({ ...moment, after: { ...cleared.after, restartRequested: true } })).toBe(false)
  })

  it('a death with a save loads it; without one the map restarts', () => {
    const save: MapSave = { snapshot: snapshotOf(cleared.after, { mapId: MAP, seed: SEED, dataHash: pageDataHash }), loaded: false, layoutSeed: null, difficulty: 'hard', music: null }
    expect(afterGameOver(save)).toEqual({ kind: 'load', save })
    expect(afterGameOver(null)).toEqual({ kind: 'restart' })
  })

  it('a save taken at a room clear loads the same sim, which steps on alike', () => {
    const store = memoryStore()
    const extras = { mapId: MAP, seed: SEED, dataHash: pageDataHash }
    writeSave(store, { snapshot: snapshotOf(cleared.after, extras), loaded: false, layoutSeed: null, difficulty: 'hard', music: null })
    const save = readSave(store, MAP)!
    const loaded = deserializeSim(save.snapshot, cleared.after.grid, pageDefs, pageTeams, anims)
    expect(serializeSim(loaded, extras)).toBe(serializeSim(cleared.after, extras))
    let a = cleared.after
    let b = loaded
    for (let i = 0; i < MAX_TICKS; i++) {
      a = stepSim(a, NO_INPUT)
      b = stepSim(b, NO_INPUT)
    }
    expect(serializeSim(b, extras)).toBe(serializeSim(a, extras))
  })
})
