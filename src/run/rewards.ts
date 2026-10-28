// The roguelite rewards (docs/plans/2026-10-25-roguelite-mode-design.md, Rewards): what the pick
// screen offers at a floor's end and the starting kit, rolled from the run seed and the floor, and
// the pickups each is laid out as in the next floor's start room (src/gen/roguelite.ts). Pure.
import { firstBiome, floorSeed } from '../gen/roguelite-biomes'
import { GenRandom } from '../gen/random'
import { ORIGINAL_SPELL_WEIGHT, type FloorTheme, type Weighted } from '../gen/themes'
import { GOLDEN_MACHINE_GUN, MEDIKIT_CHARACTER, type PotionCount } from '../mr-open/mr-pickup'

/** A reward: a scroll's spell (or reserved weapon), a full heal and a medikit, or potions. */
export type RewardOption =
  | { kind: 'spell'; scroll: string }
  | { kind: 'heal' }
  | { kind: 'potions'; potions: PotionCount[] }

/**
 * What a floor's rewards are drawn from: its biomes' start scrolls (the energy blast among them, the
 * reserved weapons not), the reserved weapons a floor's end may offer instead, and potions.
 */
export interface RewardPools { spellScrolls: Weighted<string>[]; reservedWeapons: Weighted<string>[]; potions: Weighted<string>[] }

/** Whether Merlin already holds the weapon of a scroll. */
export type HoldsScroll = (scroll: string) => boolean

/** A floor-end potions reward holds this many potions, drawn uniformly. */
const REWARD_POTIONS: readonly [number, number] = [4, 5]
/** The starting kit always holds this many (design: fixed so runs stay fair). */
const KIT_POTIONS = 5
/** Every potions reward splits its potions between this many types. */
const POTION_TYPES = 2
/**
 * Owner: Merlin starts a run with only his punch; the energy blast (his starting weapon elsewhere,
 * player.weapon) is a scroll like any other, at an original spell's weight.
 */
export const ENERGY_BLAST = 'energyBlast'
/**
 * Owner: the melee weapons and the golden machine gun are never start-room scrolls; a floor's end
 * may offer one Merlin lacks in place of the new spell.
 */
const MELEE_WEAPONS: readonly string[] = ['merlinSword', 'energyPunch']
export const RESERVED_WEAPONS: readonly string[] = [...MELEE_WEAPONS, GOLDEN_MACHINE_GUN]
/**
 * Owner (2026-10-26): the melee weapons come with this many faster-movement potions, to close in on
 * the enemies. The golden machine gun shoots from afar and comes alone.
 */
const MELEE_SPEED_POTIONS: PotionCount = { character: 'walkSpeed', count: 4 }
/** The potions laid out with a scroll reward: the speed potions with a melee weapon, else none. */
export const scrollPotions = (scroll: string): PotionCount[] => (MELEE_WEAPONS.includes(scroll) ? [MELEE_SPEED_POTIONS] : [])
/** A reserved weapon's weight per biome: an original spell's. */
const RESERVED_WEAPON_WEIGHT = ORIGINAL_SPELL_WEIGHT
/** Spells that do not fight (the heal blast only heals): never the kit's, which is Merlin's first attack beside the punch. */
const NOT_ATTACKS: readonly string[] = ['healBlast']
/** Keeps the reward rolls apart from the floor layout drawn from the same floor seed. */
const REWARD_SALT = 0x5eed

const isReserved = (scroll: string): boolean => RESERVED_WEAPONS.includes(scroll)

/**
 * The pools of the floor whose biome is still to be picked: every option's weights added up, so the
 * rewards on the pick screen do not depend on the biome picked beside them (each biome adds the
 * energy blast's and the reserved weapons' weights too, keeping their share of a biome's).
 */
