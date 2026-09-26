import { describe, expect, it } from 'vitest'
import type { ActorDef, AttackDef } from './mr-actor-data'
import { aimWithEyestrain, attackLoc, bulletPush, cooldownIncrement, cooldownReady, meleeHits, meleePush, rangedShot, resetCooldown, tickCooldown } from './mr-attack'

const attack = (o: Partial<AttackDef>): AttackDef => ({
  name: 'none', type: 'melee', animType: 'none', animFrame: [2], collisionLoc: { x: 25, y: 0 }, idealAttackLoc: { x: 25, y: 0 },
  reach: 25, cooldown: 0, power: { x: 5, y: -1 }, damageMultiplier: 1, bullet: null, firingType: 'proportional', hits: ['teamMembers'],
  chargeStart: 1, chargeMax: 5, chargeMaxBasic: 0, chargeMaxModifier: 1, chargeSpeed: 1, chargeSize: 1, chargeExplodeFactor: 4, explodeCharge: 10, chargeSpeedMax: null, explodeFunction: null, multistage: [], randomSummon: false, targetTileWhenNotBlank: false,
  chargeColour: { r: 255, g: 255, b: 255 }, spellSpeed: 2, limitMagic: false, sound: null, releaseSound: null, explodeSound: null,
  volume: 150, chargeVolumeMap: { charge: [1, 100], vol: [10, 255] }, ...o,
})
const actor = (key: string, o: Partial<ActorDef>, a: Partial<AttackDef>): ActorDef => ({
  key, name: key, objType: 'objCPUCharacter', aiType: 'objAiCPU', team: 'goblins', layerZ: 'gGameObjectLayer', startOffset: { x: -16, y: -16 },
  energy: 100, energyRecoverDelay: 300, friction: { x: 50, y: 50 }, frictionReel: { x: 10, y: 10 }, inertia: 0, damageSpeed: 5, stallSpeed: 0.2, teamRole: 'teamMembers', residentGroups: [], totalResidents: 10, productionTimeScale: 1, reelProof: false, collisionDetection: true, minEnergy: 0, maxEnergy: o.energy ?? 100, graveOn: true, reincarnateAs: [], runReload: false, explodeEvents: [], exploderSound: null, exploderVolume: 50, chargeLoc: { x: 0, y: -8 },
  walkSpeed: 4, walkAcceleration: 0.5, navModeAcceleration: 0, collisionRectScale: 1, pathFindingStallTime: 5, scenicMaxTicks: 60, detourChance: 0, detourMoveTicks: 90, detourMoveMaxTicks: 60, detourPauseTicks: 15, detourDistance: 50, detourMinTargetDistance: 50, projectileSpreadDeg: 0, knockbackSpreadDeg: 0, weaponTechnique: 0, strength: 1, agility: 1, dexterity: 1, eyestrain: 0, mana_burst: 1, mana_capacity: 10, mana_flow: 1,
  mana_regeneration: 1, weapon: null, experienceImWorth: 0,
  takeHitSound: null, takeHitVolume: 150, dieSound: null, dieVolume: 100, musicTrack: null, attack: attack(a), naturalAttack: attack(a), multiAttack: false, bufferDist: 100, raw: {}, ...o,
})

const warrior = actor('goblinWarrior', { strength: 4, agility: 1, inertia: 30 }, { type: 'melee', collisionLoc: { x: 15, y: 0 }, idealAttackLoc: { x: 15, y: 0 }, power: { x: 0.7, y: 0 }, damageMultiplier: 2, cooldown: 0 })
const archer = actor('goblinArcher', { strength: 8, dexterity: 10, eyestrain: 5, inertia: 50 }, { type: 'ranged', collisionLoc: { x: 0, y: -2 }, reach: 100, cooldown: 200, power: 0.5, firingType: 'fullstrength', bullet: 'goblinArrow' })
const arrow = actor('goblinArrow', { objType: 'objBullet', aiType: null }, { type: 'bullet', power: 0.5, damageMultiplier: 3 })
const player = actor('player', { objType: 'objPlayerMerlinCharacter', strength: 8, agility: 1, mana_regeneration: 30 }, { name: 'punch', type: 'melee', collisionLoc: { x: 9, y: -1 }, reach: { x: 7, y: 10 }, power: { x: 2, y: 0 }, cooldown: 20 })

