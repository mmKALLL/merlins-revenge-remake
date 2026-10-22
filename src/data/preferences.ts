// Small player preferences kept in localStorage: the pixel size, the Space mode, the random maps mode, the debug
// readout and the last map started. Storage
// may be blocked; then a choice lasts for this page only.
import { SPACE_MODES, type SpaceMode } from '../input/keyboard'
import { ZOOM_SETTINGS, type ZoomSetting } from '../render/scene'

const ZOOM_KEY = 'mr-remake.zoom'
const LAST_MAP_KEY = 'mr-remake.lastMap'
const SPACE_MODE_KEY = 'mr-remake.spaceMode'
const RANDOM_MAPS_KEY = 'mr-remake.randomMaps'
const DEBUG_INFO_KEY = 'mr-remake.debugInfo'

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

/**
 * Whether the debug readout shows: the `debug` URL parameter when given (`?debug` or `?debug=1` on,
 * `?debug=0` off), else the stored choice, else off.
 */
export function debugInfoOn(param: string | null, stored: string | null): boolean {
  if (param !== null) return param !== '0'
  return stored === 'on'
}

export const loadDebugInfo = (param: string | null): boolean => debugInfoOn(param, read(DEBUG_INFO_KEY))

export const saveDebugInfo = (on: boolean): void => write(DEBUG_INFO_KEY, on ? 'on' : 'off')

/** The map id started last (Play on the title screen starts it again), or null. */
export const loadLastMap = (): string | null => read(LAST_MAP_KEY) || null

export const saveLastMap = (id: string): void => write(LAST_MAP_KEY, id)
