// Potion and medikit rules (engine-mechanics-potions.md §3-4).
import { describe, expect, it } from 'vitest'
import { NO_MEDIKITS, collectMedikit, drinkPotion, medikitStep, medikitsHeld, withPotions, type MedikitState } from './mr-pickup'

const MERLIN = { mana_burst: 1, mana_capacity: 10, mana_flow: 1, walkAcceleration: 2 }

describe('potions', () => {
  it('raise burst and capacity by 0.75, flow by 0.5 and the walk acceleration by 0.3 each', () => {
    const drunk = [{ character: 'manaBurst', count: 2 }, { character: 'manaCapacity', count: 4 }, { character: 'manaFlow', count: 4 }, { character: 'walkSpeed', count: 1 }]
    expect(withPotions(MERLIN, drunk)).toEqual({ mana_burst: 2.5, mana_capacity: 13, mana_flow: 3, walkAcceleration: 2.3 })
  })

  it('are counted per character in the order first drunk', () => {
    let drunk = drinkPotion([], 'manaFlow')
    drunk = drinkPotion(drunk, 'manaBurst')
    drunk = drinkPotion(drunk, 'manaFlow')
    expect(drunk).toEqual([{ character: 'manaFlow', count: 2 }, { character: 'manaBurst', count: 1 }])
  })
})

describe('medikits', () => {
  it('a medikit goes into stock and restores 25 at once; a maxikit restores full energy', () => {
    const kit = collectMedikit(NO_MEDIKITS, 'medikit', 100, 200)
    expect(kit.energy).toBe(125)
    expect(medikitsHeld(kit.medikits)).toBe(1)
    expect(collectMedikit(NO_MEDIKITS, 'medikit', 190, 200).energy).toBe(200)
    const maxi = collectMedikit(NO_MEDIKITS, 'maxikit', 30, 200)
    expect(maxi).toEqual({ medikits: NO_MEDIKITS, energy: 200 })
  })

  it('heal 1 every 5 ticks while hurt, from a kit of max energy, after one finish to take it from stock', () => {
    let m: MedikitState = { ...NO_MEDIKITS, stock: 1 }
    let energy = 100
    const heals: number[] = []
    for (let tick = 1; tick <= 20; tick++) {
      const before = energy
      ;({ medikits: m, energy } = medikitStep(m, energy, 200))
      if (energy > before) heals.push(tick)
    }
    // the counter finishes on ticks 4, 9, 14, 19: the first takes the kit out of stock
    expect(heals).toEqual([9, 14, 19])
    expect(m).toMatchObject({ stock: 0, remaining: 197, active: true })
  })

  it('do nothing at full energy, and stop when the stock runs out', () => {
    const full = medikitStep({ ...NO_MEDIKITS, remaining: 50, active: true }, 200, 200)
    expect(full).toEqual({ medikits: { ...NO_MEDIKITS, remaining: 50, active: false }, energy: 200 })
    let m: MedikitState = NO_MEDIKITS
    let energy = 100
    for (let tick = 0; tick < 50; tick++) ({ medikits: m, energy } = medikitStep(m, energy, 200))
    expect(energy).toBe(100)
    expect(m.active).toBe(false)
  })
})
