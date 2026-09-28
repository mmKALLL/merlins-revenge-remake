// The menu overlay (#menu): shows one panel at a time over the page, moves the focus into it, and
// lets the up and down arrow keys step between its controls (Tab works as usual). It scrolls like
// a normal page, also on phones.
import { el } from './dom'

export interface MenuPanel {
  root: HTMLElement
  onShow?: () => void // refresh what may have changed while hidden (e.g. the camera, switched with C)
}

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), a[href]'
/** Controls that use the arrow keys themselves. */
const keepsArrows = (t: EventTarget | null): boolean => t instanceof HTMLInputElement

export class MenuOverlay<K extends string> {
  private readonly root = el('div')
  private shown: K | null = null

  constructor(parent: HTMLElement, private readonly panels: Record<K, MenuPanel>) {
    this.root.id = 'menu'
    this.root.hidden = true
    for (const p of Object.values<MenuPanel>(panels)) {
      p.root.hidden = true
      this.root.appendChild(p.root)
    }
    this.root.addEventListener('keydown', (e) => this.arrowKeys(e))
    parent.appendChild(this.root)
  }

  /** Shows a panel (null hides the overlay); a newly shown panel gets the focus on its first control. */
  show(key: K | null): void {
    if (key === this.shown) return
    if (this.shown !== null) this.panels[this.shown].root.hidden = true
    this.shown = key
    this.root.hidden = key === null
    if (key === null) return
    const p = this.panels[key]
    p.onShow?.()
    p.root.hidden = false
    this.root.scrollTop = 0
    p.root.querySelector<HTMLElement>(FOCUSABLE)?.focus({ preventScroll: true })
  }

  private arrowKeys(e: KeyboardEvent): void {
    if ((e.key !== 'ArrowDown' && e.key !== 'ArrowUp') || keepsArrows(e.target) || this.shown === null) return
    const items = [...this.panels[this.shown].root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((i) => i.offsetParent !== null)
    if (items.length === 0) return
    e.preventDefault()
    const at = items.indexOf(document.activeElement as HTMLElement)
    const step = e.key === 'ArrowDown' ? 1 : -1
    items[at < 0 ? 0 : (at + step + items.length) % items.length]!.focus()
  }
}
