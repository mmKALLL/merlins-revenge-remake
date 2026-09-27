// Node-only helpers that turn a pasted state snapshot (mr.exportState() in the browser) into a sim
// for a regression test, with the same converted data the page loads (pnpm assets:convert):
// public/generated/actors.json (tuning included), teams.json, the map and its tilesets.
import { readFileSync } from 'node:fs'
import type { ActorDef } from '../mr-open/mr-actor-data'
import type { MapDefinition } from '../mr-open/mr-map-format'
import type { TeamDef } from '../mr-open/mr-team-data'
import type { SimState, WorldMode } from '../sim/state'
import { anims } from '../sim/test-data'
import { createSim, findStartPos } from '../sim/tick'
import { buildWorldGrid, type WorldGrid } from '../sim/world-grid'
import { deserializeSim, hashData, parseSnapshot, type SimSnapshot } from './sim-snapshot'

const GENERATED = 'public/generated'
const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T

/** The actor definitions and teams the page loads. */
export const pageDefs = readJson<Record<string, ActorDef>>(`${GENERATED}/actors.json`)
export const pageTeams = readJson<Record<string, TeamDef>>(`${GENERATED}/teams.json`)
export const pageDataHash = hashData(pageDefs, pageTeams)

interface MapData {
  grid: WorldGrid
  playerTile: number | null
}

/** A map's world grid, built as main.ts builds it (solid backgroundActive symbols, objects-layer symbols). */
function loadMapData(mapId: string): MapData {
  const map = readJson<MapDefinition>(`${GENERATED}/maps/${mapId}.json`)
  const symbols = (layer: string): string[] => {
    const name = map.layers.find((l) => l.name === layer)?.tileSet
    if (!name) throw new Error(`map ${mapId} has no ${layer} layer`)
    return readJson<{ symbols: string[] }>(`${GENERATED}/tilesets/${name}.json`).symbols
  }
  const active = symbols('backgroundActive')
  const objects = symbols('objects')
  const grid = buildWorldGrid(map, (i) => i >= 1 && active[i - 1] === 'solid', objects)
  return { grid, playerTile: objects.indexOf('player') + 1 || null }
}

/** A fresh sim on a map, as the page starts it. */
export function startSimOnMap(mapId: string, seed: number, worldMode: WorldMode = 'rooms'): SimState {
  const { grid, playerTile } = loadMapData(mapId)
  return createSim(grid, pageDefs, pageTeams, anims, seed, findStartPos(grid, playerTile), worldMode)
}

/**
 * The sim at the moment of a pasted snapshot, with the page's data. Warns when the snapshot was
 * taken with other actor or team data (the test still runs, but may not reproduce the report).
 */
export function simFromSnapshot(json: string | SimSnapshot): { sim: SimState; snapshot: SimSnapshot } {
  const snapshot = parseSnapshot(json)
  if (snapshot.dataHash !== pageDataHash) {
    console.warn(`state snapshot data hash ${snapshot.dataHash} differs from the converted data's ${pageDataHash} (tuning changed since it was taken)`)
  }
  const { grid } = loadMapData(snapshot.mapId)
  return { sim: deserializeSim(snapshot, grid, pageDefs, pageTeams, anims), snapshot }
}
