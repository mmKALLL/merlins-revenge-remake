// Remake (owner request): the map-complete jingle (the end_level effect) is always heard, on its own.
// The engine's soundMaster drops a new sound when all seven effect channels are busy, which a
// killing blow can do; and a tick that completes the map while Merlin enters a room also asks for
// that room's music after the mapComplete event (room activation appends it), which would start
// the music again over the jingle. The audio engine stops the other effects at mapComplete (so the
// jingle finds a free voice) and drops the batch's later music requests (this helper).
import type { SimEvent } from '../sim/state'

/** One tick's events without the music requests that follow its mapComplete: the map is over. */
export function withoutMusicAfterMapComplete(events: readonly SimEvent[]): readonly SimEvent[] {
  const complete = events.findIndex((e) => e.kind === 'mapComplete')
  if (complete < 0) return events
  return events.filter((e, i) => i <= complete || e.kind !== 'music')
}
