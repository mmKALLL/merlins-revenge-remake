// Small player preferences kept in localStorage: the pixel size and the last map started. Storage
// may be blocked; then a choice lasts for this page only.
import { ZOOM_SETTINGS, type ZoomSetting } from '../render/scene'

const ZOOM_KEY = 'mr-remake.zoom'
const LAST_MAP_KEY = 'mr-remake.lastMap'

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

/** The map id started last (Play on the title screen starts it again), or null. */
export const loadLastMap = (): string | null => read(LAST_MAP_KEY) || null

export const saveLastMap = (id: string): void => write(LAST_MAP_KEY, id)
