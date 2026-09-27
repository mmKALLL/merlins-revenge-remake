// Browser console commands for bug reports and test setup (readme "Reporting bugs"):
//   mr.exportState()      the current moment as snapshot JSON, returned and copied to the clipboard
//   mr.loadState(json)    rebuilds that moment in the running page; a snapshot of another map
//                         reloads the page on that map and loads it there (via sessionStorage)
import type { ActorDef } from '../mr-open/mr-actor-data'
import type { TeamDef } from '../mr-open/mr-team-data'
import type { AnimationSet, SimState } from '../sim/state'
import type { WorldGrid } from '../sim/world-grid'
import { deserializeSim, hashData, parseSnapshot, serializeSim, type InputLog, type SimSnapshot } from './sim-snapshot'

export interface StateExportHooks {
  mapId: string
  grid: WorldGrid
  defs: Record<string, ActorDef>
  teams: Record<string, TeamDef>
  anims: Record<string, AnimationSet>
  inputs: InputLog
  getSim(): SimState
  /** the seed of the current run */
  getSeed(): number
  /** replaces the running sim and run seed; the page matches its camera to the sim's world mode */
  restore(sim: SimState, seed: number): void
}

/** A snapshot of another map waiting for the page reload that opens its map. */
const PENDING_KEY = 'mr-remake.pendingSnapshot'

function copyToClipboard(text: string): void {
  if (!navigator.clipboard) {
    console.info('mr.exportState: no clipboard here; copy the returned text (or run copy(mr.exportState()))')
    return
  }
  navigator.clipboard.writeText(text).then(
    () => console.info(`mr.exportState: snapshot copied to the clipboard (${text.length} characters)`),
    // writeText needs the page focused; running the command from DevTools often leaves it unfocused
    () => console.info('mr.exportState: the clipboard refused (page not focused); copy the returned text, or run copy(mr.exportState())'),
  )
}

function takePending(): string | null {
  try {
    const json = sessionStorage.getItem(PENDING_KEY)
    sessionStorage.removeItem(PENDING_KEY)
    return json
  } catch {
    return null
  }
}

/** Reloads the page on the snapshot's map (and camera for its world mode), which then loads the snapshot. */
function reloadOnMap(snap: SimSnapshot, json: string): void {
  try {
    sessionStorage.setItem(PENDING_KEY, json)
  } catch {
    console.error(`mr.loadState: cannot keep the snapshot across a reload (storage blocked); open ?map=${snap.mapId} and run mr.loadState again`)
    return
  }
  const params = new URLSearchParams(location.search)
  params.set('map', snap.mapId)
  params.set('camera', snap.worldMode === 'continuous' ? 'follow' : 'room')
  console.info(`mr.loadState: the snapshot is for map ${snap.mapId}; reloading`)
  location.assign(`${location.pathname}?${params}${location.hash}`)
}

/** Adds exportState and loadState to `window.mr`, and loads a snapshot left by a map-switching reload. */
export function installStateExport(h: StateExportHooks): void {
  const dataHash = hashData(h.defs, h.teams)

  const exportState = (): string => {
    const json = serializeSim(h.getSim(), { mapId: h.mapId, seed: h.getSeed(), dataHash, inputs: h.inputs.entries() })
    copyToClipboard(json)
    return json
  }

  const loadState = (json: string | SimSnapshot): void => {
    const text = typeof json === 'string' ? json : JSON.stringify(json)
    const snap = parseSnapshot(text)
    if (snap.mapId !== h.mapId) {
      reloadOnMap(snap, text)
      return
    }
    if (snap.dataHash !== dataHash) {
      console.warn(`mr.loadState: the snapshot was taken with other actor/team data (hash ${snap.dataHash}, this page ${dataHash}); it may play out differently`)
    }
    h.restore(deserializeSim(snap, h.grid, h.defs, h.teams, h.anims), snap.seed)
    console.info(`mr.loadState: loaded tick ${snap.tick} of ${snap.mapId} (${snap.worldMode})`)
  }

  const w = window as unknown as { mr?: Record<string, unknown> }
  w.mr = { ...w.mr, exportState, loadState }

  const pending = takePending()
  if (pending !== null) loadState(pending)
}
