// Settings: pixel size, camera, what Space (and the touch blast button) fires at, whether random
// maps get a new layout each run, the frame rate, the debug readout, music, effects and the master volume. The page owns the values (main.ts); this only shows and changes them.
import type { AudioEngine } from '../audio/audio'
import type { FrameRate, RandomMapsMode } from '../data/preferences'
import type { SpaceMode } from '../input/keyboard'
import type { CameraMode } from '../render/camera'
import { ZOOM_SETTINGS, type ZoomSetting } from '../render/scene'
import { button, el, panel } from './dom'
import type { MenuPanel } from './overlay'

export interface SettingsHost {
  zoom(): ZoomSetting
  setZoom(z: ZoomSetting): void
  camera(): CameraMode
  setCamera(c: CameraMode): void
  spaceMode(): SpaceMode // what Space and the touch blast button fire at (F and the touch target button toggle nearest and farthest)
  setSpaceMode(m: SpaceMode): void
  randomMaps(): RandomMapsMode
  setRandomMaps(m: RandomMapsMode): void
  seedInUrl(): boolean // whether a generated map's seed goes into the page URL, to share or reload the layout
  setSeedInUrl(on: boolean): void
  frameRate(): FrameRate
  setFrameRate(r: FrameRate): void
  debugInfo(): boolean // the fps / tick / room / position readout below the play view
  setDebugInfo(on: boolean): void
  audio: AudioEngine
}

interface Choice<T> {
  value: T
  label: string
  title?: string
}

const zoomChoice = (z: ZoomSetting): Choice<ZoomSetting> => ({
  value: z,
  label: typeof z === 'number' ? `${z}x` : z,
  title: z === 'fit' ? 'Largest whole multiple that fits the window'
    : z === 'scale' ? 'Fill the window at any multiple (pixels may be uneven)'
      : `${z} screen pixels per game pixel`,
})

/** A labelled row of buttons, one of them pressed; returns a function that repaints it. */
function choiceRow<T>(parent: HTMLElement, label: string, choices: Choice<T>[], get: () => T, set: (v: T) => void): () => void {
  const row = el('div', 'setting')
  const name = el('span', 'setting-name', label)
  const group = el('div', 'choices')
  group.setAttribute('role', 'group')
  group.setAttribute('aria-label', label)
  const paint = () => {
    for (const [c, b] of buttons) b.setAttribute('aria-pressed', String(c.value === get()))
  }
  const buttons = choices.map((c) => {
    const b = button(c.label, () => {
      set(c.value)
      paint()
    })
    if (c.title) b.title = c.title
    group.appendChild(b)
    return [c, b] as const
  })
  row.append(name, group)
  parent.appendChild(row)
  paint()
  return paint
}

const ON_OFF: Choice<boolean>[] = [{ value: true, label: 'on' }, { value: false, label: 'off' }]

function volumeRow(parent: HTMLElement, audio: AudioEngine): () => void {
  const row = el('label', 'setting')
  const name = el('span', 'setting-name', 'Volume')
  const slider = el('input')
  slider.type = 'range'
  slider.min = '0'
  slider.max = '100'
  slider.addEventListener('input', () => audio.setVolume(Number(slider.value)))
  row.append(name, slider)
  parent.appendChild(row)
  return () => { slider.value = String(audio.current.volume) }
}

export function settingsPanel(host: SettingsHost, back: () => void): MenuPanel {
  const { root, body } = panel('Settings', back)
  const { audio } = host
  const repaint = [
    choiceRow(body, 'Pixel size', ZOOM_SETTINGS.map(zoomChoice), host.zoom, host.setZoom),
    choiceRow(body, 'Camera', [
      { value: 'room', label: 'Single room', title: 'Room by room, as in the original' },
      { value: 'follow', label: 'Open world', title: 'Follows Merlin through the whole map as one world (C)' },
    ], host.camera, host.setCamera),
    choiceRow(body, 'Spacebar shot targeting', [
      { value: 'nearest', label: 'Nearest', title: 'The nearest enemy on screen (F toggles with farthest)' },
      { value: 'mouse', label: 'Mouse cursor', title: 'The mouse cursor, like E; the touch button without a mouse aims at the nearest enemy' },
      { value: 'farthest', label: 'Farthest', title: 'The farthest enemy on screen (F toggles with nearest)' },
    ], host.spaceMode, host.setSpaceMode),
    choiceRow(body, 'Random maps', [
      { value: 'newEachRun', label: 'New each run', title: 'Every restart of a generated map builds a new layout' },
      { value: 'sameLayout', label: 'Same layout', title: 'Restarts keep the layout (Play from the title still builds a new one)' },
    ], host.randomMaps, host.setRandomMaps),
    choiceRow(body, 'Seed in URL', ON_OFF, host.seedInUrl, host.setSeedInUrl),
    choiceRow(body, 'Frame rate', [
      { value: '60', label: '60 fps', title: 'Draws 60 frames a second, blending between the 30 game ticks' },
      { value: 'display', label: 'Display rate', title: 'Draws at every refresh of the display (120 Hz and up on some screens)' },
    ], host.frameRate, host.setFrameRate),
    choiceRow(body, 'Debug info', ON_OFF, host.debugInfo, host.setDebugInfo),
    choiceRow(body, 'Music', ON_OFF, () => audio.current.music, (on) => audio.setMusic(on)),
    choiceRow(body, 'Effects', ON_OFF, () => audio.current.effects, (on) => audio.setEffects(on)),
    volumeRow(body, audio),
  ]
  return { root, onShow: () => { for (const r of repaint) r() } }
}
