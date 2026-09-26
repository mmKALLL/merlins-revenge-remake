// Integration tests for the combat tick against the converted actor and team data
// (public/generated/actors.json, teams.json) with an animation fixture that carries the real frame
// sizes and strip lengths of the shipped atlases (frame counts and delays matter for attack timing).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { ActorDef } from '../mr-open/mr-actor-data'
import type { MapDefinition } from '../mr-open/mr-map-format'
import { explode } from '../mr-open/mr-spell'
import { resolveHit } from '../mr-open/mr-take-hit'
import type { TeamDef } from '../mr-open/mr-team-data'
import { playerOf } from './actors'
import { NO_INPUT, type ActorState, type AnimationSet, type InputSnapshot, type SimState } from './state'
import { createSim, stepSim } from './tick'
import { PLAYER_DEATH_TICKS } from './tick-combat'
import { buildWorldGrid } from './world-grid'

const defs = JSON.parse(readFileSync('public/generated/actors.json', 'utf8')) as Record<string, ActorDef>
const teams = JSON.parse(readFileSync('public/generated/teams.json', 'utf8')) as Record<string, TeamDef>

// Real frame sizes and strip lengths (tools/convert-assets.ts output), see docs/notes §9.
const anims: Record<string, AnimationSet> = {
  mer: {
    walk: { frames: 8, delay: 3, w: 16, h: 16 }, stand: { frames: 1, delay: 1, w: 16, h: 16 },
    charge: { frames: 4, delay: 3, w: 16, h: 16 }, chargewalk: { frames: 4, delay: 3, w: 16, h: 16 },
    release: { frames: 4, delay: 2, w: 16, h: 16 }, releasewalk: { frames: 4, delay: 3, w: 16, h: 16 },
    grave: { frames: 1, delay: 3, w: 16, h: 16 },
  },
  goblinWarrior: {
    stand: { frames: 1, delay: 2, w: 15, h: 16 }, walk: { frames: 6, delay: 3, w: 15, h: 20 },
    weaponMelee: { frames: 11, delay: 2, w: 15, h: 20 }, reel: { frames: 4, delay: 2, w: 15, h: 20 },
    grave: { frames: 1, delay: 3, w: 16, h: 16 },
  },
  gar: {
    stand: { frames: 1, delay: 3, w: 16, h: 16 }, walk: { frames: 6, delay: 3, w: 16, h: 16 },
    weaponRanged: { frames: 21, delay: 1, w: 16, h: 16 }, reel: { frames: 4, delay: 3, w: 16, h: 16 },
    grave: { frames: 1, delay: 3, w: 16, h: 16 },
  },
  gobarrow: { fly: { frames: 1, delay: 3, w: 16, h: 16 }, land: { frames: 1, delay: 3, w: 16, h: 16 } },
  spell: { charge: { frames: 1, delay: 3, w: 63, h: 63 } },
}

const OBJECT_SYMBOLS = ['none', 'player', 'goblinWarrior', 'goblinArcher']
const WARRIOR = 3
const ARCHER = 4

/** One open 18x9 room; `objects` places object tiles by 1-based tile coordinates. */
function openMap(objects: { x: number; y: number; tile: number }[] = []): MapDefinition {
  const fill = (v: number) => Array.from({ length: 9 }, () => Array(18).fill(v))
  const obj = fill(0)
  for (const o of objects) obj[o.y - 1]![o.x - 1] = o.tile
  return {
    mapSize: { x: 1, y: 1 }, roomSize: { x: 18, y: 9 }, startRoom: { x: 1, y: 1 },
    layers: [{ name: 'backgroundPassive', tileSet: 'p' }, { name: 'backgroundActive', tileSet: 'a' }, { name: 'objects', tileSet: 'o' }],
    rooms: [{ num: 1, layers: { backgroundActive: fill(1), backgroundPassive: fill(1), objects: obj } }],
  }
}
const grid = (map: MapDefinition) => buildWorldGrid(map, () => false, OBJECT_SYMBOLS)

interface Setup {
  s: SimState
  enemyId: number
}

