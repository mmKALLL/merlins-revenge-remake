// The in-game menu (gameMaster.escapePressed -> #ingameMenu; its options in menuOptionSelected).
// The original's choose keys, save/load and show army have nothing to act on yet; sound on/off
// lives in Settings.
import type { Panel } from './app-state'
import { button, el, menuList, panel } from './dom'
import type { MenuPanel } from './overlay'

export interface PauseActions {
  resume: () => void
  open: (panel: Exclude<Panel, 'main'>) => void
  restart: () => void
  quit: () => void
}

export function pauseMenu(actions: PauseActions, mapId: () => string): MenuPanel {
  const { root, body } = panel('Paused')
  const map = el('p', 'hint')
  body.append(
    map,
    menuList(
      button('Resume', actions.resume, 'primary'),
      button('Maps', () => actions.open('maps')),
      button('Settings', () => actions.open('settings')),
      button('How to play', () => actions.open('help')),
      button('Restart map', actions.restart),
      button('Quit to title', actions.quit),
    ),
  )
  return { root, onShow: () => { map.textContent = `Map: ${mapId()}` } }
}
