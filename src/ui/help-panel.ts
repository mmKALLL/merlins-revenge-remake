// How to play: the keyboard and touch controls and the goal (the original's #instructions). On a
// touch device the touch controls come first.
import { el, panel } from './dom'
import type { MenuPanel } from './overlay'

type Line = [keys: string, action: string]

// owner: the game is meant for kids, so each line says what a key does in a few words
const KEYBOARD: Line[] = [
  ['WASD / arrows', 'walk'],
  ['Left click', 'charge and fire at the mouse'],
  ['Space', 'charge and fire at enemies'],
  ['F', 'nearest or farthest enemy'],
  ['1-9', 'pick a spell'],
  ['Q', 'show all spells'],
  ['R', 'call or send home your army'],
  ['E', 'golden gun on/off'],
  ['C', 'switch camera'],
  ['N', 'hide or show the map'],
  ['Esc', 'pause menu'],
]

const TOUCH: Line[] = [
  ['Left side', 'drag to walk'],
  ['Yellow button', 'hold, then let go to fire'],
  ['NEAR / FAR', 'nearest or farthest enemy'],
  ['Weapon button', 'next spell'],
  ['Blue button', 'call or send home your army'],
  ['Gun button', 'golden gun on/off'],
  ['☰', 'pause menu'],
]

function controls(title: string, lines: Line[]): HTMLElement {
  const section = el('div', 'help-section')
  const list = el('dl')
  for (const [keys, action] of lines) list.append(el('dt', '', keys), el('dd', '', action))
  section.append(el('h3', '', title), list)
  return section
}

export function helpPanel(touch: boolean, back: () => void): MenuPanel {
  const { root, body } = panel('How to play', back)
  const goal = el('p', '', 'Defeat the enemies in every room. Don\'t let your health bar run out!')
  const sections = [controls('Touch', TOUCH), controls('Keyboard and mouse', KEYBOARD)]
  body.append(goal, ...(touch ? sections : sections.reverse()))
  return { root }
}
