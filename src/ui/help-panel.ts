// How to play: the keyboard and touch controls and the goal (the original's #instructions). On a
// touch device the touch controls come first.
import { el, panel } from './dom'
import type { MenuPanel } from './overlay'

type Line = [keys: string, action: string]

const KEYBOARD: Line[] = [
  ['WASD / arrow keys', 'move'],
  ['E or left mouse button', 'hold to charge the current spell, release to fire at the mouse (a sword or punch swings while held)'],
  ['Space', 'hold to charge, release to fire at the nearest enemy'],
  ['1-9', 'pick the first to ninth spell Merlin has collected (spell scrolls lie on some maps)'],
  ['Q', 'show the weapon palettes at the mouse for 2 s: spells above, punch and sword below; click one to pick it'],
  ['F', 'switch what Space fires at between the nearest enemy and a push-back shot that lands short of it (Settings also offers the mouse cursor)'],
  ['C', 'switch between the room camera and the follow camera'],
  ['N', 'hide or show the mini-map (bottom right, shown while no enemy is near)'],
  ['Esc', 'menu (pauses the game)'],
  ['Enter', 'play the map again after it is complete'],
  ['R', 'summon the whole reserve army at the nearest enemy (at the mouse in the mouse cursor Space mode); with the army out, send it all back into the reserve'],
  ['K / M', 'debug cheats: kill the enemies on screen / one more medikit'],
]

const TOUCH: Line[] = [
  ['Left half', 'press anywhere and drag to walk in that direction'],
  ['Yellow button', 'hold to charge, let go to fire at the nearest enemy (or the push-back shot, set in Settings; the mouse mode aims at the nearest enemy without a mouse)'],
  ['Weapon button', 'shows the current weapon; tap for the next one'],
  ['☰', 'menu (pauses the game)'],
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
  const goal = el('p', '', 'Clear each room of enemies to open its exits; green exit arrows lead to rooms with no enemies left, red ones to rooms that still have some. ' +
    'The map is complete once every room is clear. The bar at the bottom left is Merlin\'s health; ' +
    'the map starts again when it runs out.')
  const sections = [controls('Touch', TOUCH), controls('Keyboard and mouse', KEYBOARD)]
  body.append(goal, ...(touch ? sections : sections.reverse()))
  return { root }
}
