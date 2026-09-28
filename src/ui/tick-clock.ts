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
