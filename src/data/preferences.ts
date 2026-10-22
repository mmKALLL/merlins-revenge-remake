// Small player preferences kept in localStorage: the pixel size, the Space mode, the random maps mode and the last map started. Storage
// may be blocked; then a choice lasts for this page only.
import { SPACE_MODES, type SpaceMode } from '../input/keyboard'
import { ZOOM_SETTINGS, type ZoomSetting } from '../render/scene'

const ZOOM_KEY = 'mr-remake.zoom'
const LAST_MAP_KEY = 'mr-remake.lastMap'
const SPACE_MODE_KEY = 'mr-remake.spaceMode'
const RANDOM_MAPS_KEY = 'mr-remake.randomMaps'

/** Whether each run of a generated map (a restart too) gets a new layout, or keeps the one it has. */
export const RANDOM_MAPS_MODES = ['newEachRun', 'sameLayout'] as const
export type RandomMapsMode = (typeof RANDOM_MAPS_MODES)[number]

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null // storage blocked
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // storage blocked: the choice lasts for this page only
  }
}

export function loadZoom(fallback: ZoomSetting): ZoomSetting {
  const v = read(ZOOM_KEY)
  return ZOOM_SETTINGS.find((s) => String(s) === v) ?? fallback
}

export const saveZoom = (z: ZoomSetting): void => write(ZOOM_KEY, String(z))

/** A stored Space mode, or null for a missing or unknown value. */
export function parseSpaceMode(v: string | null): SpaceMode | null {
  return SPACE_MODES.find((m) => m === v) ?? null
}

export const loadSpaceMode = (fallback: SpaceMode): SpaceMode => parseSpaceMode(read(SPACE_MODE_KEY)) ?? fallback

export const saveSpaceMode = (m: SpaceMode): void => write(SPACE_MODE_KEY, m)

export const loadRandomMaps = (fallback: RandomMapsMode): RandomMapsMode =>
  RANDOM_MAPS_MODES.find((m) => m === read(RANDOM_MAPS_KEY)) ?? fallback

export const saveRandomMaps = (m: RandomMapsMode): void => write(RANDOM_MAPS_KEY, m)

/** The map id started last (Play on the title screen starts it again), or null. */
export const loadLastMap = (): string | null => read(LAST_MAP_KEY) || null

export const saveLastMap = (id: string): void => write(LAST_MAP_KEY, id)
