// Turns animation frame times into fixed simulation ticks. While stopped (a menu is open) no time
// accumulates, so resuming carries on from the paused moment instead of catching up on the pause.

export interface ClockFrame {
  ticks: number // ticks to step this frame
  alpha: number // [0,1): how far the display is between the last tick and the next
  dt: number // ms since the previous frame (for the fps readout), capped at maxFrameMs
}

export class TickClock {
  private acc = 0
  private last: number | null = null

  constructor(private readonly tickMs: number, private readonly maxFrameMs: number) {}

  /** One animation frame at `now` (ms); `running` false steps nothing and drops the elapsed time. */
  frame(now: number, running: boolean): ClockFrame {
    const dt = this.last === null ? 0 : Math.min(this.maxFrameMs, Math.max(0, now - this.last))
    this.last = now
    if (!running) return { ticks: 0, alpha: this.acc / this.tickMs, dt }
    this.acc += dt
    const ticks = Math.floor(this.acc / this.tickMs)
    this.acc -= ticks * this.tickMs
    return { ticks, alpha: this.acc / this.tickMs, dt }
  }
}

/**
 * The interpolation factor to draw with: the clock's alpha while the sim steps, 1 (the last tick's
 * positions) while it is held, as during the end sequence. The clock's alpha keeps cycling through
 * every tick either way, and a held sim keeps each actor's last prevPos, so drawing with it would
 * slide every sprite that moved on its last tick back and forth 30 times a second.
 */
export const drawAlpha = (alpha: number, simHeld: boolean): number => (simHeld ? 1 : alpha)

/** Early-frame allowance: well under half a 120 Hz frame (8.3 ms), so 60 fps on it keeps every other frame. */
const FRAME_SLACK_MS = 2

/**
 * Lets through at most `fps` animation frames a second (null: every frame the display gives). A frame
 * up to `slackMs` early still counts as due, as the browser's frame times jitter around the refresh rate.
 */
export class FrameLimiter {
  private last: number | null = null

  constructor(public fps: number | null, private readonly slackMs = FRAME_SLACK_MS) {}

  due(now: number): boolean {
    if (this.fps !== null && this.last !== null && now - this.last < 1000 / this.fps - this.slackMs) return false
    this.last = now
    return true
  }
}
