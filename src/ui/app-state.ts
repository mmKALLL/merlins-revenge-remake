// Which screen the page shows (remake UI after the original's movieMaster screens and gameMaster's
// in-game menu): the title screen, the game running, or the game paused under the in-game menu.
// Each menu has sub-panels (maps, settings, help). Pure, so the transitions can be tested.

export type Screen = 'title' | 'playing' | 'paused'
export type Panel = 'main' | 'maps' | 'settings' | 'help'

export interface AppState {
  screen: Screen
  panel: Panel // the panel shown by the title screen or the in-game menu; 'main' while playing
}

export type AppAction =
  | { kind: 'play' } // title -> playing (a game has started)
  | { kind: 'pause' } // playing -> the in-game menu (Esc, ☰; gameMaster.escapePressed)
  | { kind: 'resume' } // the in-game menu -> playing
  | { kind: 'quit' } // the in-game menu -> title
  | { kind: 'open'; panel: Panel } // a sub-panel of the current menu
  | { kind: 'back' } // Esc in a menu: a sub-panel -> its menu; the in-game menu -> playing

export const TITLE: AppState = { screen: 'title', panel: 'main' }
export const PLAYING: AppState = { screen: 'playing', panel: 'main' }
const PAUSED: AppState = { screen: 'paused', panel: 'main' }

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
      return s.screen === 'paused' ? TITLE : s
    case 'open':
      return s.screen === 'playing' ? s : { ...s, panel: a.panel }
    case 'back':
      if (s.screen === 'playing') return s
      if (s.panel !== 'main') return { ...s, panel: 'main' }
      return s.screen === 'paused' ? PLAYING : s
  }
}

/** A panel of the menu overlay: the title screen, the in-game menu, or a sub-panel of either. */
export type PanelKey = 'title' | 'pause' | Exclude<Panel, 'main'>

/** The panel the overlay shows; null while playing (no overlay). */
export function visiblePanel(s: AppState): PanelKey | null {
  if (s.screen === 'playing') return null
  if (s.panel !== 'main') return s.panel
  return s.screen === 'title' ? 'title' : 'pause'
}

/** The simulation (and the end sequence) advances only while playing with no menu open. */
export const simRuns = (s: AppState): boolean => s.screen === 'playing'
