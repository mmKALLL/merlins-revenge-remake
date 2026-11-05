// When the page writes and loads the autosaves (docs/plans/2026-11-06-save-load-design.md; engine
// notes save-load). The original saved from its menu at any time but a cut scene, and its game over
// reloaded that save (movieMaster.txt:120-121 goScreen(#gameScreen, #loadGame)). Remake: the map
// saves itself on each room clear; a death loads that save, or restarts the map when there is none.
import { ROGUELITE_MAP_ID } from '../gen/generated-maps'
import { isAlive, playerOf } from '../sim/actors'
import type { SimState } from '../sim/state'
import type { MapSave } from './saves'

/** Whether a map keeps a save at all: never a roguelite floor (owner: the roguelite never saves or loads). */
export const savesMap = (mapId: string, markExit: boolean): boolean => !markExit && mapId !== ROGUELITE_MAP_ID


/**
 * Whether the tick from `before` to `after` cleared a room: its exits opened, or (the continuous
 * world, which opens no exits) a room with hostiles in it had its points banked.
 */
export function roomCleared(before: SimState, after: SimState): boolean {
  if (after.events.some((e) => e.kind === 'exitsOpened')) return true
  return Object.entries(after.score.rooms).some(([key, r]) => r.banked && !r.clearOnEntry && !before.score.rooms[key]?.banked)
}

export interface AutoSaveMoment {
  /** the Auto-save setting */
  autoSave: boolean
  mapId: string
  /** the map is a roguelite floor */
  markExit: boolean
  /** the tick just stepped */
  before: SimState
  after: SimState
}

/**
 * Whether to write the map's save after a tick: a room was cleared, with Auto-save on, on a map that
 * saves, and Merlin alive (a save of his death would replay it). Not on the map-complete tick (owner):
 * the save stays the previous room's, so Continue does not replay the ending.
 */
export function shouldAutoSave(m: AutoSaveMoment): boolean {
  if (!m.autoSave || !savesMap(m.mapId, m.markExit)) return false
  const completes = m.after.events.some((e) => e.kind === 'mapComplete')
  return !completes && isAlive(playerOf(m.after)) && !m.after.restartRequested && roomCleared(m.before, m.after)
}

export type AfterGameOver = { kind: 'load'; save: MapSave } | { kind: 'restart' }

/** What follows the game over's cut scene: the map's save loads, or without one the map restarts. */
export const afterGameOver = (save: MapSave | null): AfterGameOver => (save === null ? { kind: 'restart' } : { kind: 'load', save })
