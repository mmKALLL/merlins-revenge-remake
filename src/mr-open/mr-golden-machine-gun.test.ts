import { describe, expect, it } from 'vitest'
import { defs } from '../sim/test-data'
import { gmgAttack, gmgAutoFires } from './mr-golden-machine-gun'
import { chargeLimits } from './mr-spell'

const player = defs['player']!
const limitsOf = (spell: string) => chargeLimits({ ...player, attack: gmgAttack(defs[spell]!.attack) })

describe('the golden machine gun charge (modAttack.gmgOn, #spellCharged)', () => {
  it("mana_flow cannot raise the gmg charge speed (chargeSpeedMax is gmgChargeSpeed)", () => {
    const fast = { ...player, mana_flow: 3, attack: gmgAttack(defs['energyBlast']!.attack) }
    expect(chargeLimits(fast).speed).toBe(defs['energyBlast']!.attack.gmg!.chargeSpeed)
  })

  it('an autofire spell goes once one more charge step would reach its max', () => {
    const atk = gmgAttack(defs['energyBlast']!.attack)
    const limits = limitsOf('energyBlast')
    expect(gmgAutoFires(atk, limits.max - limits.speed - 0.01, limits)).toBe(false)
    expect(gmgAutoFires(atk, limits.max - limits.speed, limits)).toBe(true)
  })

  it('a pulse spell (gmg charge 0 to 0) goes on its first tick, firing at once (fireDelay 0)', () => {
    const atk = gmgAttack(defs['energyPulseSpell']!.attack)
    const limits = limitsOf('energyPulseSpell')
    expect(limits).toMatchObject({ start: 0, max: 0 })
    expect(gmgAutoFires(atk, limits.start, limits)).toBe(true)
    expect(atk.fireDelay).toBe(0)
  })

  it('spells without gmgAutoFire (the mines, the summons) are charged and released by hand', () => {
    for (const spell of ['energyMines', 'monsterSummon', 'armySummon']) {
      const limits = limitsOf(spell)
      expect(gmgAutoFires(gmgAttack(defs[spell]!.attack), limits.max, limits), spell).toBe(false)
    }
  })

  it('an attack used without the gun never autofires', () => {
    const limits = limitsOf('energyBlast')
    expect(gmgAutoFires(defs['energyBlast']!.attack, limits.max, limits)).toBe(false)
  })
})
