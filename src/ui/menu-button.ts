// The ☰ button in the top right corner while playing: opens the in-game menu, like Esc (the only
// way on a phone).
import { button } from './dom'

export function menuButton(parent: HTMLElement, open: () => void): HTMLButtonElement {
  const b = button('☰', open)
  b.id = 'menu-button'
  b.setAttribute('aria-label', 'Menu')
  b.title = 'Menu (Esc)'
  // a press here must not also reach the game's mouse input (a window listener) as a charge
  for (const type of ['mousedown', 'pointerdown'] as const) b.addEventListener(type, (e) => e.stopPropagation())
  parent.appendChild(b)
  return b
}
