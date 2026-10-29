// Browser input -> InputSnapshot. Direction mapping follows keyMaster.updateMoveVector:
// up (0,-1), down (0,1), left (-1,0), right (1,0), summed; both WASD and arrows are active.
// The left button charges and fires at the mouse position. Space charges and fires by its mode
// (SpaceMode): at the nearest enemy, at the mouse like a click (straight ahead while no mouse position is
// known), or at the farthest enemy on screen; F toggles nearest and farthest (Settings offers all three). C switches between the room camera and the follow camera (main.ts
// takes each press with takeCameraToggle), N hides or shows the mini-map (takeMiniMapToggle). The
// debug cheats K (kill the enemies on screen) and M (one more medikit) reach the sim once per press,
// in the next snapshot (gameMaster.cheat, bound in bnd_wasd: #killAll 40 = K, #medikit 46 = M), and
// so does R, the #army key (summon the whole reserve army, or send the army back; the original's C),
// and E, the #gmg key (bnd_wasd 14: the golden machine gun on or off, once Merlin has it).
// The weapon keys (objAiPlayer.interpretGameKeys, bnd_wasd): 1-9 pick the n-th spell (#spell1..9;
// remake: or melee weapon, nthSpell) once per press; Q opens the weapon palettes (#weaponSelector 12; main.ts takes each press with
// takeWeaponSelector), and a weapon picked on them (pickWeapon) reaches the next snapshot. The
// on-screen touch controls (touch.ts) report through setTouch: the nub moves at any angle while no
// direction key is held, the blast button counts as Space, except that in mouse mode a press without
// a known mouse position (a finger-only device) fires at the nearest enemy; the target button
// switches Space between the nearest and the farthest enemy (toggleTouchTarget); the weapon button
// steps to the next weapon (cycleWeapon); the army button is R, always aimed at the nearest enemy
// (touchArmy); the gun button is E (touchGun). While a menu is open (setEnabled(false)) keys and clicks are left to the page.
import type { Vec } from '../mr-open/mr-geometry'
import type { InputSnapshot } from '../sim/state'

const MOVE_KEYS: Record<string, Vec> = {
  KeyW: { x: 0, y: -1 }, ArrowUp: { x: 0, y: -1 },
  KeyS: { x: 0, y: 1 }, ArrowDown: { x: 0, y: 1 },
  KeyA: { x: -1, y: 0 }, ArrowLeft: { x: -1, y: 0 },
  KeyD: { x: 1, y: 0 }, ArrowRight: { x: 1, y: 0 },
}

/** Digit1..Digit9: the spell keys #spell1..#spell9 (bnd_wasd's Mac key codes 18-26, meant as 1-9). */
const SPELL_KEY = /^Digit([1-9])$/

/** What Space (and the touch blast button) fires at. */
export const SPACE_MODES = ['nearest', 'mouse', 'farthest'] as const
export type SpaceMode = typeof SPACE_MODES[number]

/** The Space mode after an F press or a tap on the touch target button: farthest -> nearest, any other -> farthest. */
export function nextTarget(mode: SpaceMode): SpaceMode {
  return mode === 'farthest' ? 'nearest' : 'farthest'
}

type SpaceShot = 'chargeHeld' | 'shootNearest' | 'shootFarthest'

const SPACE_SHOT: Record<SpaceMode, SpaceShot> = {
  nearest: 'shootNearest',
  mouse: 'chargeHeld',
  farthest: 'shootFarthest',
}

export class InputTracker {
  private held = new Set<string>()
  private mouseWorld: Vec | null = null
  private mouseDown = false
  private mode: SpaceMode
  private cameraToggle = false // a C press not yet taken (two presses cancel out)
  private miniMapToggle = false // an N press not yet taken (two presses cancel out)
  private cheatKillAll = false // a K press not yet in a snapshot
  private cheatMedikit = false // an M press not yet in a snapshot
  private armyKey = false // an R press (or army button tap) not yet in a snapshot
  private armyFromTouch = false // that press came from the army button: no mouse to summon at
  private selectSpell: number | null = null // a 1-9 press not yet in a snapshot
  private selectWeapon: string | null = null // a palette pick not yet in a snapshot
  private cycleWeapon = false // a touch weapon button press not yet in a snapshot
  private gunKey = false // an E press (or gun button tap) not yet in a snapshot
  private weaponSelector = false // a Q press not yet taken
  private swallowMouse = false // the button press picked a weapon on the palette: no charge until it is let go
  private touchMove: Vec = { x: 0, y: 0 } // the touch nub's direction
  private touchBlast = false // the touch blast button is held
  private touchBlastHasMouse = false // a mouse position was known when the blast button went down
  private enabled = true // off while a menu is open: keys and clicks belong to the menu

