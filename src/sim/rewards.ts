// Roguelite (docs/plans/2026-10-25-roguelite-mode-design.md, Rewards): a picked reward given to
// Merlin as the pickups give theirs, between ticks. A spell is a scroll collected (its weapon and
// starting army), the heal a maxikit then a medikit, each potion drunk with its usual effects.
import { MEDIKIT_CHARACTER, type PotionCount } from '../mr-open/mr-pickup'
import { weaponOf } from '../mr-open/mr-weapons'
import type { SimState } from './state'
import { beginTick, playerIn, type Tick } from './tick-context'
import { medikitCollected, potionCollected } from './tick-pickup'
import { collectScroll } from './tick-weapons'

/** A reward: a scroll's spell, a full heal and a medikit, or potions (src/run/rewards.ts rolls them). */
export type RewardOption =
  | { kind: 'spell'; scroll: string }
  | { kind: 'heal' }
  | { kind: 'potions'; potions: PotionCount[] }

/** Whether Merlin holds the weapon a scroll gives (its #character, as collectScroll adds it). */
export function holdsScroll(s: SimState, scroll: string): boolean {
  const def = s.defs[scroll]
  return weaponOf(s.arsenal, def?.character ?? scroll) !== undefined
}

/** `s` with the reward given to Merlin; time does not pass. */
export function applyReward(s: SimState, reward: RewardOption): SimState {
  const t = beginTick(s)
  const p = playerIn(t)
  switch (reward.kind) {
    case 'spell': {
      const scroll = s.defs[reward.scroll]
      if (!scroll) throw new Error(`no scroll ${reward.scroll}`)
      collectScroll(t, p, scroll)
      break
    }
    case 'heal':
      medikitCollected(t, p, null) // a maxikit: full energy
      medikitCollected(t, p, MEDIKIT_CHARACTER)
      break
    case 'potions':
      for (const { character, count } of reward.potions) for (let i = 0; i < count; i++) potionCollected(t, p, character)
      break
  }
  return withTickChanges(s, t)
}

/** The state with the tick's changes to Merlin's actors and record, the tick count unchanged. */
function withTickChanges(s: SimState, t: Tick): SimState {
  const changed = new Map(t.actors.map((a) => [a.id, a]))
  return {
    ...s,
    actors: s.actors.filter((a) => !t.removed.has(a.id)).map((a) => changed.get(a.id) ?? a),
    pickups: t.pickups,
    arsenal: t.arsenal,
    army: t.army,
  }
}
