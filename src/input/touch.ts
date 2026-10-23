// On-screen touch controls for phones and tablets (remake feature, not in the original): a movement
// nub on the left that appears where a finger first presses, a blast button on the right with a
// target button above it, and a weapon button and an army button beside it. They feed the same
// InputTracker as the keyboard: the nub moves Merlin at any angle (a keyboard-speed analog of WASD),
// the blast button acts as Space (charge while held, release by the Space mode; the mouse mode
// without a mouse position fires at the nearest enemy), the target button switches the Space mode
// between the nearest and the farthest enemy and shows which, the weapon button shows the current
// weapon and steps to the next one on a tap, and the army button is R (a tap summons the whole
// reserve at the nearest enemy, or sends the army back once the fight is over).
// Shown on coarse-pointer devices; ?touch=1 / ?touch=0 forces them on or off.
import type { Vec } from '../mr-open/mr-geometry'
import type { SpaceMode } from './keyboard'

/** Finger travel (CSS px) from the press point before the nub moves Merlin. */
export const NUB_DEAD_ZONE = 12
/** Radius (CSS px) of the nub's base; the knob stays inside it. */
const NUB_RADIUS = 48
/**
 * The move for a finger `d` away from where it pressed, at the finger's own angle (remake: Merlin
 * only, touch only): the direction scaled so its larger axis is 1, which gives exactly WASD's moves
 * straight and diagonally ((1, 0), (1, 1)) and walks the square between them at other angles. The
 * speed does not depend on how far the finger is dragged; nothing inside the dead zone.
 */
export function nubDirection(d: Vec, deadZone = NUB_DEAD_ZONE): Vec {
  if (Math.hypot(d.x, d.y) < deadZone) return { x: 0, y: 0 }
  const k = Math.max(Math.abs(d.x), Math.abs(d.y))
  return { x: d.x / k, y: d.y / k }
}

/** Whether to show touch controls: ?touch=1/0 wins, else a coarse (finger) primary pointer. */
export function wantsTouchControls(params: URLSearchParams, win: Window): boolean {
  const forced = params.get('touch')
  if (forced === '1') return true
  if (forced === '0') return false
  return win.matchMedia('(pointer: coarse)').matches
}

/** What the controls report: the nub's direction and whether the blast button is held. */
export type TouchListener = (move: Vec, blast: boolean) => void

/**
 * Which finger drives the nub (and where it pressed) and which holds the blast button, apart from
 * the DOM. A new press on a control takes it over, so a finger whose release never arrived (a lost
 * pointerup or pointercancel) cannot wedge it; the release of a finger a control does not follow
 * changes nothing; releaseAll lets go of everything (no finger left on the screen, a menu opening).
 */
export class TouchState {
  move: Vec = { x: 0, y: 0 }
  blast = false
  private nubPointer: number | null = null
  private nubOrigin: Vec = { x: 0, y: 0 }
  private blastPointer: number | null = null

  get nubHeld(): boolean { return this.nubPointer !== null }

  nubDown(pointer: number, at: Vec): void {
    this.nubPointer = pointer
    this.nubOrigin = at
    this.move = { x: 0, y: 0 }
  }
  /** The finger's offset from its press (where the knob goes), or null when the nub does not follow `pointer`. */
  nubMove(pointer: number, at: Vec): Vec | null {
    if (pointer !== this.nubPointer) return null
    const d = { x: at.x - this.nubOrigin.x, y: at.y - this.nubOrigin.y }
    this.move = nubDirection(d)
    return d
  }
  blastDown(pointer: number): void {
    this.blastPointer = pointer
    this.blast = true
  }
  /** A finger left the screen (or was cancelled): whatever it held is let go; false when it held nothing. */
  pointerUp(pointer: number): boolean {
    const nub = pointer === this.nubPointer
    const blast = pointer === this.blastPointer
    if (nub) this.releaseNub()
    if (blast) this.releaseBlast()
    return nub || blast
  }
  /** Lets go of the nub and the blast button; false when neither was held. */
  releaseAll(): boolean {
    const held = this.nubPointer !== null || this.blastPointer !== null
    this.releaseNub()
    this.releaseBlast()
    return held
  }

