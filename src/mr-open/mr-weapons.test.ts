// modWeaponManager for Merlin: weapons by symbol in the order added, a new one current at once,
// selectSpell numbering only the spells.
import { describe, expect, it } from 'vitest'
import type { AttackDef } from './mr-actor-data'
import { addWeapon, NO_ARSENAL, nextWeapon, nthSpell } from './mr-weapons'

const spell = (name: string) => ({ name, animType: 'magic' }) as AttackDef
const melee = (name: string) => ({ name, animType: 'naturalMelee' }) as AttackDef

const arsenal = [
  ['punch', melee('punch')], ['energyBlast', spell('energyBlast')], ['merlinSword', melee('merlinSword')], ['cBlast', spell('energyBlast')],
] as const

describe('weapons', () => {
  const held = arsenal.reduce((a, [key, attack]) => addWeapon(a, key, attack), NO_ARSENAL)

  it('a new weapon goes last and becomes current; a known one keeps its place', () => {
    expect(held.weapons.map((w) => w.key)).toEqual(['punch', 'energyBlast', 'merlinSword', 'cBlast'])
    expect(held.current).toBe('cBlast')
    const again = addWeapon(held, 'energyBlast', spell('energyBlast'))
    expect(again.weapons.map((w) => w.key)).toEqual(['punch', 'energyBlast', 'merlinSword', 'cBlast'])
    expect(again.current).toBe('energyBlast')
  })

  it('selectSpell counts only the spells (animType #magic), in the order collected', () => {
    expect(nthSpell(held, 1)).toBe('energyBlast')
    expect(nthSpell(held, 2)).toBe('cBlast')
    expect(nthSpell(held, 3)).toBeNull()
  })

  it('the touch weapon button steps through every weapon and wraps', () => {
    expect(nextWeapon(held)).toBe('punch')
    expect(nextWeapon({ ...held, current: 'punch' })).toBe('energyBlast')
  })
})
