// Settings: the difficulty, pixel size, camera, auto-save, the frame rate, the reserve army display,
// music and effects; folded away under Advanced: the seed in the URL, the map list's scores, what
// Space (and the touch blast button) fires at, whether random maps get a new layout each run, the
// debug readout and the resets. The page owns the values (main.ts); this only shows and changes
// them, and remembers itself whether Advanced is open.
import type { AudioEngine } from '../audio/audio'
import type { BestScoreKind } from '../data/best-scores'
import { loadAdvancedOpen, saveAdvancedOpen, type FrameRate, type RandomMapsMode } from '../data/preferences'
import type { SpaceMode } from '../input/keyboard'
import type { ArmyDisplayMode } from '../render/army-entries'
import type { CameraMode } from '../render/camera'
import { ZOOM_SETTINGS, type ZoomSetting } from '../render/scene'
import type { Difficulty } from '../sim/difficulty'
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
  autoSave(): boolean // whether a room clear saves the map
  setAutoSave(on: boolean): void
  mapListScores(): BestScoreKind // the best scores the map list shows
  setMapListScores(k: BestScoreKind): void
  frameRate(): FrameRate
  setFrameRate(r: FrameRate): void
  armyDisplay(): ArmyDisplayMode // where the reserve army shows on the HUD
  setArmyDisplay(m: ArmyDisplayMode): void
  debugInfo(): boolean // the fps / tick / room / position readout below the play view
  setDebugInfo(on: boolean): void
  difficulty(): Difficulty // applies from the next run
  setDifficulty(d: Difficulty): void
  resetRogueliteStats(): void
  resetBestScores(): void
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

const DIFFICULTY_CHOICES: Choice<Difficulty>[] = [
  { value: 'easy', label: 'Easy' },
  { value: 'normal', label: 'Normal' },
  { value: 'hard', label: 'Hard' },
]

/** The line under the difficulty choice: what it changes. */
const DIFFICULTY_NOTES: Record<Difficulty, string> = {
  hard: 'Only runs on Hard count towards best scores and statistics.',
  normal: 'Start with +25% max HP and 3 medikits. Scores and statistics are not counted.',
  easy: 'Start with +50% max HP, 9 medikits and 4 of each potion. Scores and statistics are not counted.',
}

/** The difficulty choice with its note underneath; the change applies from the next run. */
function difficultyRow(parent: HTMLElement, get: () => Difficulty, set: (d: Difficulty) => void): () => void {
  const note = el('p', 'hint setting-note')
  const paintNote = () => { note.textContent = `${DIFFICULTY_NOTES[get()]} Applies from the next run.` }
  const paintChoice = choiceRow(parent, 'Difficulty', DIFFICULTY_CHOICES, get, (d) => {
    set(d)
    paintNote()
  })
  parent.appendChild(note)
  paintNote()
  return () => {
    paintChoice()
    paintNote()
  }
}

/** A button that runs `reset` once the player confirms `question`. */
function resetRow(parent: HTMLElement, label: string, question: string, reset: () => void): void {
  const row = el('div', 'setting')
  const b = button(label, () => {
    if (window.confirm(question)) reset()
  })
  row.append(b)
  parent.appendChild(row)
}

/** A volume slider (0-100) with a mute box; returns its repaint. */
function volumeRow(parent: HTMLElement, label: string, volume: () => number, setVolume: (v: number) => void, on: () => boolean, setOn: (on: boolean) => void): () => void {
  const row = el('div', 'setting')
  const name = el('span', 'setting-name', label)
  const slider = el('input')
  slider.type = 'range'
  slider.min = '0'
  slider.max = '100'
  slider.setAttribute('aria-label', `${label} volume`)
  slider.addEventListener('input', () => setVolume(Number(slider.value)))
  const mute = el('label', 'mute')
  const box = el('input')
  box.type = 'checkbox'
  box.addEventListener('change', () => setOn(!box.checked))
  mute.append(box, ' mute')
  row.append(name, slider, mute)
  parent.appendChild(row)
  return () => {
    slider.value = String(volume())
    box.checked = !on()
  }
}

