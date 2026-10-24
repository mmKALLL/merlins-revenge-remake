// Which screen the page shows (remake UI after the original's movieMaster screens and gameMaster's
// in-game menu): the title screen, the game running, or the game paused under the in-game menu.
// Each menu has sub-panels (maps, settings, help). A roguelite run's floor pick pauses the game
// too, with no menu reachable from it, so the pick is never lost; so does the run's end, on its
// summary, until New run or Main menu. Pure, so the transitions can be tested.

import type { AudioPause } from '../audio/audio'

export type Screen = 'title' | 'playing' | 'paused' | 'picking' | 'summary'
export type Panel = 'main' | 'maps' | 'settings' | 'help'

export interface AppState {
  screen: Screen
  panel: Panel // the panel shown by the title screen or the in-game menu; 'main' while playing
}

export type AppAction =
  | { kind: 'play' } // title -> playing (a game has started)
  | { kind: 'pause' } // playing -> the in-game menu (Esc, ☰; gameMaster.escapePressed)
  | { kind: 'resume' } // the in-game menu -> playing
  | { kind: 'quit' } // the in-game menu, or a roguelite run's summary -> title
  | { kind: 'pick' } // playing -> a roguelite floor's pick screen (Merlin left the floor)
  | { kind: 'picked' } // the pick screen -> playing (both picks made)
  | { kind: 'runEnded' } // playing -> a roguelite run's summary (a death or the win)
  | { kind: 'newRun' } // the run summary -> playing (a new run has started)
  | { kind: 'open'; panel: Panel } // a sub-panel of the current menu
  | { kind: 'back' } // Esc in a menu: a sub-panel -> its menu; the in-game menu -> playing

export const TITLE: AppState = { screen: 'title', panel: 'main' }
export const PLAYING: AppState = { screen: 'playing', panel: 'main' }
const PAUSED: AppState = { screen: 'paused', panel: 'main' }
const PICKING: AppState = { screen: 'picking', panel: 'main' }
const SUMMARY: AppState = { screen: 'summary', panel: 'main' }

/** The title screen and the in-game menu have sub-panels; the game, the pick and the summary none. */
const hasMenu = (s: AppState): boolean => s.screen === 'title' || s.screen === 'paused'

/** The next state; an action that does not apply to the current screen leaves it unchanged. */
export function nextAppState(s: AppState, a: AppAction): AppState {
  switch (a.kind) {
    case 'play':
      return s.screen === 'title' ? PLAYING : s
    case 'pause':
      return s.screen === 'playing' ? PAUSED : s
    case 'resume':
      return s.screen === 'paused' ? PLAYING : s
    case 'quit':
      return s.screen === 'title' ? s : TITLE
    case 'pick':
      return s.screen === 'playing' ? PICKING : s
    case 'picked':
      return s.screen === 'picking' ? PLAYING : s
    case 'runEnded':
      return s.screen === 'playing' ? SUMMARY : s
    case 'newRun':
      return s.screen === 'summary' ? PLAYING : s
    case 'open':
      return hasMenu(s) ? { ...s, panel: a.panel } : s
    case 'back':
      if (!hasMenu(s)) return s
      if (s.panel !== 'main') return { ...s, panel: 'main' }
      return s.screen === 'paused' ? PLAYING : s
  }
}

/** A panel of the menu overlay: the title screen, the in-game menu, a sub-panel of either, or a roguelite run's screens. */
export type PanelKey = 'title' | 'pause' | 'floorPick' | 'runSummary' | Exclude<Panel, 'main'>

/** The panel the overlay shows; null while playing (no overlay). */
export function visiblePanel(s: AppState): PanelKey | null {
  if (s.screen === 'playing') return null
  if (s.screen === 'picking') return 'floorPick'
  if (s.screen === 'summary') return 'runSummary'
  if (s.panel !== 'main') return s.panel
  return s.screen === 'title' ? 'title' : 'pause'
}

/** The simulation (and the end sequence) advances only while playing with no menu open. */
export const simRuns = (s: AppState): boolean => s.screen === 'playing'

/** What the screen pauses of the sound: nothing while playing; the floor pick keeps the music (owner request); every other screen all of it. */
export function audioPause(s: AppState): AudioPause {
  if (simRuns(s)) return 'none'
  return s.screen === 'picking' ? 'effects' : 'all'
}
