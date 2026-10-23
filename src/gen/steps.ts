// Map generation in steps (remake): a generator yields how far it has got (a fraction, 0..1) after
// each room or floor, so a page can draw a progress bar between them. Running the steps straight
// through (runSteps) or with pauses (runStepsAsync) builds the same map: the pauses only give the
// browser time to paint, they never touch the seeded random numbers.

/** A computation that yields its progress (0..1) along the way and returns a T. */
export type Steps<T> = Generator<number, T, void>

/** Runs the steps without stopping. */
export function runSteps<T>(steps: Steps<T>): T {
  for (;;) {
    const r = steps.next()
    if (r.done) return r.value
  }
}

export interface StepPacing {
  /** Hears the progress at each pause. */
  onProgress: (fraction: number) => void
  /** Lets the page paint (e.g. waits for the next animation frame). */
  pause: () => Promise<void>
  /** Work (ms) between pauses; 0 pauses at every step. */
  sliceMs: number
  now?: () => number
}

/** Runs the steps, pausing once a slice of work is done so the page can show the progress. */
export async function runStepsAsync<T>(steps: Steps<T>, pacing: StepPacing): Promise<T> {
  const now = pacing.now ?? (() => performance.now())
  let sliceStart = now()
  for (;;) {
    const r = steps.next()
    if (r.done) return r.value
    if (now() - sliceStart < pacing.sliceMs) continue
    pacing.onProgress(r.value)
    await pacing.pause()
    sliceStart = now()
  }
}

/** The steps with their progress mapped into [from, from + span] (one part of a larger job). */
export function* scaledSteps<T>(steps: Steps<T>, from: number, span: number): Steps<T> {
  for (;;) {
    const r = steps.next()
    if (r.done) return r.value
    yield from + r.value * span
  }
}
