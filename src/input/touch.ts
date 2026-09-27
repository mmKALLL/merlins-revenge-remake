// On-screen touch controls for phones and tablets (remake feature, not in the original): a movement
// nub on the left that appears where a finger first presses, and a blast button on the right. They
// feed the same InputTracker as the keyboard: the nub acts as WASD (8 directions), the button as
// Space (charge while held, release at the nearest enemy, or the push-back shot with the F toggle).
// Shown on coarse-pointer devices; ?touch=1 / ?touch=0 forces them on or off.
import type { Vec } from '../mr-open/mr-geometry'

/** Finger travel (CSS px) from the press point before the nub moves Merlin. */
export const NUB_DEAD_ZONE = 12
/** Radius (CSS px) of the nub's base; the knob stays inside it. */
const NUB_RADIUS = 48
/** Eight 45-degree sectors, like holding one or two of WASD. */
const SECTOR = Math.PI / 4

/**
 * The WASD direction for a finger `d` away from where it pressed: each axis -1, 0 or 1, from the
 * nearest of eight 45-degree sectors; none inside the dead zone.
 */
export function nubDirection(d: Vec, deadZone = NUB_DEAD_ZONE): Vec {
  if (Math.hypot(d.x, d.y) < deadZone) return { x: 0, y: 0 }
  const sector = Math.round(Math.atan2(d.y, d.x) / SECTOR)
  const angle = sector * SECTOR
  return { x: Math.round(Math.cos(angle)) || 0, y: Math.round(Math.sin(angle)) || 0 } // || 0: no -0
}

/** Whether to show touch controls: ?touch=1/0 wins, else a coarse (finger) primary pointer. */
export function wantsTouchControls(params: URLSearchParams, win: Window): boolean {
  const forced = params.get('touch')
  if (forced === '1') return true
  if (forced === '0') return false
  return win.matchMedia('(pointer: coarse)').matches
}

/** What the controls report every change: the nub's direction and whether the blast button is held. */
export type TouchListener = (move: Vec, blast: boolean) => void

/**
 * Builds the overlay (#touch, styled in index.html: over the game in landscape, a band below it in
 * portrait) and reports changes to `onChange`. Each control follows one pointer, so moving and
 * charging work at the same time. Returns a detach function.
 */
export function attachTouchControls(parent: HTMLElement, onChange: TouchListener): () => void {
  const root = el('div', 'touch')
  const zone = el('div', 'touch-nub-zone')
  const base = el('div', 'touch-nub')
  const knob = el('div', 'touch-knob')
  const button = el('div', 'touch-blast')
  button.setAttribute('role', 'button')
  button.setAttribute('aria-label', 'Energy blast: hold to charge, release to fire')
  base.appendChild(knob)
  zone.appendChild(base)
  root.append(zone, button)
  parent.appendChild(root)

  let move: Vec = { x: 0, y: 0 }
  let blast = false
  let nubPointer: number | null = null
  let nubOrigin: Vec = { x: 0, y: 0 }
  let blastPointer: number | null = null
  const report = () => onChange(move, blast)

  const showKnob = (d: Vec) => {
    const len = Math.hypot(d.x, d.y)
    const k = len > NUB_RADIUS ? NUB_RADIUS / len : 1
    knob.style.transform = `translate(${d.x * k}px, ${d.y * k}px)`
  }
  const nubDown = (e: PointerEvent) => {
    e.preventDefault() // no emulated mouse events (they would charge at the mouse) and no scrolling
    if (nubPointer !== null) return
    nubPointer = e.pointerId
    zone.setPointerCapture(e.pointerId)
    const r = zone.getBoundingClientRect()
    nubOrigin = { x: e.clientX, y: e.clientY }
    base.style.left = `${e.clientX - r.left}px`
    base.style.top = `${e.clientY - r.top}px`
    base.classList.add('active')
    showKnob({ x: 0, y: 0 })
  }
  const nubMove = (e: PointerEvent) => {
    if (e.pointerId !== nubPointer) return
    const d = { x: e.clientX - nubOrigin.x, y: e.clientY - nubOrigin.y }
    showKnob(d)
    const next = nubDirection(d)
    if (next.x === move.x && next.y === move.y) return
    move = next
    report()
  }
  const nubUp = (e: PointerEvent) => {
    if (e.pointerId !== nubPointer) return
    nubPointer = null
    base.classList.remove('active')
    move = { x: 0, y: 0 }
    report()
  }
  const blastDown = (e: PointerEvent) => {
    e.preventDefault()
    if (blastPointer !== null) return
    blastPointer = e.pointerId
    button.setPointerCapture(e.pointerId)
    button.classList.add('active')
    blast = true
    report()
  }
  const blastUp = (e: PointerEvent) => {
    if (e.pointerId !== blastPointer) return
    blastPointer = null
    button.classList.remove('active')
    blast = false
    report()
  }

  const listeners: [HTMLElement, string, (e: PointerEvent) => void][] = [
    [zone, 'pointerdown', nubDown], [zone, 'pointermove', nubMove], [zone, 'pointerup', nubUp], [zone, 'pointercancel', nubUp],
    [button, 'pointerdown', blastDown], [button, 'pointerup', blastUp], [button, 'pointercancel', blastUp],
  ]
  for (const [target, type, fn] of listeners) target.addEventListener(type, fn as EventListener)
  // a long press would open the context menu or select text instead of charging
  const noMenu = (e: Event) => e.preventDefault()
  root.addEventListener('contextmenu', noMenu)
  return () => {
    for (const [target, type, fn] of listeners) target.removeEventListener(type, fn as EventListener)
    root.removeEventListener('contextmenu', noMenu)
    root.remove()
  }
}

function el(tag: string, id: string): HTMLElement {
  const e = document.createElement(tag)
  e.id = id
  return e
}