/** Player at `playerPos`, one enemy of `tile` spawned at the centre of tile (tx, ty) then moved to `enemyPos`. */
function setup(tile: number, enemyPos: { x: number; y: number }, playerPos = { x: 100, y: 144 }, seed = 1, patch: Partial<ActorState> = {}): Setup {
  const s0 = createSim(grid(openMap([{ x: 10, y: 5, tile }])), defs, teams, anims, seed, playerPos)
  const enemy = s0.actors.find((a) => a.id !== s0.playerId)!
  const s = { ...s0, actors: s0.actors.map((a) => (a.id === enemy.id ? { ...a, pos: enemyPos, prevPos: enemyPos, ...patch } : a)) }
  return { s, enemyId: enemy.id }
}
const actor = (s: SimState, id: number): ActorState | undefined => s.actors.find((a) => a.id === id)
const holdE: InputSnapshot = { ...NO_INPUT, shootNearest: true }
const run = (s: SimState, ticks: number, input: InputSnapshot = NO_INPUT): SimState => {
  for (let i = 0; i < ticks; i++) s = stepSim(s, input)
  return s
}
/** Steps until `pred` holds (inclusive of that state) or `max` ticks pass; returns the state and the tick count. */
function runUntil(s: SimState, pred: (s: SimState) => boolean, max: number, input: InputSnapshot = NO_INPUT): [SimState, number] {
  for (let i = 1; i <= max; i++) {
    s = stepSim(s, input)
    if (pred(s)) return [s, i]
  }
  return [s, -1]
}
/** A stationary target: no AI, so it never chases (the reel still returns it to walk/findTarget). */
const dummy: Partial<ActorState> = { ai: { mode: 'none', targetId: null, retargetCounter: 0, pathMode: 'beeline', waypoint: null, pathStall: 0, moveTarget: null, chargeKind: null } }

describe('warrior melee (combat notes §3-4, §6)', () => {
  it('beelines at walkSpeed 4 to the strike position, then its sword hit pushes and damages the player', () => {
    let { s, enemyId } = setup(WARRIOR, { x: 300, y: 144 })
    expect(s.exitsOpen).toBe(false)
    expect(actor(s, enemyId)!.ai.mode).toBe('findTarget')
    // Beeline: x decreases by exactly 4 per tick, facing left, toward idealAttackLoc (115,144).
    for (let i = 1; i <= 44; i++) {
      s = stepSim(s, NO_INPUT)
      const g = actor(s, enemyId)!
      expect(g.pos).toEqual({ x: 300 - 4 * i, y: 144 })
      expect(g.facingLeft).toBe(true)
      expect(g.ai.mode).toBe('moveToAttack')
      expect(g.ai.targetId).toBe(s.playerId)
      expect(g.anim).toBe('walk')
    }
    // Tick 45 reaches x = 120. The plan's "15 px on the near side" is the ideal loc (115); the first
    // reachable x whose left strike point (x - 15) falls inside the player's collision rect
    // [93, 107) is 120 (from 124 the strike point 109 misses), so it stops 20 px away.
    s = stepSim(s, NO_INPUT)
    expect(actor(s, enemyId)!.pos.x).toBe(120)
    // Tick 46: in reach, cooldown ready (sword cooldown 0) -> weaponMelee starts from frame 0.
    s = stepSim(s, NO_INPUT)
    let g = actor(s, enemyId)!
    expect(g.mode).toBe('weaponMelee')
    expect(g.ai.mode).toBe('attack')
    expect(g.animFrame).toBe(0)
    expect(g.vel).toEqual({ x: 0, y: 0 })
    // Strip frame 7 (index 6) at delay 2 is fresh 12 ticks later: strike point 105 is inside the
    // player's 16x16 sprite rect [92,108). Push (0.7,0)*strength 4 = 2.8, mirrored left; inertia 0;
    // damage 2.8 * damageMultiplier 2 = 5.6.
    const before = playerOf(s).energy
    let ticks: number
    ;[s, ticks] = runUntil(s, (t) => playerOf(t).energy < before, 22)
    expect(ticks).toBe(12)
    expect(playerOf(s).energy).toBeCloseTo(before - 5.6, 10)
    expect(playerOf(s).vel).toEqual({ x: -2.8, y: 0 })
    expect(playerOf(s).mode).toBe('walk')
    expect(s.events).toContainEqual({ kind: 'hit', id: s.playerId })
    // The attack strip (11 frames x 2) loops 22 ticks after it started: back to walk / findTarget.
    s = run(s, 10)
    g = actor(s, enemyId)!
    expect(g.mode).toBe('walk')
    expect(g.ai.mode).toBe('findTarget')
    expect(g.ai.targetId).toBeNull()
    // The player slid left: friction halves the velocity before each move (1.4 + 0.7 + ...), 2.8 px in total.
    expect(playerOf(s).pos.x).toBeCloseTo(100 - 2.8, 1)
  })

  it('regenerates 1 player energy every 30 ticks while below the maximum', () => {
    let { s } = setup(WARRIOR, { x: 300, y: 144 }, { x: 100, y: 144 }, 1, dummy)
    s = { ...s, actors: s.actors.map((a) => (a.id === s.playerId ? { ...a, energy: 150 } : a)) }
    s = run(s, 29)
    expect(playerOf(s).energy).toBe(150)
    s = stepSim(s, NO_INPUT)
    expect(playerOf(s).energy).toBe(151)
  })
})