  private releaseNub(): void {
    this.nubPointer = null
    this.move = { x: 0, y: 0 }
  }
  private releaseBlast(): void {
    this.blastPointer = null
    this.blast = false
  }
}

/** The target button's label for each Space mode: what the blast button aims at on a finger-only device. */
const TARGET_LABEL: Record<SpaceMode, string> = { nearest: 'NEAR', farthest: 'FAR', pushBack: 'PUSH', mouse: 'NEAR' }

/**
 * Where the controls report (the nub and blast button's state, weapon, army and target button taps), the
 * army button's picture, and every picture the weapon button may show (loaded and decoded up front,
 * so a weapon switch shows its icon at once).
 */
export interface TouchOptions {
  onChange: TouchListener
  onNextWeapon: () => void
  onArmy: () => void
  onTarget: () => void
  armyIconUrl: string
  weaponIconUrls: readonly string[]
}

/**
 * The attached controls: `showWeapon` sets the weapon button's picture (an image URL), `showArmy`
 * shows or hides the army button, `showTarget` labels the target button with the Space mode, `release`
 * lets go of the nub and the blast button (a menu opened over them).
 */
export interface TouchControls {
  detach: () => void
  showWeapon: (iconUrl: string) => void
  showArmy: (visible: boolean) => void
  showTarget: (mode: SpaceMode) => void
  release: () => void
}

/**
 * Builds the overlay (#touch, styled in index.html: over the game in landscape, a band below it in
 * portrait; hidden while a menu is open) and reports to `options`' handlers. Each control follows one
 * pointer, so moving and charging work at the same time. Self-healing: a finger lifted anywhere
 * ends its press (window listeners, should a control have lost its capture), and once no finger is
 * left on the screen everything is let go.
 */
