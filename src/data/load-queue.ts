// File loads a few at a time (remake, for the loading screen): started all at once they share the
// bandwidth and finish together at the end, which leaves a progress bar standing still; queued,
// they finish one after another and the bar can count them.

export class LoadQueue {
  /** Loads added so far, and those finished (or failed). */
  total = 0
  done = 0
  private running = 0
  private readonly waiting: (() => void)[] = []

  /** `onDone` hears every finished load. */
  constructor(private readonly maxRunning: number, private readonly onDone: () => void = () => {}) {}

  /** Starts `load` once fewer than maxRunning loads run; resolves (or rejects) as it does. */
  add<T>(load: () => Promise<T>): Promise<T> {
    this.total++
    return new Promise<T>((resolve, reject) => {
      const run = () => {
        this.running++
        load().then(resolve, reject).finally(() => {
          this.running--
          this.done++
          this.onDone()
          this.waiting.shift()?.()
        })
      }
      if (this.running < this.maxRunning) run()
      else this.waiting.push(run)
    })
  }
}