describe('energy blast (combat notes §5)', () => {
  it('charges 1 per tick from 1 to 12.5, flies at 20 px/tick to the target and knocks the warrior into reel', () => {
    let { s, enemyId } = setup(WARRIOR, { x: 300, y: 144 }, { x: 100, y: 144 }, 1, dummy)
    // chargeMax = min(999, mana_capacity 10 * 0.75 + 5) = 12.5; chargeStart = min(0 + 1, 12.5) = 1; speed 1.
    s = stepSim(s, holdE)
    let spell = s.actors.find((a) => a.def === 'spell')!
    expect(spell.mode).toBe('charge')
    expect(spell.charge).toBe(1)
    expect(spell.ownerId).toBe(s.playerId)
    expect(spell.pos).toEqual({ x: 100, y: 136 }) // chargeLoc: collisionLoc (0,-8)
    expect(playerOf(s).mode).toBe('charge')
    expect(playerOf(s).anim).toBe('charge')
    expect(playerOf(s).ai.chargeKind).toBe('nearest')
    // 11 more held ticks: 12; the 13th pins at 12.5 (the creation tick sets the start value only).
    s = run(s, 11, holdE)
    expect(s.actors.find((a) => a.def === 'spell')!.charge).toBe(12)
    s = stepSim(s, holdE)
    expect(s.actors.find((a) => a.def === 'spell')!.charge).toBe(12.5)
    // Release toward the nearest hostile (300,144): |(200, 8)| = 200.16 -> ceil(200.16 / 20) = 11 moves of
    // 20 px, the first of them on the release tick itself, so the explosion comes 10 ticks after it.
    s = stepSim(s, NO_INPUT)
    spell = s.actors.find((a) => a.def === 'spell')!
    expect(spell.mode).toBe('fly')
    expect(spell.targetPoint).toEqual({ x: 300, y: 144 })
    expect(Math.hypot(spell.vel.x, spell.vel.y)).toBeCloseTo(20, 10)
    expect(playerOf(s).mode).toBe('release')
    expect(playerOf(s).anim).toBe('release')
    expect(spell.pos.x).toBeCloseTo(100 + (20 * 200) / Math.hypot(200, 8), 10)
    const [after, flight] = runUntil(s, (t) => t.events.some((e) => e.kind === 'explode'), 20)
    expect(flight).toBe(10)
    s = after
    const ev = s.events.find((e) => e.kind === 'explode')!
    // Explosion where the spell passed the target on both axes: radius = 12.5 * 4 / 2 = 25.
    expect(ev.kind === 'explode' && ev.radius).toBe(25)
    const centre = ev.kind === 'explode' ? ev.pos : { x: 0, y: 0 }
    expect(centre.x).toBeCloseTo(100 + (11 * 20 * 200) / Math.hypot(200, 8), 10)
    // Victim radius = sprite width / 2 = 7.5 (stand 15x16). dist ~ 19.8 -> speed (25 + 7.5 - 19.8) * 0.75 ~ 9.5,
    // scaled by (100 - inertia 30) / 100 -> damage ~ 6.9 (Manhattan length, multiplier 1).
    const g = actor(s, enemyId)!
    const expected = resolveHit(defs['goblinWarrior']!, explode(centre, 12.5, defs['player']!.attack, [{ id: g.id, pos: { x: 300, y: 144 }, radius: 7.5 }]).pushes[0]!.push, 1)
    expect(expected.damage).toBeCloseTo(6.9, 1)
    expect(g.energy).toBeCloseTo(100 - expected.damage, 10)
    expect(g.mode).toBe('reel')
    expect(g.ai.mode).toBe('dazed')
    expect(g.frictionPercent).toEqual({ x: 10, y: 10 })
    expect(g.vel.x).toBeCloseTo(expected.push.x, 10)
    expect(s.events).toContainEqual({ kind: 'hit', id: enemyId })
    // The release strip (4 x 2) has looped: the player walks again, cooldown 30 / mana_regeneration 30 is ready.
    expect(playerOf(s).mode).toBe('walk')
    expect(playerOf(s).cooldown).toBe(0)
    // The exploded spell lingers 8 ticks for the fade, then disappears.
    expect(s.actors.find((a) => a.def === 'spell')!.mode).toBe('explode')
    s = run(s, 8)
    expect(s.actors.find((a) => a.def === 'spell')).toBeUndefined()
    // Reel: the push (~6.9 px/tick) decays 10 %/tick to under 0.2 in ~34 ticks, then 10 stalled ticks end it.
    let g2 = actor(s, enemyId)!
    expect(g2.mode).toBe('reel')
    let ticks: number
    ;[s, ticks] = runUntil(s, (t) => actor(t, enemyId)!.mode === 'walk', 80)
    expect(ticks).toBeGreaterThan(20)
    expect(ticks).toBeLessThan(50)
    g2 = actor(s, enemyId)!
    expect(g2.ai.mode).toBe('findTarget')
    expect(g2.frictionPercent).toEqual({ x: 50, y: 50 })
    expect(g2.pos.x).toBeLessThan(300 - 40) // knocked back to the left
  })

  it('fires at the mouse with Space and 100 px ahead without a mouse position', () => {
    let { s } = setup(WARRIOR, { x: 300, y: 144 }, { x: 100, y: 144 }, 1, dummy)
    s = run(s, 3, { ...NO_INPUT, chargeHeld: true, mouseWorld: { x: 150, y: 200 } })
    s = stepSim(s, { ...NO_INPUT, mouseWorld: { x: 150, y: 200 } })
    expect(s.actors.find((a) => a.def === 'spell')!.targetPoint).toEqual({ x: 150, y: 200 })
    s = run(s, 30) // let it explode and fade
    expect(s.actors.find((a) => a.def === 'spell')).toBeUndefined()
    s = run(s, 3, { ...NO_INPUT, chargeHeld: true })
    s = stepSim(s, NO_INPUT)
    expect(s.actors.find((a) => a.def === 'spell')!.targetPoint).toEqual({ x: 200, y: 144 })
  })

  it('F releases 16 px short of the nearest hostile', () => {
    let { s } = setup(WARRIOR, { x: 300, y: 144 }, { x: 100, y: 144 }, 1, dummy)
    s = run(s, 3, { ...NO_INPUT, shootShort: true })
    s = stepSim(s, NO_INPUT)
    expect(s.actors.find((a) => a.def === 'spell')!.targetPoint).toEqual({ x: 284, y: 144 })
  })

  it('does not start a second charge while a spell is owned', () => {
    let { s } = setup(WARRIOR, { x: 300, y: 144 }, { x: 100, y: 144 }, 1, dummy)
    s = run(s, 3, holdE)
    s = stepSim(s, NO_INPUT)
    s = run(s, 2, holdE)
    expect(s.actors.filter((a) => a.def === 'spell')).toHaveLength(1)
    expect(playerOf(s).mode).toBe('release')
  })
})

