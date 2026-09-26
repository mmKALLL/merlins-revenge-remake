import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { resolveActors, type Plain } from './mr-actor-data'

function loadFiles(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const f of readdirSync('assets/actors')) out[f.replace(/\.txt$/, '')] = readFileSync(`assets/actors/${f}`, 'utf8')
  return out
}

/**
 * Engine data plus only the overlay the port itself needs (the blast is granted at start because
 * pickups are not ported). Balance tweaks in assets/tuning.json are deliberately left out, so these
 * tests check the original values rather than pinning tuning.
 */
export const ENGINE_OVERLAY: Record<string, Plain> = { player: { weapon: 'energyBlast' } }

describe('resolveActors', () => {
  const defs = resolveActors(loadFiles(), ENGINE_OVERLAY)

  it('resolves the goblin warrior through CPUCharacter, character and actor', () => {
    const w = defs['goblinWarrior']!
    expect(w.objType).toBe('objCPUCharacter')
    expect(w.aiType).toBe('objAiCPU')
    expect(w.team).toBe('goblins')
    expect(w.name).toBe('goblinWarrior')
    expect(w.walkSpeed).toBe(4)
    expect(w.strength).toBe(4)
    expect(w.inertia).toBe(30)
    expect(w.energy).toBe(100) // object default, not in the data files
    expect(w.frictionReel).toEqual({ x: 10, y: 10 })
    expect(w.weapon).toBe('goblinSword')
    expect(w.energyRecoverDelay).toBe(300)
  })

  it('installs the starting weapon attack with struct defaults filled in', () => {
    const a = defs['goblinWarrior']!.attack
    expect(a.type).toBe('melee') // derived from animType weaponMelee
    expect(a.animFrame).toBe(7) // from #animframe (case-insensitive key)
    expect(a.collisionLoc).toEqual({ x: 15, y: 0 })
    expect(a.idealAttackLoc).toEqual({ x: 15, y: 0 })
    expect(a.power).toEqual({ x: 0.7, y: 0 })
    expect(a.damageMultiplier).toBe(2)
    expect(a.cooldown).toBe(0)
    expect(a.reach).toBe(25) // struct default, unused for melee
  })

  it('resolves the archer with a ranged attack', () => {
    const g = defs['goblinArcher']!
    expect(g.energy).toBe(50)
    expect(g.attack.type).toBe('ranged')
    expect(g.attack.bullet).toBe('goblinArrow')
    expect(g.attack.reach).toBe(100)
    expect(g.attack.cooldown).toBe(200)
    expect(g.attack.firingType).toBe('fullstrength')
  })

  it('resolves the player with the energy blast as its current attack (granted weapon)', () => {
    const p = defs['player']!
    expect(p.weapon).toBe('energyBlast')
    expect(p.attack.name).toBe('energyBlast')
    expect(p.raw['weapon']).toBe('energyBlast')
    expect((p.raw['attack'] as Plain)['name']).toBe('punch') // the natural attack stays in raw
    expect(p.energy).toBe(200)
    expect(p.energyRecoverDelay).toBe(30)
    expect(p.mana_capacity).toBe(10)
    expect(p.attack.type).toBe('magic')
    expect(p.attack.chargeMaxBasic).toBe(5)
    expect(p.attack.spellSpeed).toBe(20)
    expect(p.attack.power).toBe(0.75)
    expect(p.attack.limitMagic).toBe(true) // Lingo TRUE identifier
    expect(p.raw['stretchdeath']).toBe(true) // non-canonical keys are lowercased
  })

  it('resolves the arrow as a bullet with power 0.5 and friction 5%', () => {
    const b = defs['goblinArrow']!
    expect(b.objType).toBe('objBullet')
    expect(b.attack.power).toBe(0.5)
    expect(b.attack.damageMultiplier).toBe(3)
    expect(b.friction).toEqual({ x: 5, y: 5 })
    expect(b.name).toBe('gobarrow')
  })

  it('applies a tuning overlay last', () => {
    const tuned = resolveActors(loadFiles(), { goblinArcher: { attack: { reach: 120 } } })
    expect(tuned['goblinArcher']!.attack.reach).toBe(120)
    expect(tuned['goblinArcher']!.attack.cooldown).toBe(200)
  })

  it('lets a tuning overlay swap the starting weapon before the attack is installed', () => {
    const tuned = resolveActors(loadFiles(), { goblinWarrior: { weapon: 'goblinBow' } })
    const w = tuned['goblinWarrior']!
    expect(w.weapon).toBe('goblinBow')
    expect(w.attack.type).toBe('ranged')
    expect(w.raw['weapon']).toBe('goblinBow')
  })

  it('applies tuning[key].attack on top of the swapped weapon attack', () => {
    const tuned = resolveActors(loadFiles(), { goblinWarrior: { weapon: 'goblinBow', attack: { reach: 42 } } })
    expect(tuned['goblinWarrior']!.attack.reach).toBe(42)
    expect(tuned['goblinWarrior']!.attack.bullet).toBe('goblinArrow')
  })

  it('fails loudly on an unknown starting weapon', () => {
    expect(() => resolveActors(loadFiles(), { goblinWarrior: { weapon: 'laserGun' } }))
      .toThrow('actor goblinWarrior: unknown weapon laserGun')
  })

  it('fails loudly on a mistyped field', () => {
    expect(() => resolveActors(loadFiles(), { goblinWarrior: { energy: 'lots' } })).toThrow(/goblinWarrior.*energy/)
    expect(() => resolveActors(loadFiles(), { goblinWarrior: { attack: { type: 'laser' } } })).toThrow(/goblinWarrior.*attack\.type/)
    expect(() => resolveActors(loadFiles(), { goblinWarrior: { friction: 3 } })).toThrow(/goblinWarrior.*friction.*got 3/)
  })

  it('prefixes Lingo parse errors with the actor key', () => {
    expect(() => resolveActors({ broken: '[#name: "act_broken", #type: #field]\n[#objType: #objBullet,' })).toThrow(/^actor broken: /)
    expect(() => resolveActors({ flat: '[#name: "act_flat", #type: #field]\n[1, 2, 3]' })).toThrow(/^actor flat: .*property list/)
  })

  it('lowercases non-canonical raw keys and keeps canonical spellings', () => {
    const r = defs['goblinArcher']!.raw
    expect(r['weapontechnique']).toBe(-75)
    expect(r['miniMapStatus']).toBe('inf')
    expect(r['walkSpeed']).toBe(4)
  })

  it('keys energyRecoverDelay by objType with the modEnergy default as the fallback', () => {
    expect(defs['goblinWarrior']!.energyRecoverDelay).toBe(300)
    expect(defs['player']!.energyRecoverDelay).toBe(30)
    expect(defs['goblinArrow']!.energyRecoverDelay).toBe(1000)
  })

  it('fails loudly on a missing parent', () => {
    expect(() => resolveActors({ x: '[#name: "act_x", #type: #field]\n[#inherit: #nope]' })).toThrow(/x.*nope/)
  })

  it('accepts CRLF line endings', () => {
    const d = resolveActors({ x: '[#name: "act_x", #type: #field]\r\n[\r\n#objType: #objBullet,\r\n#name: "x"\r\n]\r\n' })
    expect(d['x']!.objType).toBe('objBullet')
  })
})
