// The roguelite reward rolls (docs/plans/2026-10-25-roguelite-mode-design.md, Rewards): a spell
// Merlin lacks, potions split between two types, the kit's fixed five, all repeatable per seed.
import { describe, expect, it } from 'vitest'
import { ROGUELITE_FLOORS } from '../gen/roguelite-biomes'
import { pickUnlocked, PICK_LOCK_MS } from './pick'
import { potionTotal, rewardPickups, rewardPools, rollRewards, startingKit, type RewardOption } from './rewards'

const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1)
const POOLS = ROGUELITE_FLOORS.map(rewardPools)
const holdsNothing = () => false

const potionsOf = (options: RewardOption[]) => {
  const p = options.find((o) => o.kind === 'potions')
  if (p?.kind !== 'potions') throw new Error('no potions reward')
  return p.potions
}
const spellOf = (options: RewardOption[]) => options.find((o) => o.kind === 'spell')

describe('roguelite rewards', () => {
  it('never offers a spell Merlin holds', () => {
    for (const seed of SEEDS) {
      for (const [floor, pools] of POOLS.entries()) {
        const held = new Set(pools.spellScrolls.slice(0, pools.spellScrolls.length - 2).map((s) => s.value))
        const spell = spellOf(rollRewards(seed, floor, pools, (k) => held.has(k)))
        expect(spell?.kind === 'spell' && held.has(spell.scroll)).toBe(false)
        expect(spell).toBeDefined()
      }
    }
  })

  it('offers only the heal and the potions when Merlin holds every spell', () => {
    const options = rollRewards(1, 1, POOLS[1]!, () => true)
    expect(options.map((o) => o.kind)).toEqual(['heal', 'potions'])
  })

  it('offers 4-5 potions of exactly two types', () => {
    for (const seed of SEEDS) {
      for (const [floor, pools] of POOLS.entries()) {
        const potions = potionsOf(rollRewards(seed, floor, pools, holdsNothing))
        expect(new Set(potions.map((p) => p.character)).size).toBe(2)
        expect(potions.every((p) => p.count >= 1)).toBe(true)
        expect([4, 5]).toContain(potionTotal(potions))
      }
    }
  })

  it('gives a starting kit of a spell, a heal and exactly 5 potions of two types', () => {
    for (const seed of SEEDS) {
      const kit = startingKit(seed, POOLS[0]!)
      expect(kit.map((o) => o.kind)).toEqual(['spell', 'heal', 'potions'])
      const potions = potionsOf(kit)
      expect(new Set(potions.map((p) => p.character)).size).toBe(2)
      expect(potionTotal(potions)).toBe(5)
    }
  })

  it('rolls the same rewards for the same seed and floor', () => {
    for (const seed of SEEDS) {
      expect(rollRewards(seed, 2, POOLS[2]!, holdsNothing)).toEqual(rollRewards(seed, 2, POOLS[2]!, holdsNothing))
      expect(startingKit(seed, POOLS[0]!)).toEqual(startingKit(seed, POOLS[0]!))
    }
  })
})

describe('reward pickups', () => {
  it('lays a spell out as its scroll, the heal as a maxikit and a medikit, potions one by one', () => {
    expect(rewardPickups({ kind: 'spell', scroll: 'armySummon' })).toEqual(['armySummon'])
    expect(rewardPickups({ kind: 'heal' })).toEqual(['maxikit', 'medikit'])
    const potions = [{ character: 'manaFlow', count: 3 }, { character: 'walkSpeed', count: 2 }]
    expect(rewardPickups({ kind: 'potions', potions })).toEqual(['manaFlow', 'manaFlow', 'manaFlow', 'walkSpeed', 'walkSpeed'])
  })
})

describe('the pick lock', () => {
  it('takes no pick until the lock time has passed', () => {
    expect(pickUnlocked(1000, 1000)).toBe(false)
    expect(pickUnlocked(1000, 1000 + PICK_LOCK_MS - 1)).toBe(false)
    expect(pickUnlocked(1000, 1000 + PICK_LOCK_MS)).toBe(true)
  })
})