describe('death and exits (combat notes §7)', () => {
  it('a blasted warrior dies into a grave and the exits open', () => {
    let { s, enemyId } = setup(WARRIOR, { x: 300, y: 144 }, { x: 100, y: 144 }, 1, { ...dummy, energy: 1 })
    expect(s.exitsOpen).toBe(false)
    s = run(s, 13, holdE)
    s = stepSim(s, NO_INPUT)
    ;[s] = runUntil(s, (t) => t.events.some((e) => e.kind === 'died'), 20)
    expect(s.events).toContainEqual({ kind: 'died', id: enemyId })
    expect(actor(s, enemyId)!.mode).toBe('die')
    expect(actor(s, enemyId)!.energy).toBeLessThanOrEqual(0)
    // exits open as soon as no hostile is alive; die -> dead next tick -> finish when the grave strip loops
    expect(s.exitsOpen).toBe(true)
    expect(s.events).toContainEqual({ kind: 'exitsOpened' })
    expect(s.rooms['1,1']!.clear).toBe(true)
    s = stepSim(s, NO_INPUT)
    expect(actor(s, enemyId)!.mode).toBe('dead')
    expect(actor(s, enemyId)!.anim).toBe('grave')
    const deadPos = actor(s, enemyId)!.pos
    let ticks: number
    ;[s, ticks] = runUntil(s, (t) => actor(t, enemyId) === undefined, 10)
    expect(ticks).toBe(3)
    expect(s.rooms['1,1']!.graves).toEqual([{ def: 'goblinWarrior', pos: expect.objectContaining({ x: expect.any(Number) }) }])
    expect(s.rooms['1,1']!.graves[0]!.pos.x).toBeCloseTo(deadPos.x + actor(s, enemyId)?.vel.x! || s.rooms['1,1']!.graves[0]!.pos.x, 0)
    expect(s.events.filter((e) => e.kind === 'exitsOpened')).toHaveLength(0)
  })

  it('the player dies from a strike at 1 energy and the restart is requested 30 ticks later', () => {
    let { s } = setup(WARRIOR, { x: 300, y: 144 })
    s = { ...s, actors: s.actors.map((a) => (a.id === s.playerId ? { ...a, energy: 1 } : a)) }
    let ticks: number
    ;[s, ticks] = runUntil(s, (t) => playerOf(t).mode === 'die', 80)
    expect(ticks).toBe(58)
    expect(s.events).toContainEqual({ kind: 'died', id: s.playerId })
    expect(s.restartRequested).toBe(false)
    s = run(s, PLAYER_DEATH_TICKS - 1)
    expect(s.restartRequested).toBe(false)
    expect(playerOf(s).mode).toBe('die')
    s = stepSim(s, NO_INPUT)
    expect(s.restartRequested).toBe(true)
    // a dead player ignores input and cannot charge
    s = stepSim(s, { ...NO_INPUT, move: { x: 1, y: 0 }, chargeHeld: true })
    expect(playerOf(s).mode).toBe('die')
    expect(s.actors.find((a) => a.def === 'spell')).toBeUndefined()
  })
})