export function attachTouchControls(parent: HTMLElement, options: TouchOptions): TouchControls {
  const { onChange, onNextWeapon, onArmy, onTarget } = options
  const root = el('div', 'touch')
  const zone = el('div', 'touch-nub-zone')
  const base = el('div', 'touch-nub')
  const knob = el('div', 'touch-knob')
  const button = el('div', 'touch-blast')
  button.setAttribute('role', 'button')
  button.setAttribute('aria-label', 'Energy blast: hold to charge, release to fire')
  const weapon = el('div', 'touch-weapon')
  weapon.setAttribute('role', 'button')
  weapon.setAttribute('aria-label', 'Next weapon')
  const army = el('div', 'touch-army')
  army.setAttribute('role', 'button')
  army.setAttribute('aria-label', 'Army: summon the whole reserve, or send the army back')
  army.style.backgroundImage = `url("${options.armyIconUrl}")`
  army.hidden = true // shown only while R would act (showArmy: main.ts asks armyKeyAction)
  const target = el('div', 'touch-target')
  target.setAttribute('role', 'button')
  target.setAttribute('aria-label', 'Blast target: the nearest or the farthest enemy')
  base.appendChild(knob)
  zone.appendChild(base)
  root.append(zone, army, weapon, target, button)
  parent.appendChild(root)
  const icons = preload([options.armyIconUrl, ...options.weaponIconUrls]) // kept referenced: the browser keeps them decoded

  const state = new TouchState()
  /** Shows the state and reports it, also when unchanged: the tracker may have let go of it meanwhile (a blur). */
  const report = () => {
    base.classList.toggle('active', state.nubHeld)
    button.classList.toggle('active', state.blast)
    onChange(state.move, state.blast)
  }

  const showKnob = (d: Vec) => {
    const len = Math.hypot(d.x, d.y)
    const k = len > NUB_RADIUS ? NUB_RADIUS / len : 1
    knob.style.transform = `translate(${d.x * k}px, ${d.y * k}px)`
  }
  const nubDown = (e: PointerEvent) => {
    e.preventDefault() // no emulated mouse events (they would charge at the mouse) and no scrolling
    capture(zone, e)
    const r = zone.getBoundingClientRect()
    state.nubDown(e.pointerId, { x: e.clientX, y: e.clientY })
    base.style.left = `${e.clientX - r.left}px`
    base.style.top = `${e.clientY - r.top}px`
    showKnob({ x: 0, y: 0 })
    report()
  }
  const nubMove = (e: PointerEvent) => {
    const d = state.nubMove(e.pointerId, { x: e.clientX, y: e.clientY })
    if (!d) return
    showKnob(d)
    report()
  }
  const blastDown = (e: PointerEvent) => {
    e.preventDefault()
    capture(button, e)
    state.blastDown(e.pointerId)
    report()
  }
  const pointerUp = (e: PointerEvent) => { if (state.pointerUp(e.pointerId)) report() }
  const fingersGone = (e: TouchEvent) => { if (e.touches.length === 0 && state.releaseAll()) report() }

  const [weaponDown, weaponUp] = tapButton(weapon, onNextWeapon)
  const [armyDown, armyUp] = tapButton(army, onArmy)
  const [targetDown, targetUp] = tapButton(target, onTarget)

  // a lost capture ends the press too: the controls are hidden while a menu is open, even under a finger
  const listeners: [EventTarget, string, (e: never) => void][] = [
    [weapon, 'pointerdown', weaponDown], [weapon, 'pointerup', weaponUp], [weapon, 'pointercancel', weaponUp],
    [army, 'pointerdown', armyDown], [army, 'pointerup', armyUp], [army, 'pointercancel', armyUp],
    [target, 'pointerdown', targetDown], [target, 'pointerup', targetUp], [target, 'pointercancel', targetUp],
    [zone, 'pointerdown', nubDown], [zone, 'pointermove', nubMove], [zone, 'lostpointercapture', pointerUp],
    [button, 'pointerdown', blastDown], [button, 'lostpointercapture', pointerUp],
    [window, 'pointerup', pointerUp], [window, 'pointercancel', pointerUp],
    [window, 'touchend', fingersGone], [window, 'touchcancel', fingersGone],
  ]
  for (const [target, type, fn] of listeners) target.addEventListener(type, fn as EventListener)
  // a long press would open the context menu or select text instead of charging
  const noMenu = (e: Event) => e.preventDefault()
  root.addEventListener('contextmenu', noMenu)
  let shown = ''
  return {
    detach: () => {
      for (const [target, type, fn] of listeners) target.removeEventListener(type, fn as EventListener)
      root.removeEventListener('contextmenu', noMenu)
      root.remove()
      icons.length = 0
    },
    showWeapon: (iconUrl: string) => {
      if (iconUrl === shown) return
      shown = iconUrl
      weapon.style.backgroundImage = `url("${iconUrl}")`
    },
    showArmy: (visible: boolean) => {
      if (army.hidden === !visible) return
      army.hidden = !visible
    },
    showTarget: (mode: SpaceMode) => {
      const label = TARGET_LABEL[mode]
      if (target.textContent !== label) target.textContent = label
    },
    release: () => { if (state.releaseAll()) report() },
  }
}

/** Starts loading and decoding each image; one that fails to load just shows nothing when used, as before. */
function preload(urls: readonly string[]): HTMLImageElement[] {
  return urls.map((url) => {
    const img = new Image()
    img.src = url
    img.decode().catch(() => {})
    return img
  })
}

/** Keeps a finger's events on `target` while it slides off it; a pointer already gone (some browsers) is not captured, and the window listeners still end it. */
function capture(target: HTMLElement, e: PointerEvent): void {
  try {
    target.setPointerCapture(e.pointerId)
  } catch {
    // InvalidStateError / NotFoundError: nothing to capture
  }
}

/** A button that acts once when pressed and lights up while the finger stays on it: its down and up handlers. */
function tapButton(button: HTMLElement, onTap: () => void): [(e: PointerEvent) => void, () => void] {
  const down = (e: PointerEvent) => {
    e.preventDefault()
    button.classList.add('active')
    onTap()
  }
  return [down, () => button.classList.remove('active')]
}

function el(tag: string, id: string): HTMLElement {
  const e = document.createElement(tag)
  e.id = id
  return e
}
