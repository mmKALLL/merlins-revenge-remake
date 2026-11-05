// Continue or New game (docs/plans/2026-11-06-save-load-design.md, Opening): shown when a map with a
// save is opened. It also tells when a save could not be loaded (it names an actor the game no
// longer has), with New game only. The overlay steps between the buttons with the arrows or WASD.
import { button, el, menuList, panel } from './dom'
import type { MenuPanel } from './overlay'

export interface ContinueChoicePanel extends MenuPanel {
  /** Fills the panel for a saved map; `choose` gets true for Continue. The overlay shows it next. */
  ask(mapId: string, choose: (continued: boolean) => void): void
  /** Fills the panel to tell the map's save could not be loaded; `newGame` runs on its only button. */
  tellUnloadable(mapId: string, newGame: () => void): void
}

export function continueChoice(): ContinueChoicePanel {
  const { root, body } = panel('Saved game')
  const map = el('p', 'hint')
  const note = el('p', 'hint')
  let pending: ((continued: boolean) => void) | null = null
  // one choice per fill: a double click starts nothing twice
  const choose = (continued: boolean) => {
    const answer = pending
    pending = null
    answer?.(continued)
  }
  const continueButton = button('Continue', () => choose(true), 'primary')
  const newGameButton = button('New game', () => choose(false))
  body.append(map, note, menuList(continueButton, newGameButton))
  const fill = (mapId: string, text: string, canContinue: boolean, answer: (continued: boolean) => void) => {
    map.textContent = `Map: ${mapId}`
    note.textContent = text
    continueButton.hidden = continueButton.disabled = !canContinue
    pending = answer
  }
  return {
    root,
    ask: (mapId, answer) => fill(mapId, 'Continue from the last room cleared, or start the map again?', true, answer),
    tellUnloadable: (mapId, newGame) => fill(mapId, 'The save could not be loaded: it was made with an older version of the game.', false, newGame),
  }
}
