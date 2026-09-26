// Browser input -> InputSnapshot. Direction mapping follows keyMaster.updateMoveVector:
// up (0,-1), down (0,1), left (-1,0), right (1,0), summed; both WASD and arrows are active.
// Left click, Space, E, F and the mouse position are captured for later slices.
import type { Vec } from '../mr-open/mr-map-format'
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

  keyDown(code: string): void { this.held.add(code) }
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
      chargeHeld: this.held.has('Space') || this.mouseDown,
      shootNearest: this.held.has('KeyE'),
      shootShort: this.held.has('KeyF'),
    }
  }

  /** Attach to a window; returns a detach function. */
  attach(target: Window): () => void {
    const down = (e: KeyboardEvent) => {
      this.keyDown(e.code)
      if (MOVE_KEYS[e.code] || e.code === 'Space') e.preventDefault()
    }
    const up = (e: KeyboardEvent) => this.keyUp(e.code)
    const blur = () => {
      this.held.clear()
      this.mouseDown = false
    }
    const mdown = (e: MouseEvent) => { if (e.button === 0) this.mouseDown = true }
    const mup = (e: MouseEvent) => { if (e.button === 0) this.mouseDown = false }
    target.addEventListener('keydown', down)
    target.addEventListener('keyup', up)
    target.addEventListener('blur', blur)
    target.addEventListener('mousedown', mdown)
    target.addEventListener('mouseup', mup)
    return () => {
      target.removeEventListener('keydown', down)
      target.removeEventListener('keyup', up)
      target.removeEventListener('blur', blur)
      target.removeEventListener('mousedown', mdown)
      target.removeEventListener('mouseup', mup)
    }
  }
}
