// Which screen the page shows (remake UI after the original's movieMaster screens and gameMaster's
// in-game menu): the title screen, the game running, or the game paused under the in-game menu.
// Each menu has sub-panels (maps, settings, help). A roguelite run's floor pick pauses the game
// too, with no menu reachable from it, so the pick is never lost. Pure, so the transitions can be tested.

export type Screen = 'title' | 'playing' | 'paused' | 'picking'
export type Panel = 'main' | 'maps' | 'settings' | 'help'

export interface AppState {
  screen: Screen
  panel: Panel // the panel shown by the title screen or the in-game menu; 'main' while playing
}

export type AppAction =
  | { kind: 'play' } // title -> playing (a game has started)
  | { kind: 'pause' } // playing -> the in-game menu (Esc, ☰; gameMaster.escapePressed)
  | { kind: 'resume' } // the in-game menu -> playing
  | { kind: 'quit' } // the in-game menu, or a roguelite run's end -> title
  | { kind: 'pick' } // playing -> a roguelite floor's pick screen (Merlin left the floor)
  | { kind: 'picked' } // the pick screen -> playing (both picks made)
  | { kind: 'open'; panel: Panel } // a sub-panel of the current menu
  | { kind: 'back' } // Esc in a menu: a sub-panel -> its menu; the in-game menu -> playing

export const TITLE: AppState = { screen: 'title', panel: 'main' }
export const PLAYING: AppState = { screen: 'playing', panel: 'main' }
const PAUSED: AppState = { screen: 'paused', panel: 'main' }
const PICKING: AppState = { screen: 'picking', panel: 'main' }

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
    case 'open':
      return s.screen === 'playing' || s.screen === 'picking' ? s : { ...s, panel: a.panel }
    case 'back':
      if (s.screen === 'playing' || s.screen === 'picking') return s
      if (s.panel !== 'main') return { ...s, panel: 'main' }
      return s.screen === 'paused' ? PLAYING : s
  }
}

/** A panel of the menu overlay: the title screen, the in-game menu, or a sub-panel of either. */
export type PanelKey = 'title' | 'pause' | 'floorPick' | Exclude<Panel, 'main'>

/** The panel the overlay shows; null while playing (no overlay). */
export function visiblePanel(s: AppState): PanelKey | null {
  if (s.screen === 'playing') return null
  if (s.screen === 'picking') return 'floorPick'
  if (s.panel !== 'main') return s.panel
  return s.screen === 'title' ? 'title' : 'pause'
}

/** The simulation (and the end sequence) advances only while playing with no menu open. */
export const simRuns = (s: AppState): boolean => s.screen === 'playing'