  /** `onSpaceMode` hears every change of the Space mode (F or setSpaceMode), e.g. to save it. */
  constructor(mode: SpaceMode = 'nearest', private readonly onSpaceMode: (m: SpaceMode) => void = () => {}) {
    this.mode = mode
  }

  /** Turns the game's keyboard and mouse input on or off; off forgets everything held. */
  setEnabled(on: boolean): void {
    this.enabled = on
    if (!on) this.releaseAll()
  }

  keyDown(code: string): void {
    if (!this.enabled) return
    const pressed = !this.held.has(code) // key repeat sends more keydowns while held
    if (code === 'KeyF' && pressed) this.setSpaceMode(nextTarget(this.mode))
    if (code === 'KeyC' && pressed) this.cameraToggle = !this.cameraToggle
    if (code === 'KeyN' && pressed) this.miniMapToggle = !this.miniMapToggle
    if (code === 'KeyK' && pressed) this.cheatKillAll = true
    if (code === 'KeyM' && pressed) this.cheatMedikit = true
    if (code === 'KeyR' && pressed) {
      this.armyKey = true
      this.armyFromTouch = false
    }
    if (code === 'KeyQ' && pressed) this.weaponSelector = true
    if (code === 'KeyE' && pressed) this.gunKey = true
    const spell = SPELL_KEY.exec(code)
    if (spell && pressed) this.selectSpell = Number(spell[1])
    this.held.add(code)
  }
  /** What Space (and the touch blast button) fires at from now on (F steps it, Settings sets it). */
  setSpaceMode(mode: SpaceMode): void {
    if (mode === this.mode) return
    this.mode = mode
    this.onSpaceMode(mode)
  }
  get spaceMode(): SpaceMode { return this.mode }
  /** Remake (the touch target button): the blast button aims at the farthest enemy, or back at the nearest. */
  toggleTouchTarget(): void {
    if (this.enabled) this.setSpaceMode(nextTarget(this.mode))
  }
  /** Whether C was pressed since the last call: the camera (and world mode) should switch once. */
  takeCameraToggle(): boolean {
    const toggle = this.cameraToggle
    this.cameraToggle = false
    return toggle
  }
  /** Whether Q was pressed since the last call: the weapon palettes should open. */
  takeWeaponSelector(): boolean {
    const open = this.weaponSelector
    this.weaponSelector = false
    return open
  }
  /** A weapon clicked on the palettes: it goes to the next snapshot, and the click charges nothing. */
  pickWeapon(key: string): void {
    this.selectWeapon = key
    this.swallowMouse = true
    this.mouseDown = false
  }
  /** Remake (the touch weapon button): the next weapon in Merlin's list, in the next snapshot. */
  nextWeapon(): void {
    if (this.enabled) this.cycleWeapon = true
  }
  /** Remake (the touch army button): R, summoning at the nearest enemy whatever the Space mode (a finger is no mouse). */
  touchArmy(): void {
    if (!this.enabled) return
    this.armyKey = true
    this.armyFromTouch = true
  }
  /** Remake (the touch gun button): E, the golden machine gun on or off, in the next snapshot. */
  touchGun(): void {
    if (this.enabled) this.gunKey = true
  }
  /** Whether N was pressed since the last call: the mini-map should be hidden or shown once. */
  takeMiniMapToggle(): boolean {
    const toggle = this.miniMapToggle
    this.miniMapToggle = false
    return toggle
  }
  keyUp(code: string): void { this.held.delete(code) }
  setMouseWorld(p: Vec | null): void { this.mouseWorld = p }
  setMouseButton(down: boolean): void {
    if (!down) this.swallowMouse = false
    this.mouseDown = down && this.enabled && !this.swallowMouse
  }
  /** The touch controls' state: the nub's move (any angle, larger axis 1) and whether the blast button is held (Space). */
  setTouch(move: Vec, blast: boolean): void {
    this.touchMove = move
    // decided at the press: a mouse showing up mid-charge must not switch (and so release) the shot
    if (blast && !this.touchBlast) this.touchBlastHasMouse = this.mouseWorld !== null
    this.touchBlast = blast
  }
  /** The blast button follows the Space mode; mouse mode without a mouse position aims at the nearest enemy. */
  private touchShot(): SpaceShot {
    return this.mode === 'mouse' && !this.touchBlastHasMouse ? 'shootNearest' : SPACE_SHOT[this.mode]
  }

