// Browser input -> InputSnapshot. Direction mapping follows keyMaster.updateMoveVector:
// up (0,-1), down (0,1), left (-1,0), right (1,0), summed; both WASD and arrows are active.
// E or the left button charges and fires at the mouse position. Space charges and fires at the
// nearest enemy, or short of it (a push-back shot) while the F toggle is on.
import type { Vec } from '../mr-open/mr-geometry'
import type { InputSnapshot } from '../sim/state'

const MOVE_KEYS: Record<string, Vec> = {
  KeyW: { x: 0, y: -1 }, ArrowUp: { x: 0, y: -1 },
  KeyS: { x: 0, y: 1 }, ArrowDown: { x: 0, y: 1 },
  KeyA: { x: -1, y: 0 }, ArrowLeft: { x: -1, y: 0 },
  KeyD: { x: 1, y: 0 }, ArrowRight: { x: 1, y: 0 },
}

export class InputTracker {
  private held = new Set<string>()
  private mouseWorld: Vec | null = null
  private mouseDown = false
  private spaceShort = false // F toggles Space between the nearest enemy and the push-back shot

  keyDown(code: string): void {
    if (code === 'KeyF' && !this.held.has('KeyF')) this.spaceShort = !this.spaceShort
    this.held.add(code)
  }
  /** Whether Space currently fires the push-back shot (toggled with F). */
  get spaceAimsShort(): boolean { return this.spaceShort }
  keyUp(code: string): void { this.held.delete(code) }
  setMouseWorld(p: Vec | null): void { this.mouseWorld = p }
  setMouseButton(down: boolean): void { this.mouseDown = down }

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
    return {
      move: { x: Math.sign(x), y: Math.sign(y) },
      mouseWorld: this.mouseWorld,
      chargeHeld: this.held.has('KeyE') || this.mouseDown,
      shootNearest: this.held.has('Space') && !this.spaceShort,
      shootShort: this.held.has('Space') && this.spaceShort,
    }
  }

  /** Forget every held key and the mouse button (focus loss, or macOS dropping keyups under Meta). */
  releaseAll(): void {
    this.held.clear()
    this.mouseDown = false
  }

  /** Attach to a window; returns a detach function. */
  attach(target: Window): () => void {
    const down = (e: KeyboardEvent) => {
      // leave browser/OS shortcuts alone (e.g. Cmd+R is Cmd+KeyS on Colemak)
      if (e.metaKey || e.ctrlKey || e.altKey) return
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
    const mdown = (e: MouseEvent) => { if (e.button === 0) this.mouseDown = true }
    const mup = (e: MouseEvent) => { if (e.button === 0) this.mouseDown = false }
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
