import { cameraOrigin, type CameraMode, type Size } from '../sim/view'

export { cameraOrigin, type CameraMode, type Size }

/** Largest integer zoom at which the logical screen fits the window (never below 1). */
export function chooseZoom(logical: Size, window: Size): number {
  return Math.max(1, Math.floor(Math.min(window.w / logical.w, window.h / logical.h)))
}