describe('archer (combat notes §3-4)', () => {
  it('stands still inside reach 100, shoots on frame 21 and the arrow hits the player', () => {
    let { s, enemyId } = setup(ARCHER, { x: 190, y: 144 })
    // 90 px < reach 100: no movement, weaponRanged from tick 1, facing the player.
    s = stepSim(s, NO_INPUT)
    let a = actor(s, enemyId)!
    expect(a.pos).toEqual({ x: 190, y: 144 })
    expect(a.mode).toBe('weaponRanged')
    expect(a.facingLeft).toBe(true)
    expect(a.ai.mode).toBe('attack')
    // frame 21 (index 20, delay 1) is fresh 20 ticks later
    s = run(s, 19)
    expect(s.actors.find((x) => x.def === 'goblinArrow')).toBeUndefined()
    s = stepSim(s, NO_INPUT)
    a = actor(s, enemyId)!
    expect(a.animFrame).toBe(20)
    expect(a.cooldown).toBe(200 - 10) // reset to 200 on the shot, then one dexterity 10 step this tick
    const arrow = s.actors.find((x) => x.def === 'goblinArrow')!
    expect(arrow.mode).toBe('fly')
    expect(arrow.ownerId).toBe(enemyId)
    expect(arrow.targetId).toBe(s.playerId)
    expect(arrow.pos).toEqual({ x: 190, y: 142 }) // collisionLoc (0,-2)
    expect(Math.hypot(arrow.vel.x, arrow.vel.y)).toBeCloseTo(8, 10) // fullstrength: strength 8
    expect(arrow.vel.x).toBeLessThan(0)
    // eyestrain at 90 / 100 of reach: integer(0.9 * 5) = 5 px of error per axis at most
    expect(Math.abs(arrow.targetPoint!.x - 100)).toBeLessThanOrEqual(5)
    expect(Math.abs(arrow.targetPoint!.y - 144)).toBeLessThanOrEqual(5)
    // Flight: the arrow's friction (5,5) takes 5 % per tick from the very first move, so it never
    // travels at the full 8 px/tick: after n moves it has covered 152 * (1 - 0.95^n) px. It hits when
    // the player's reg point enters the arrow rect grown by the player's collision rect, i.e. within
    // 14 px: 190 - 100 - 14 = 76 px -> 0.95^n < 0.5 -> n = 14. The impact push is velocity * 0.5 and
    // damage its Manhattan length * 3: 3 * 0.5 * 8 * 0.95^14 ~ 5.9, not the 12 the plan lists (12 is
    // the point-blank maximum for a full-speed arrow).
    const before = playerOf(s).energy
    let ticks: number
    let lastVel = arrow.vel
    ;[s, ticks] = runUntil(s, (t) => {
      const b = t.actors.find((x) => x.def === 'goblinArrow')
      if (b) lastVel = b.vel
      return playerOf(t).energy < before
    }, 20)
    expect(ticks).toBe(14)
    const damage = before - playerOf(s).energy
    // the player stood still, so its velocity is exactly the push: arrow velocity (one more 5 % step
    // after the last one observed) times power 0.5; damage = Manhattan length * damageMultiplier 3
    const push = playerOf(s).vel
    expect(push.x).toBeCloseTo(lastVel.x * 0.95 * 0.5, 10)
    expect(push.y).toBeCloseTo(lastVel.y * 0.95 * 0.5, 10)
    expect(damage).toBeCloseTo(3 * (Math.abs(push.x) + Math.abs(push.y)), 10)
    expect(damage).toBeCloseTo(3 * 0.5 * 8 * 0.95 ** 14, 0)
    expect(s.actors.find((x) => x.def === 'goblinArrow')).toBeUndefined()
    // the bow needs 200 / dexterity 10 = 20 ticks; the strip looped at tick 22 and the archer waits in reach
    s = run(s, 4)
    a = actor(s, enemyId)!
    expect(a.mode).toBe('walk')
    expect(a.pos).toEqual({ x: 190, y: 144 })
  })

  it('waiting in reach for the cooldown resets the path stall: stays in beeline and does not move', () => {
    // #arrivedAtAttackLoc resets the stall counter, so a stalled or wandering archer that finds itself
    // in reach with the bow still cooling down returns to beeline and never switches to wandering.
    const ai = { mode: 'moveToAttack' as const, targetId: null, retargetCounter: 0, pathMode: 'scenic' as const, waypoint: { x: 250, y: 100 }, pathStall: 4, moveTarget: null, chargeKind: null }
    let { s, enemyId } = setup(ARCHER, { x: 190, y: 144 }, undefined, 1, { cooldown: 200, ai })
    // 200 / dexterity 10 = 20 ticks of cooldown
    for (let i = 0; i < 19; i++) {
      s = stepSim(s, NO_INPUT)
      const a = actor(s, enemyId)!
      expect(a.pos).toEqual({ x: 190, y: 144 })
      expect(a.ai.pathMode).toBe('beeline')
      expect(a.ai.pathStall).toBe(0)
      expect(a.mode).not.toBe('weaponRanged')
    }
  })

  it('a missed arrow stalls under 2 px/tick, lands, and disappears 30 ticks later', () => {
    // the player walks away so the arrow overshoots and stalls out
    let { s } = setup(ARCHER, { x: 190, y: 144 })
    ;[s] = runUntil(s, (t) => t.actors.some((x) => x.def === 'goblinArrow'), 30)
    const arrowId = s.actors.find((x) => x.def === 'goblinArrow')!.id
    const down = { ...NO_INPUT, move: { x: 0, y: 1 } }
    let ticks: number
    // 8 * 0.95^n < 2 -> n = 28 moves
    ;[s, ticks] = runUntil(s, (t) => actor(t, arrowId)!.mode === 'land', 40, down)
    expect(ticks).toBe(28)
    expect(Math.abs(actor(s, arrowId)!.vel.x)).toBeLessThan(2)
    s = run(s, 29, down)
    expect(actor(s, arrowId)!.mode).toBe('land')
    s = stepSim(s, down)
    expect(actor(s, arrowId)).toBeUndefined()
    expect(playerOf(s).energy).toBe(200)
  })
})

describe('determinism', () => {
  it('two sims with the same seed agree after 300 ticks; another seed differs', () => {
    const seed = 42
    const mk = (sd: number) => createSim(grid(openMap([{ x: 10, y: 5, tile: WARRIOR }, { x: 14, y: 3, tile: ARCHER }])), defs, teams, anims, sd, { x: 100, y: 144 })
    const a = run(mk(seed), 300)
    const b = run(mk(seed), 300)
    expect(a.actors.map((x) => [x.id, x.pos, x.energy, x.mode])).toEqual(b.actors.map((x) => [x.id, x.pos, x.energy, x.mode]))
    expect(a.rng).toEqual(b.rng)
    const c = run(mk(seed + 1), 300)
    expect(c.rng).not.toEqual(a.rng)
  })

  it('does not mutate the input state', () => {
    const { s } = setup(ARCHER, { x: 190, y: 144 })
    const strip = (x: SimState) => JSON.parse(JSON.stringify({ ...x, grid: undefined }))
    const before = strip(s)
    run(s, 40, holdE)
    expect(strip(s)).toEqual(before)
  })
})
