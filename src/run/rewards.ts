// The roguelite rewards (docs/plans/2026-10-25-roguelite-mode-design.md, Rewards): what the pick
// screen offers at a floor's end and the starting kit, rolled from the run seed and the floor, and
// the pickups each is laid out as in the next floor's start room (src/gen/roguelite.ts). Pure.
import { firstBiome, floorSeed } from '../gen/roguelite-biomes'
import { GenRandom } from '../gen/random'
import type { FloorTheme, Weighted } from '../gen/themes'
import { MEDIKIT_CHARACTER, type PotionCount } from '../mr-open/mr-pickup'

/** A reward: a scroll's spell, a full heal and a medikit, or potions. */
export type RewardOption =
  | { kind: 'spell'; scroll: string }
  | { kind: 'heal' }
  | { kind: 'potions'; potions: PotionCount[] }

/** What a floor's rewards are drawn from: its biomes' start scrolls and potions. */
export interface RewardPools { spellScrolls: Weighted<string>[]; potions: Weighted<string>[] }

/** Whether Merlin already holds the weapon of a scroll. */
export type HoldsScroll = (scroll: string) => boolean

/** A floor-end potions reward holds this many potions, drawn uniformly. */
const REWARD_POTIONS: readonly [number, number] = [4, 5]
/** The starting kit always holds this many (design: fixed so runs stay fair). */
const KIT_POTIONS = 5
/** Every potions reward splits its potions between this many types. */
const POTION_TYPES = 2
/** Keeps the reward rolls apart from the floor layout drawn from the same floor seed. */
const REWARD_SALT = 0x5eed

/**
 * The pools of the floor whose biome is still to be picked: every option's weights added up, so the
 * rewards on the pick screen do not depend on the biome picked beside them.
 */
export function rewardPools(biomes: readonly FloorTheme[]): RewardPools {
  const merged = (list: (t: FloorTheme) => Weighted<string>[]): Weighted<string>[] => {
    const weights = new Map<string, number>()
    for (const b of biomes) for (const { value, weight } of list(b)) weights.set(value, (weights.get(value) ?? 0) + weight)
    return [...weights].map(([value, weight]) => ({ value, weight }))
  }
  return { spellScrolls: merged((t) => t.units.startRewards.spellScrolls), potions: merged((t) => t.units.startRewards.potions) }
}

const rewardRng = (runSeed: number, floor: number): GenRandom => new GenRandom((floorSeed(runSeed, floor) ^ REWARD_SALT) >>> 0)

/** A scroll Merlin does not hold, by weight; null when he holds them all. */
function newSpell(rng: GenRandom, pools: RewardPools, holds: HoldsScroll): RewardOption | null {
  const unheld = pools.spellScrolls.filter((s) => !holds(s.value))
  return unheld.length === 0 ? null : { kind: 'spell', scroll: rng.weighted(unheld) }
}

/** `total` potions of POTION_TYPES distinct types (by weight), every split (1 + 4, 2 + 3, ...) equally likely. */
function potionSplit(rng: GenRandom, pools: RewardPools, total: number): RewardOption {
  const left = [...pools.potions]
  const types: string[] = []
  while (types.length < POTION_TYPES && left.length > 0) {
    const type = rng.weighted(left)
    types.push(type)
    left.splice(left.findIndex((p) => p.value === type), 1)
  }
  const [first, second] = types
  if (first === undefined || second === undefined) throw new Error(`a potions reward needs ${POTION_TYPES} potion types`)
  const firstCount = rng.int(1, total - 1)
  return { kind: 'potions', potions: [{ character: first, count: firstCount }, { character: second, count: total - firstCount }] }
}

/** The three rewards offered when Merlin leaves for `floor` (1 = the second): a new spell, a heal and potions; two when he holds every spell. */
export function rollRewards(runSeed: number, floor: number, pools: RewardPools, holds: HoldsScroll): RewardOption[] {
  const rng = rewardRng(runSeed, floor)
  const spell = newSpell(rng, pools, holds)
  const potions = potionSplit(rng, pools, rng.int(...REWARD_POTIONS))
  return [...(spell ? [spell] : []), { kind: 'heal' }, potions]
}

/** Merlin starts a run with his own weapons, none of them a scroll's. */
const HOLDS_NO_SCROLL: HoldsScroll = () => false

/** The run's starting kit, given without a pick: a spell, a heal and exactly KIT_POTIONS potions. */
export function startingKit(runSeed: number, pools: RewardPools): RewardOption[] {
  const rng = rewardRng(runSeed, 0)
  const spell = newSpell(rng, pools, HOLDS_NO_SCROLL)
  return [...(spell ? [spell] : []), { kind: 'heal' }, potionSplit(rng, pools, KIT_POTIONS)]
}

/** The maxikit's object key (its #character: full energy, not stocked). */
const MAXIKIT = 'maxikit'

/** The pickups (object keys) a reward is laid out as: its scroll, a maxikit and a medikit, or each potion. */
export function rewardPickups(reward: RewardOption): string[] {
  switch (reward.kind) {
    case 'spell': return [reward.scroll]
    case 'heal': return [MAXIKIT, MEDIKIT_CHARACTER]
    case 'potions': return reward.potions.flatMap(({ character, count }) => Array<string>(count).fill(character))
  }
}

/** The pickups of the run's starting kit, for its first floor's start room: from the run seed alone. */
export const startingKitPickups = (runSeed: number): string[] =>
  startingKit(runSeed, rewardPools([firstBiome(runSeed)])).flatMap(rewardPickups)

/** The potions a reward holds in all. */
export const potionTotal = (potions: readonly PotionCount[]): number => potions.reduce((sum, p) => sum + p.count, 0)
