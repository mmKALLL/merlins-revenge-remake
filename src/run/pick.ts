// The floor pick (docs/plans/2026-10-25-roguelite-mode-design.md, Floor end): the next floor's biome
// and a reward, picked on one screen whose options wait a moment before they take a pick.

/** The options take no pick for this long after the screen opens (ms), against misclicks. */
export const PICK_LOCK_MS = 800

/** Whether the screen opened at `openedAt` takes a pick at `now` (both ms on one clock). */
export const pickUnlocked = (openedAt: number, now: number): boolean => now - openedAt >= PICK_LOCK_MS
