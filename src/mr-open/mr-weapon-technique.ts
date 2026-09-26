// Port of modWeaponTechnique: while the AI is in #attack, every counter finish adds the character's
// weaponTechnique to a running cache; a cache below -pFrameValue (-100) lengthens the attack strip's
// current frame (frameExtendDelay -> objAnimStrip.extendDelay) and makes the counter one tick longer
// until its next finish. The cache and counter persist across attacks. A cache above +100 would skip
// frames instead (skipFramesForWeaponTechnique); no ported actor has a positive technique, so that
// branch is not ported.

/** modWeaponTechnique pFrameValue: technique it takes to add (or skip) one frame. */
export const TECHNIQUE_FRAME_VALUE = 100

/** pAdditionalFramesCounter (count/len/fin as a Lingo counter from 1 to len) and pWeaponTechniqueCache. */
export interface TechniqueState {
  cache: number
  count: number
  len: number
  fin: boolean
}

/** CounterNew() with tim[2] = 1 (CounterReset: count at 1, not fin). */
export const TECHNIQUE_INIT: TechniqueState = { cache: 0, count: 1, len: 1, fin: false }

/**
 * One updateWeaponTechnique call (only while the AI mode is #attack). Returns the new state and how
 * many times the current frame's delay was extended this tick.
 */
export function stepTechnique(s: TechniqueState, technique: number): { state: TechniqueState; extend: number } {
  if (!s.fin) {
    // CounterOnce -> Counter: a counter whose ends are equal finishes at once
    if (s.len === 1) return { state: { ...s, fin: true }, extend: 0 }
    const count = Math.min(s.count + 1, s.len)
    return { state: { ...s, count, fin: count >= s.len }, extend: 0 }
  }
  // fin: tim[2] = 1, CounterReset, increaseWeaponTechniqueCache, exchangeWeaponTechniqueForFrames
  let cache = s.cache + technique
  let len = 1
  let extend = 0
  while (cache < -TECHNIQUE_FRAME_VALUE) {
    extend++
    len++
    cache += TECHNIQUE_FRAME_VALUE
  }
  return { state: { cache, count: 1, len, fin: false }, extend }
}
