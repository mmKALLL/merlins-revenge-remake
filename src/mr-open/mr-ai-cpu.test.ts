import { describe, expect, it } from 'vitest'
import type { AttackDef } from './mr-actor-data'
import { decide, dirXToTarget, idealAttackLoc, RETARGET_TICKS, strikePoint, targetInReach, type AiView, type TargetView } from './mr-ai-cpu'

const base: AttackDef = {
  name: 'none', type: 'melee', animType: 'weaponMelee', animFrame: [7], collisionLoc: { x: 15, y: 0 }, idealAttackLoc: { x: 15, y: 0 },
  reach: 25, cooldown: 0, power: { x: 0.7, y: 0 }, damageMultiplier: 2, bullet: null, firingType: 'proportional', hits: ['teamMembers'],
  chargeStart: 1, chargeMax: 5, chargeMaxBasic: 0, chargeMaxModifier: 1, chargeSpeed: 1, chargeSize: 1, chargeExplodeFactor: 4, explodeCharge: 10, chargeSpeedMax: null, explodeFunction: null, multistage: [], randomSummon: false, targetTileWhenNotBlank: false,
  chargeColour: { r: 255, g: 255, b: 255 }, spellSpeed: 2, limitMagic: false, sound: null, releaseSound: null, explodeSound: null,
  volume: 150, chargeVolumeMap: { charge: [1, 100], vol: [10, 255] },
}
const sword: AttackDef = base
const bow: AttackDef = { ...base, name: 'goblinBow', type: 'ranged', animType: 'weaponRanged', animFrame: [21], collisionLoc: { x: 0, y: -2 }, reach: 100, cooldown: 200, power: 0.5, firingType: 'fullstrength', bullet: 'goblinArrow' }

const rectAround = (p: { x: number; y: number }, half = 16) => ({ left: p.x - half, top: p.y - half, right: p.x + half, bottom: p.y + half })
const target = (x: number, y: number, alive = true): TargetView => ({ pos: { x, y }, rect: rectAround({ x, y }), alive })

describe('dirXToTarget / idealAttackLoc', () => {
  it('ties go right', () => {
    expect(dirXToTarget({ x: 5, y: 0 }, { x: 5, y: 9 })).toBe(1)
    expect(dirXToTarget({ x: 5, y: 0 }, { x: 4, y: 9 })).toBe(-1)
  })
  it('melee ideal loc is 15 px on the near side of the target, same y', () => {
    expect(idealAttackLoc({ x: 0, y: 0 }, { x: 100, y: 50 }, sword)).toEqual({ x: 85, y: 50 })
    expect(idealAttackLoc({ x: 200, y: 0 }, { x: 100, y: 50 }, sword)).toEqual({ x: 115, y: 50 })
  })
  it('ranged ideal loc is the target itself', () => {
    expect(idealAttackLoc({ x: 0, y: 0 }, { x: 100, y: 50 }, bow)).toEqual({ x: 100, y: 50 })
  })
  it('weaponless (#none) ideal loc is offset like melee', () => {
    expect(idealAttackLoc({ x: 0, y: 0 }, { x: 100, y: 50 }, { ...sword, type: 'none' })).toEqual({ x: 85, y: 50 })
  })
})

describe('targetInReach', () => {
  it('melee: strike point inside the target rect on either side', () => {
    const me: AiView = { pos: { x: 100, y: 100 }, attack: sword, cooldownReady: true }
    expect(strikePoint(me.pos, sword, 1)).toEqual({ x: 115, y: 100 })
    // target rect left edge at 115 -> strike point 115 is inside (inclusive left)
    expect(targetInReach(me, target(131, 100))).toBe(true)
    // 1 px further: strike point 115 < left 116 -> outside
    expect(targetInReach(me, target(132, 100))).toBe(false)
    // target on the left side, mirrored strike point 85
    expect(targetInReach(me, target(70, 100))).toBe(true)
    expect(targetInReach(me, target(68, 100))).toBe(false)
  })
  it('archer: in reach strictly under 100 px', () => {
    const me: AiView = { pos: { x: 0, y: 0 }, attack: bow, cooldownReady: true }
    expect(targetInReach(me, target(99, 0))).toBe(true)
    expect(targetInReach(me, target(100, 0))).toBe(false)
    expect(targetInReach(me, target(60, 80))).toBe(false) // exactly 100
  })
  it('point reach inflates the target rect', () => {
    const me: AiView = { pos: { x: 0, y: 0 }, attack: { ...bow, reach: { x: 7, y: 10 } }, cooldownReady: true }
    expect(targetInReach(me, target(22, 0))).toBe(true) // rect left 6 - 7 = -1
    expect(targetInReach(me, target(24, 0))).toBe(false)
    expect(targetInReach(me, target(0, 25))).toBe(true) // top 9 - 10 = -1
    expect(targetInReach(me, target(0, 27))).toBe(false)
  })
})

describe('decide', () => {
  const me: AiView = { pos: { x: 0, y: 0 }, attack: bow, cooldownReady: true }
  it('is idle while dazed or attacking', () => {
    expect(decide('dazed', me, target(10, 0), 0)).toEqual({ kind: 'idle' })
    expect(decide('attack', me, target(10, 0), 0)).toEqual({ kind: 'idle' })
  })
  it('retargets in findTarget, without a live target, and every 30 ticks', () => {
    expect(decide('findTarget', me, null, 0)).toEqual({ kind: 'retarget' })
    expect(decide('moveToAttack', me, null, 0)).toEqual({ kind: 'retarget' })
    expect(decide('moveToAttack', me, target(10, 0, false), 0)).toEqual({ kind: 'retarget' })
    expect(decide('moveToAttack', me, target(10, 0), RETARGET_TICKS - 1).kind).not.toBe('retarget')
    expect(decide('moveToAttack', me, target(10, 0), RETARGET_TICKS)).toEqual({ kind: 'retarget' })
  })
  it('moves toward the ideal attack loc when out of reach', () => {
    expect(decide('moveToAttack', me, target(300, 0), 0)).toEqual({ kind: 'move', goal: { x: 300, y: 0 } })
    const warrior: AiView = { ...me, attack: sword }
    expect(decide('moveToAttack', warrior, target(300, 0), 0)).toEqual({ kind: 'move', goal: { x: 285, y: 0 } })
  })
  it('stops when in reach but cooling down', () => {
    expect(decide('moveToAttack', { ...me, cooldownReady: false }, target(50, 0), 0)).toEqual({ kind: 'stop' })
  })
  it('starts an attack facing the target when ready', () => {
    expect(decide('moveToAttack', me, target(50, 0), 0)).toEqual({ kind: 'startAttack', faceLeft: false })
    expect(decide('moveToAttack', me, target(-50, 0), 0)).toEqual({ kind: 'startAttack', faceLeft: true })
  })
})