export function rewardPools(biomes: readonly FloorTheme[]): RewardPools {
  const merged = (list: (t: FloorTheme) => Weighted<string>[]): Weighted<string>[] => {
    const weights = new Map<string, number>()
    for (const b of biomes) for (const { value, weight } of list(b)) weights.set(value, (weights.get(value) ?? 0) + weight)
    return [...weights].map(([value, weight]) => ({ value, weight }))
  }
  const perBiome = (value: string, weight: number): Weighted<string> => ({ value, weight: weight * biomes.length })
  const spells = merged((t) => t.units.startRewards.spellScrolls).filter((s) => !isReserved(s.value) && s.value !== ENERGY_BLAST)
  return {
    spellScrolls: [...spells, perBiome(ENERGY_BLAST, ORIGINAL_SPELL_WEIGHT)],
    reservedWeapons: RESERVED_WEAPONS.map((key) => perBiome(key, RESERVED_WEAPON_WEIGHT)),
    potions: merged((t) => t.units.startRewards.potions),
  }
}

const rewardRng = (runSeed: number, floor: number): GenRandom => new GenRandom((floorSeed(runSeed, floor) ^ REWARD_SALT) >>> 0)

/** A scroll of `candidates` Merlin does not hold, by weight; null when he holds them all. */
function newSpell(rng: GenRandom, candidates: readonly Weighted<string>[], holds: HoldsScroll): RewardOption | null {
  const unheld = candidates.filter((s) => !holds(s.value))
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

/**
 * The three rewards offered when Merlin leaves for `floor` (1 = the second): a new spell (or a
 * reserved weapon he lacks), a heal and potions; two when he holds every spell and weapon.
 */
export function rollRewards(runSeed: number, floor: number, pools: RewardPools, holds: HoldsScroll): RewardOption[] {
  const rng = rewardRng(runSeed, floor)
  const spell = newSpell(rng, [...pools.spellScrolls, ...pools.reservedWeapons], holds)
  const potions = potionSplit(rng, pools, rng.int(...REWARD_POTIONS))
  return [...(spell ? [spell] : []), { kind: 'heal' }, potions]
}

/** Merlin starts a run with only his punch, no scroll's weapon. */
const HOLDS_NO_SCROLL: HoldsScroll = () => false

/** The run's starting kit, given without a pick: an attack spell, a heal and exactly KIT_POTIONS potions. */
export function startingKit(runSeed: number, pools: RewardPools): RewardOption[] {
  const rng = rewardRng(runSeed, 0)
  const spell = newSpell(rng, pools.spellScrolls.filter((s) => !NOT_ATTACKS.includes(s.value)), HOLDS_NO_SCROLL)
  return [...(spell ? [spell] : []), { kind: 'heal' }, potionSplit(rng, pools, KIT_POTIONS)]
}

const potionPickups = (potions: readonly PotionCount[]): string[] => potions.flatMap(({ character, count }) => Array<string>(count).fill(character))

/**
 * The pickups (object keys) a reward is laid out as: its scroll (and its scrollPotions), a medikit
 * (the heal's full energy comes on arrival, `arrivalHeals`, so nothing is worth leaving for later), or each potion.
 */
export function rewardPickups(reward: RewardOption): string[] {
  switch (reward.kind) {
    case 'spell': return [reward.scroll, ...potionPickups(scrollPotions(reward.scroll))]
    case 'heal': return [MEDIKIT_CHARACTER]
    case 'potions': return potionPickups(reward.potions)
  }
}

/** The pickups of the run's starting kit, for its first floor's start room: from the run seed alone. */
export const startingKitPickups = (runSeed: number): string[] =>
  startingKit(runSeed, rewardPools([firstBiome(runSeed)])).flatMap(rewardPickups)

/** The potions a reward holds in all. */
export const potionTotal = (potions: readonly PotionCount[]): number => potions.reduce((sum, p) => sum + p.count, 0)

/** Whether a reward heals Merlin to full energy as he arrives on the floor (the heal). */
export const arrivalHeals = (reward: RewardOption): boolean => reward.kind === 'heal'