/** A heading button that folds a part of the panel away (`open`: unfolded at first); the part's rows go into the returned element. */
function foldPart(parent: HTMLElement, label: string, open: boolean, onToggle: (open: boolean) => void): HTMLElement {
  const part = el('div', 'fold-body')
  part.id = `fold-${label.toLowerCase().replace(/[^a-z]+/g, '-')}`
  const toggle = button(label, () => {
    part.hidden = !part.hidden
    toggle.setAttribute('aria-expanded', String(!part.hidden))
    onToggle(!part.hidden)
  }, 'fold-toggle')
  toggle.setAttribute('aria-controls', part.id)
  part.hidden = !open
  toggle.setAttribute('aria-expanded', String(open))
  parent.append(toggle, part)
  return part
}

export function settingsPanel(host: SettingsHost, back: () => void): MenuPanel {
  const { root, body } = panel('Settings', back)
  const { audio } = host
  const regular = [
    difficultyRow(body, host.difficulty, host.setDifficulty),
    choiceRow(body, 'Pixel size', ZOOM_SETTINGS.map(zoomChoice), host.zoom, host.setZoom),
    choiceRow(body, 'Camera', [
      { value: 'room', label: 'Single room', title: 'Room by room, as in the original' },
      { value: 'follow', label: 'Open world', title: 'Follows Merlin through the whole map as one world (C)' },
    ], host.camera, host.setCamera),
    choiceRow(body, 'Auto-save', [
      { value: true, label: 'on', title: 'Each room clear saves the map; a death carries on from there' },
      { value: false, label: 'off', title: 'No new saves (a map saved earlier can still be continued)' },
    ], host.autoSave, host.setAutoSave),
    choiceRow(body, 'Frame rate', [
      { value: '60', label: '60 fps', title: 'Draws 60 frames a second, blending between the 30 game ticks' },
      { value: 'display', label: 'Display rate', title: 'Draws at every refresh of the display (120 Hz and up on some screens)' },
    ], host.frameRate, host.setFrameRate),
    choiceRow(body, 'Army display', [
      { value: 'right', label: 'Right', title: 'The reserve army in the right margin, where the original showed it' },
      { value: 'top', label: 'Top', title: 'The reserve army in a row above the play view' },
      { value: 'off', label: 'Off', title: 'No reserve army display' },
    ], host.armyDisplay, host.setArmyDisplay),
    volumeRow(body, 'Music', () => audio.current.musicVolume, (v) => audio.setMusicVolume(v), () => audio.current.music, (on) => audio.setMusic(on)),
    volumeRow(body, 'Sound effects', () => audio.current.effectsVolume, (v) => audio.setEffectsVolume(v), () => audio.current.effects, (on) => audio.setEffects(on)),
  ]
  const advanced = foldPart(body, 'Advanced', loadAdvancedOpen(), saveAdvancedOpen)
  const advancedRows = [
    choiceRow(advanced, 'Seed in URL', ON_OFF, host.seedInUrl, host.setSeedInUrl),
    choiceRow(advanced, 'Map list scores', [
      { value: 'withLoading', label: 'With loading', title: 'The best of every run' },
      { value: 'noLoading', label: 'No loading', title: 'The best of the runs that never loaded a save' },
    ], host.mapListScores, host.setMapListScores),
    choiceRow(advanced, 'Spacebar shot targeting', [
      { value: 'nearest', label: 'Nearest', title: 'The nearest enemy on screen (F toggles with farthest)' },
      { value: 'mouse', label: 'Mouse cursor', title: 'The mouse cursor, like E; the touch button without a mouse aims at the nearest enemy' },
      { value: 'farthest', label: 'Farthest', title: 'The farthest enemy on screen (F toggles with nearest)' },
    ], host.spaceMode, host.setSpaceMode),
    choiceRow(advanced, 'Random maps', [
      { value: 'newEachRun', label: 'New each run', title: 'Every restart of a generated map builds a new layout' },
      { value: 'sameLayout', label: 'Same layout', title: 'Restarts keep the layout (Play from the title still builds a new one)' },
    ], host.randomMaps, host.setRandomMaps),
    choiceRow(advanced, 'Debug info', ON_OFF, host.debugInfo, host.setDebugInfo),
  ]
  resetRow(advanced, 'Reset roguelite statistics', 'Reset the roguelite statistics (runs, wins, streaks)? This cannot be undone.', host.resetRogueliteStats)
  resetRow(advanced, 'Reset scores', 'Reset the best scores of every map (with and without loading)? This cannot be undone.', host.resetBestScores)
  return { root, onShow: () => { for (const r of [...regular, ...advancedRows]) r() } }
}
