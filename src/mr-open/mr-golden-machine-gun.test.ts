import { describe, expect, it } from 'vitest'
import { defs } from '../sim/test-data'
import { NO_GMG, gmgAttack, gmgAutoFires, gmgCollected, gmgSummonDue, gunAttack, isSpellStream, onGunRhythm, setGmg } from './mr-golden-machine-gun'
import { chargeLimits } from './mr-spell'

const player = defs['player']!
const limitsOf = (spell: string) => chargeLimits({ ...player, attack: gmgAttack(defs[spell]!.attack) })

describe('the golden machine gun switch (modGoldenMachineGun)', () => {
  it('the #gmg key does nothing before the gun is found', () => {
    expect(setGmg(NO_GMG)).toEqual(NO_GMG)
  })

  it('found, it is on; the key (or a second pickup) flips it', () => {
    const found = gmgCollected(NO_GMG)
    expect(found).toEqual({ collected: true, on: true })
    expect(setGmg(found).on).toBe(false)
    expect(gmgCollected(found).on).toBe(false)
  })

  it('a spell without gmg* fields (a remake volley) keeps its charge, only marked as fired through the gun', () => {
    const volley = defs['arrowRain']!.attack
    expect(volley.gmg).toBeNull()
    expect(gunAttack(volley)).toEqual({ ...volley, gmgOn: true })
  })
})

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

  it('remake gmgChargeFullTicks: the gun version takes it as its chargeFullTicks; without it the attack keeps its own', () => {
    const cBlast = defs['cBlast']!.attack
    expect(gmgAttack({ ...cBlast, chargeFullTicks: 150 }).chargeFullTicks).toBe(150)
    expect(gmgAttack({ ...cBlast, chargeFullTicks: 150, gmg: { ...cBlast.gmg!, chargeFullTicks: 60 } }).chargeFullTicks).toBe(60)
  })

  it('remake gmgStreamSlowdown: the gun version keeps its own charge, its speed and speed cap divided', () => {
    const mines = { ...defs['energyMines']!.attack, gmgStreamSlowdown: 2, chargeSpeedMax: 4 }
    const gun = gunAttack(mines)
    expect(gun).toMatchObject({ chargeStart: mines.chargeStart, chargeMax: mines.chargeMax, chargeSpeed: mines.chargeSpeed / 2, chargeSpeedMax: 2, gmgOn: true })
    expect(isSpellStream(gun)).toBe(true)
    expect(isSpellStream(mines)).toBe(false)
  })

  it('remake gmgSummonsLowest: the gun summon is due once it reaches the lowest stage in the reserve, never with none there', () => {
    const army = gunAttack({ ...defs['armySummon']!.attack, gmgSummonsLowest: true })
    const archer = army.multistage[1]!.chargeRequired
    expect(gmgSummonDue(army, archer - 0.1, 2)).toBe(false)
    expect(gmgSummonDue(army, archer, 2)).toBe(true)
    expect(gmgSummonDue(army, 99, 0)).toBe(false)
    expect(gmgSummonDue({ ...army, gmgSummonsLowest: false }, archer, 2)).toBe(false)
  })

  it('remake fireRateScale: gun spells start on that share of the ticks, spread evenly; every tick at 1', () => {
    const ticks = Array.from({ length: 100 }, (_, i) => i + 1)
    expect(ticks.filter((n) => onGunRhythm(n, 0.7))).toHaveLength(70)
    const skipped = ticks.filter((n) => !onGunRhythm(n, 0.7))
    expect(skipped.every((n, i) => i === 0 || n - skipped[i - 1]! > 1)).toBe(true) // never two in a row
    expect(ticks.every((n) => onGunRhythm(n, 1))).toBe(true)
  })

  it('an attack used without the gun never autofires', () => {
    const limits = limitsOf('energyBlast')
    expect(gmgAutoFires(defs['energyBlast']!.attack, limits.max, limits)).toBe(false)
  })
})
