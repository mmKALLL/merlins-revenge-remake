// Continue, New game or Back to menu (docs/plans/2026-11-06-save-load-design.md, Opening): shown when
// a map with a save is opened. It also tells when a save could not be loaded (it names an actor the
// game no longer has), without Continue. The overlay steps between the buttons with the arrows or WASD.
import { button, el, menuList, panel } from './dom'
import type { MenuPanel } from './overlay'

/** What the player chose: carry on from the save, start the map again, or go back to the title screen. */
export type RunChoice = 'continue' | 'newGame' | 'menu'

export interface ContinueChoicePanel extends MenuPanel {
  /** Fills the panel for a saved map; `choose` gets the choice. The overlay shows it next. */
  ask(mapId: string, choose: (choice: RunChoice) => void): void
  /** Fills the panel to tell the map's save could not be loaded: New game or Back to menu. */
  tellUnloadable(mapId: string, choose: (choice: Exclude<RunChoice, 'continue'>) => void): void
}

export function continueChoice(): ContinueChoicePanel {
  const { root, body } = panel('Saved game')
  const map = el('p', 'hint')
  const note = el('p', 'hint')
  let pending: ((choice: RunChoice) => void) | null = null
  // one choice per fill: a double click starts nothing twice
  const choose = (choice: RunChoice) => {
    const answer = pending
    pending = null
    answer?.(choice)
  }
  const continueButton = button('Continue', () => choose('continue'), 'primary')
  const newGameButton = button('New game', () => choose('newGame'))
  const menuButton = button('Back to menu', () => choose('menu'))
  body.append(map, note, menuList(continueButton, newGameButton, menuButton))
  const fill = (mapId: string, text: string, canContinue: boolean, answer: (choice: RunChoice) => void) => {
    map.textContent = `Map: ${mapId}`
    note.textContent = text
    continueButton.hidden = continueButton.disabled = !canContinue
    pending = answer
  }
  return {
    root,
    ask: (mapId, answer) => fill(mapId, 'Continue from the last room cleared, or start the map again?', true, answer),
    tellUnloadable: (mapId, answer) => fill(mapId, 'The save could not be loaded: it was made with an older version of the game.', false, (choice) => answer(choice === 'menu' ? 'menu' : 'newGame')),
  }
}
