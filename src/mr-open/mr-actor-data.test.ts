import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { resolveActors } from './mr-actor-data'

function loadFiles(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const f of readdirSync('assets/actors')) out[f.replace(/\.txt$/, '')] = readFileSync(`assets/actors/${f}`, 'utf8')
  return out
}

describe('resolveActors', () => {
  const defs = resolveActors(loadFiles())

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

  it('resolves the player with the energy blast as its current attack', () => {
    const p = defs['player']!
    expect(p.energy).toBe(200)
    expect(p.energyRecoverDelay).toBe(30)
    expect(p.mana_capacity).toBe(10)
    expect(p.attack.type).toBe('magic')
    expect(p.attack.chargeMaxBasic).toBe(5)
    expect(p.attack.spellSpeed).toBe(20)
    expect(p.attack.power).toBe(0.75)
    expect(p.attack.limitMagic).toBe(true) // Lingo TRUE identifier
    expect(p.raw['stretchDeath']).toBe(true)
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

  it('fails loudly on a missing parent', () => {
    expect(() => resolveActors({ x: '[#name: "act_x", #type: #field]\n[#inherit: #nope]' })).toThrow(/x.*nope/)
  })

  it('accepts CRLF line endings', () => {
    const d = resolveActors({ x: '[#name: "act_x", #type: #field]\r\n[\r\n#objType: #objBullet,\r\n#name: "x"\r\n]\r\n' })
    expect(d['x']!.objType).toBe('objBullet')
  })
})