describe('cooldowns', () => {
  it('advance by the stat matching the attack type', () => {
    expect(cooldownIncrement(warrior)).toBe(1)
    expect(cooldownIncrement(archer)).toBe(10)
    expect(cooldownIncrement(actor('mage', { mana_regeneration: 30 }, { type: 'magic' }))).toBe(30)
  })
  it('bow: cooldown 200 with dexterity 10 is ready after 20 ticks', () => {
    let c = resetCooldown(archer.attack)
    expect(c).toBe(200)
    const inc = cooldownIncrement(archer)
    for (let i = 0; i < 19; i++) {
      c = tickCooldown(c, inc)
      expect(cooldownReady(c)).toBe(false)
    }
    c = tickCooldown(c, inc)
    expect(c).toBe(0)
    expect(cooldownReady(c)).toBe(true)
  })
  it('sword: cooldown 0 is ready at once; player punch 20 / agility 1 takes 20 ticks', () => {
    expect(cooldownReady(resetCooldown(warrior.attack))).toBe(true)
    let c = resetCooldown(player.attack)
    let n = 0
    while (!cooldownReady(c)) { c = tickCooldown(c, cooldownIncrement(player)); n++ }
    expect(n).toBe(20)
  })
})

describe('melee', () => {
  it('warrior sword push is (2.8, 0) facing right and (-2.8, 0) facing left', () => {
    expect(meleePush(warrior, false)).toEqual({ x: 2.8, y: 0 })
    expect(meleePush(warrior, true)).toEqual({ x: -2.8, y: 0 })
  })
  it('player punch push is (16, 0)', () => {
    expect(meleePush(player, false)).toEqual({ x: 16, y: 0 })
  })
  it('rejects a scalar power', () => {
    expect(() => meleePush(arrow, false)).toThrow(/goblinArrow/)
  })
  it('hits iff the mirrored strike point is inside the target sprite rect', () => {
    const pos = { x: 100, y: 100 }
    expect(attackLoc(pos, warrior.attack, false)).toEqual({ x: 115, y: 100 })
    const rect = { left: 115, top: 84, right: 147, bottom: 116 }
    expect(meleeHits(pos, warrior, false, rect)).toBe(true)
    expect(meleeHits(pos, warrior, true, rect)).toBe(false)
    expect(meleeHits(pos, warrior, false, { ...rect, left: 116 })).toBe(false)
    expect(meleeHits(pos, warrior, true, { left: 70, top: 84, right: 86, bottom: 116 })).toBe(true)
  })
})

describe('ranged', () => {
  const from = { x: 0, y: 0 }
  it('eyestrain is zero at point blank', () => {
    const [aim, rng] = aimWithEyestrain(from, { x: 1, y: 0 }, archer, { seed: 1 })
    expect(aim).toEqual({ x: 1, y: 0 })
    expect(rng).not.toEqual({ seed: 1 }) // the rng still advances twice
  })
  it('eyestrain at reach stays within +/-eyestrain and is integer', () => {
    let rng = { seed: 7 }
    for (let i = 0; i < 50; i++) {
      const [aim, next] = aimWithEyestrain(from, { x: 100, y: 0 }, archer, rng)
      rng = next
      expect(Math.abs(aim.x - 100)).toBeLessThanOrEqual(5)
      expect(Math.abs(aim.y)).toBeLessThanOrEqual(5)
      expect(Number.isInteger(aim.x)).toBe(true)
    }
  })
  it('eyestrain scales linearly: at half reach the error is integer(2.5) = 3 (Lingo integer() rounds)', () => {
    let rng = { seed: 3 }
    let maxErr = 0
    for (let i = 0; i < 200; i++) {
      const [aim, next] = aimWithEyestrain(from, { x: 50, y: 0 }, archer, rng)
      rng = next
      maxErr = Math.max(maxErr, Math.abs(aim.x - 50))
    }
    expect(maxErr).toBe(3)
  })
  it('fullstrength shot spawns at the mirrored collisionLoc with a velocity of length strength', () => {
    const s = rangedShot({ x: 10, y: 10 }, { x: 40, y: 48 }, archer, false)
    expect(s.spawn).toEqual({ x: 10, y: 8 })
    expect(s.vel).toEqual({ x: 4.8, y: 6.4 })
    expect(Math.hypot(s.vel.x, s.vel.y)).toBeCloseTo(8)
  })
  it('proportional shot is distance / 10', () => {
    const s = rangedShot(from, { x: 50, y: -20 }, { ...archer, attack: { ...archer.attack, firingType: 'proportional' } }, false)
    expect(s.vel).toEqual({ x: 5, y: -1.8 })
  })
  it('a bullet with velocity (8, 0) pushes (4, 0)', () => {
    expect(bulletPush({ x: 8, y: 0 }, arrow)).toEqual({ x: 4, y: 0 })
    expect(() => bulletPush({ x: 8, y: 0 }, warrior)).toThrow(/goblinWarrior/)
  })
})