  /** The input for the next tick; takes the cheat presses, so each reaches exactly one tick. */
  snapshot(): InputSnapshot {
    let x = 0
    let y = 0
    // each direction contributes at most once even if both WASD and arrow keys are held
    const dirs = new Set<string>()
    for (const code of this.held) {
      const v = MOVE_KEYS[code]
      if (v) dirs.add(`${v.x},${v.y}`)
    }
    for (const d of dirs) {
      const [dx, dy] = d.split(',').map(Number)
      x += dx!
      y += dy!
    }
    // the keys win; without them the touch nub's analog move passes through unrounded
    const keyed = x !== 0 || y !== 0
    const move = keyed ? { x: Math.sign(x), y: Math.sign(y) } : { ...this.touchMove }
    const shots: Record<SpaceShot, boolean> = { chargeHeld: false, shootNearest: false, shootFarthest: false }
    if (this.held.has('Space')) shots[SPACE_SHOT[this.mode]] = true
    if (this.touchBlast) shots[this.touchShot()] = true
    const { cheatKillAll, cheatMedikit, armyKey, armyFromTouch, selectSpell, selectWeapon, cycleWeapon, gunKey } = this
    this.cheatKillAll = false
    this.cheatMedikit = false
    this.armyKey = false
    this.armyFromTouch = false
    this.selectSpell = null
    this.selectWeapon = null
    this.cycleWeapon = false
    this.gunKey = false
    return {
      move,
      mouseWorld: this.mouseWorld,
      chargeHeld: this.mouseDown || shots.chargeHeld,
      shootNearest: shots.shootNearest,
      shootFarthest: shots.shootFarthest,
      cheatKillAll,
      cheatMedikit,
      armyKey,
      armyAtNearest: armyKey && (armyFromTouch || this.mode !== 'mouse'),
      selectSpell,
      selectWeapon,
      cycleWeapon,
      toggleGun: gunKey,
    }
  }

  /** Forget every held key and the mouse button (focus loss, or macOS dropping keyups under Meta). */
  releaseAll(): void {
    this.held.clear()
    this.mouseDown = false
    this.touchMove = { x: 0, y: 0 }
    this.touchBlast = false
  }

  /** Attach to a window; returns a detach function. */
  attach(target: Window): () => void {
    const down = (e: KeyboardEvent) => {
      // leave browser/OS shortcuts alone (e.g. Cmd+R is Cmd+KeyS on Colemak)
      if (e.metaKey || e.ctrlKey || e.altKey || !this.enabled) return
      this.keyDown(e.code)
      if (MOVE_KEYS[e.code] || e.code === 'Space') e.preventDefault()
    }
    const up = (e: KeyboardEvent) => {
      // macOS does not deliver keyups for keys released while Meta is down
      if (e.key === 'Meta' || e.code === 'MetaLeft' || e.code === 'MetaRight') this.releaseAll()
      else this.keyUp(e.code)
    }
    const blur = () => this.releaseAll()
    const visibility = () => { if (target.document.hidden) this.releaseAll() }
    const mdown = (e: MouseEvent) => { if (e.button === 0) this.setMouseButton(true) }
    const mup = (e: MouseEvent) => { if (e.button === 0) this.setMouseButton(false) }
    target.addEventListener('keydown', down)
    target.addEventListener('keyup', up)
    target.addEventListener('blur', blur)
    target.document.addEventListener('visibilitychange', visibility)
    target.addEventListener('mousedown', mdown)
    target.addEventListener('mouseup', mup)
    return () => {
      target.removeEventListener('keydown', down)
      target.removeEventListener('keyup', up)
      target.removeEventListener('blur', blur)
      target.document.removeEventListener('visibilitychange', visibility)
      target.removeEventListener('mousedown', mdown)
      target.removeEventListener('mouseup', mup)
    }
  }
}
