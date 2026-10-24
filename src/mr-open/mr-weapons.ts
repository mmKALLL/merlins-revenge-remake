// Port of modWeaponManager for Merlin (docs/notes/engine-mechanics-spells.md §2): the weapons he
// holds by symbol in the order they were added (initNaturalAttack, initStartingWeapon, addWeapon
// from scrolls), the current one, and selectSpell's numbering of the weapon keys (remake: melee too).
import type { ActorDef, AttackDef } from './mr-actor-data'

export interface WeaponSlot {
  key: string // the weapon symbol: the natural attack's name, the starting weapon, or the scroll's #character
  attack: AttackDef
}

/**
 * Merlin's weapons. The current weapon's cooldown counter is the player actor's `cooldown`; the
 * others wait in `idleCooldowns` (every counter runs every tick, modWeaponManager.updateCooldowns).
 */
export interface Arsenal {
  weapons: WeaponSlot[]
  current: string
  idleCooldowns: Record<string, number>
}

export const NO_ARSENAL: Arsenal = { weapons: [], current: '', idleCooldowns: {} }

/** structWeaponSelectorPaletteTypes: the spells (animType #magic) and everything else. */
export type WeaponGroup = 'magic' | 'nonMagic'

/** modWeaponManager.weaponIsOfType. */
export const weaponGroupOf = (a: AttackDef): WeaponGroup => (a.animType === 'magic' ? 'magic' : 'nonMagic')

/** modWeaponManager.initNaturalAttack: only the natural attack (Merlin's punch), current. */
export const naturalArsenal = (def: ActorDef): Arsenal => addWeapon(NO_ARSENAL, def.naturalAttack.name, def.naturalAttack)

/** modWeaponManager.start: the natural attack (Merlin's punch), then the starting weapon, which is current. */
export function startingArsenal(def: ActorDef): Arsenal {
  const arsenal = naturalArsenal(def)
  return def.weapon === null ? arsenal : addWeapon(arsenal, def.weapon, def.attack)
}

/**
 * modWeaponManager.addWeapon: a known symbol keeps its place and takes the new attack, a new one goes
 * last; either way it becomes current with a ready cooldown (addCooldownCounter starts it finished).
 * The previous weapon's cooldown is the caller's to file (selectWeapon).
 */
export function addWeapon(arsenal: Arsenal, key: string, attack: AttackDef): Arsenal {
  const known = arsenal.weapons.some((w) => w.key === key)
  const weapons = known ? arsenal.weapons.map((w) => (w.key === key ? { key, attack } : w)) : [...arsenal.weapons, { key, attack }]
  return { weapons, current: key, idleCooldowns: arsenal.idleCooldowns }
}

export const weaponOf = (arsenal: Arsenal, key: string): WeaponSlot | undefined => arsenal.weapons.find((w) => w.key === key)

/** The current weapon's attack; undefined only for an empty arsenal. */
export const currentAttack = (arsenal: Arsenal): AttackDef | undefined => weaponOf(arsenal, arsenal.current)?.attack

/** modWeaponManager.getWeapons(type): the group's weapons in arsenal order. */
export const weaponsIn = (arsenal: Arsenal, group: WeaponGroup): WeaponSlot[] => arsenal.weapons.filter((w) => weaponGroupOf(w.attack) === group)

/**
 * modWeaponManager.selectSpell(num): the num-th spell (1-based), or null when there are fewer.
 * Remake (owner request): the number keys count the melee weapons too (the sword, the energy
 * punch), in the order Merlin took them: every weapon but the natural attack `natural`.
 */
export function nthSpell(arsenal: Arsenal, num: number, natural: string): string | null {
  return arsenal.weapons.filter((w) => w.key !== natural)[num - 1]?.key ?? null
}

/**
 * Remake (the touch selector): the weapon after the current one in arsenal order, wrapping, passing
 * over `skipped` (Merlin's punch: the energy blast is always there; owner request).
 */
export function nextWeapon(arsenal: Arsenal, skipped: string): string {
  const i = arsenal.weapons.findIndex((w) => w.key === arsenal.current)
  const n = arsenal.weapons.length
  for (let step = 1; step <= n; step++) {
    const key = arsenal.weapons[(i + step) % n]!.key
    if (key !== skipped) return key
  }
  return arsenal.current
}
