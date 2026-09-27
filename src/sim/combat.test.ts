// Integration tests for the combat tick against the converted actor and team data
// (public/generated/actors.json, teams.json) with an animation fixture that carries the real frame
// sizes and strip lengths of the shipped atlases (frame counts and delays matter for attack timing).
import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { resolveActors, type ActorDef } from '../mr-open/mr-actor-data'
import type { MapDefinition } from '../mr-open/mr-map-format'
import { stepVelocity } from '../mr-open/mr-movement'
import { explode } from '../mr-open/mr-spell'
import { chargeVolume } from '../mr-open/mr-sound'
import { resolveHit } from '../mr-open/mr-take-hit'
import type { TeamDef } from '../mr-open/mr-team-data'
import { createActor, playerOf } from './actors'
import { NO_INPUT, type ActorState, type AnimationSet, type InputSnapshot, type SimState } from './state'
import { createSim, stepSim } from './tick'
import { PLAYER_DEATH_TICKS } from './tick-combat'
import { buildWorldGrid } from './world-grid'

// Original engine values (not assets/tuning.json balance tweaks), resolved from the copied actor files.
// The remake's random spreading detour is off here (engine AI); its own test turns it on.
const actorFiles = Object.fromEntries(readdirSync('assets/actors').map((f) => [f.replace(/\.txt$/, ''), readFileSync(`assets/actors/${f}`, 'utf8')]))
const defs: Record<string, ActorDef> = resolveActors(actorFiles, {
  player: { weapon: 'energyBlast' }, goblinWarrior: { detourChance: 0 }, goblinArcher: { detourChance: 0 },
})
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

const SOLID = 2

/**
 * Open 18x9 rooms side by side (`rooms` of them, default 1); `objects` places object tiles in room 1
 * and `solid` fills room-1 tiles of the active layer with SOLID, both by 1-based tile coordinates.
 */
function openMap(objects: { x: number; y: number; tile: number }[] = [], opts: { rooms?: number; solid?: { x: number; y: number }[] } = {}): MapDefinition {
  const n = opts.rooms ?? 1
  const fill = (v: number) => Array.from({ length: 9 }, () => Array(18).fill(v))
  const obj = fill(0)
  for (const o of objects) obj[o.y - 1]![o.x - 1] = o.tile
  const active = fill(1)
  for (const t of opts.solid ?? []) active[t.y - 1]![t.x - 1] = SOLID
  return {
    mapSize: { x: n, y: 1 }, roomSize: { x: 18, y: 9 }, startRoom: { x: 1, y: 1 },
    layers: [{ name: 'backgroundPassive', tileSet: 'p' }, { name: 'backgroundActive', tileSet: 'a' }, { name: 'objects', tileSet: 'o' }],
    rooms: Array.from({ length: n }, (_, i) => ({
      num: i + 1,
      layers: { backgroundActive: i === 0 ? active : fill(1), backgroundPassive: fill(1), objects: i === 0 ? obj : fill(0) },
    })),
  }
}
const grid = (map: MapDefinition) => buildWorldGrid(map, (i) => i === SOLID, OBJECT_SYMBOLS)
/** A full-height solid column of room 1 (1-based tile x). */
const wallAt = (tx: number) => Array.from({ length: 9 }, (_, i) => ({ x: tx, y: i + 1 }))

interface Setup {
  s: SimState
  enemyId: number
}

/** Player at `playerPos`, one enemy of `tile` spawned at the centre of tile (tx, ty) then moved to `enemyPos`. */
function setup(tile: number, enemyPos: { x: number; y: number }, playerPos = { x: 100, y: 144 }, seed = 1, patch: Partial<ActorState> = {}, map?: MapDefinition): Setup {
  const s0 = createSim(grid(map ?? openMap([{ x: 10, y: 5, tile }])), defs, teams, anims, seed, playerPos)
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
const dummy: Partial<ActorState> = { ai: { mode: 'none', targetId: null, retargetCounter: 0, pathMode: 'beeline', waypoint: null, pathStall: 0, scenicTicks: 0, moveTarget: null, walkTicks: 0, detourTicks: 0, detourGoal: null, idleTicks: 0, wanderGoal: null, chargeKind: null } }

describe('warrior melee (combat notes §3-4, §6)', () => {
  it('beelines at walkSpeed 4 less 50 % friction (2 px/tick) to the strike position, then its sword hit pushes and damages the player', () => {
    let { s, enemyId } = setup(WARRIOR, { x: 300, y: 144 })
    expect(s.exitsOpen).toBe(false)
    expect(actor(s, enemyId)!.ai.mode).toBe('findTarget')
    // Beeline toward idealAttackLoc (115,144), facing left: modMoveToLoc sets a 4 px vector and
    // objMoveXY.update takes the 50 % walking friction off it before moving, so x drops 2 per tick.
    for (let i = 1; i <= 89; i++) {
      s = stepSim(s, NO_INPUT)
      const g = actor(s, enemyId)!
      expect(g.pos).toEqual({ x: 300 - 2 * i, y: 144 })
      expect(g.facingLeft).toBe(true)
      expect(g.ai.mode).toBe('moveToAttack')
      expect(g.ai.targetId).toBe(s.playerId)
      expect(g.anim).toBe('walk')
    }
    // Tick 90 reaches x = 120. The plan's "15 px on the near side" is the ideal loc (115); the first
    // reachable x whose left strike point (x - 15) falls inside the player's collision rect
    // [93, 107) is 120 (from 122 the strike point 107 misses), so it stops 20 px away.
    s = stepSim(s, NO_INPUT)
    expect(actor(s, enemyId)!.pos.x).toBe(120)
    // Tick 91: in reach, cooldown ready (sword cooldown 0) -> weaponMelee starts from frame 0.
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
    expect(playerOf(s).knockback).toEqual({ x: -2.8, y: 0 })
    expect(playerOf(s).mode).toBe('walk')
    expect(s.events).toContainEqual({ kind: 'hit', id: s.playerId })
    // The attack strip (11 frames x 2) loops on its 22nd tick, i.e. 21 ticks after the start tick:
    // back to walk / findTarget.
    s = run(s, 9)
    g = actor(s, enemyId)!
    expect(g.mode).toBe('walk')
    expect(g.ai.mode).toBe('findTarget')
    expect(g.ai.targetId).toBeNull()
    // The push decays by frictionReel (10 %/tick) in the player's knockback, so it slides much
    // farther than walking friction would (2.8 px in total), while walking friction stays 50 %.
    expect(playerOf(s).frictionPercent).toEqual({ x: 50, y: 50 })
    expect(playerOf(s).pos.x).toBeLessThan(100 - 10)
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
    expect(spell.pos).toEqual({ x: 100, y: 135.5 }) // chargeLoc: collisionLoc (0,-8), then up by size 1 / 2
    expect(playerOf(s).mode).toBe('charge')
    expect(playerOf(s).anim).toBe('charge')
    expect(playerOf(s).ai.chargeKind).toBe('nearest')
    // 11 more held ticks: 12; the 13th pins at 12.5 (the creation tick sets the start value only).
    s = run(s, 11, holdE)
    expect(s.actors.find((a) => a.def === 'spell')!.charge).toBe(12)
    s = stepSim(s, holdE)
    expect(s.actors.find((a) => a.def === 'spell')!.charge).toBe(12.5)
    // Release from (100, 136 - 12.5 / 2) toward the nearest hostile (300,144): |(200, 14.25)| = 200.5 ->
    // ceil(200.5 / 20) = 11 moves of 20 px, the first of them on the release tick itself, so the
    // explosion comes 10 ticks after it.
    const dy = 144 - (136 - 12.5 / 2)
    s = stepSim(s, NO_INPUT)
    spell = s.actors.find((a) => a.def === 'spell')!
    expect(spell.mode).toBe('fly')
    expect(spell.targetPoint).toEqual({ x: 300, y: 144 })
    expect(Math.hypot(spell.vel.x, spell.vel.y)).toBeCloseTo(20, 10)
    expect(playerOf(s).mode).toBe('release')
    expect(playerOf(s).anim).toBe('release')
    expect(spell.pos.x).toBeCloseTo(100 + (20 * 200) / Math.hypot(200, dy), 10)
    const [after, flight] = runUntil(s, (t) => t.events.some((e) => e.kind === 'explode'), 20)
    expect(flight).toBe(10)
    s = after
    const ev = s.events.find((e) => e.kind === 'explode')!
    // Explosion on the target point (the spell is placed there on arrival): radius = 12.5 * 4 / 2 = 25.
    expect(ev.kind === 'explode' && ev.radius).toBe(25)
    const centre = ev.kind === 'explode' ? ev.pos : { x: 0, y: 0 }
    expect(centre).toEqual({ x: 300, y: 144 })
    // Victim radius = sprite width / 2 = 7.5 (stand 15x16). A direct hit: speed (25 + 7.5) * 0.75 = 24.375
    // straight down, scaled by (100 - inertia 30) / 100 -> push ~ 17.06, damage ~ 17.06 (multiplier 1).
    const g = actor(s, enemyId)!
    const expected = resolveHit(defs['goblinWarrior']!, explode(centre, 12.5, defs['player']!.attack, [{ id: g.id, pos: { x: 300, y: 144 }, radius: 7.5 }]).pushes[0]!.push, 1)
    expect(expected.damage).toBeCloseTo(17.06, 1)
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
    // Reel: the push (~17 px/tick) decays 10 %/tick until the warrior stalls (sooner if a wall stops it),
    // then 10 stalled ticks end it.
    let g2 = actor(s, enemyId)!
    expect(g2.mode).toBe('reel')
    let ticks: number
    ;[s, ticks] = runUntil(s, (t) => actor(t, enemyId)!.mode === 'walk', 80)
    expect(ticks).toBeGreaterThan(10)
    expect(ticks).toBeLessThan(60)
    g2 = actor(s, enemyId)!
    expect(g2.ai.mode).toBe('findTarget')
    expect(g2.frictionPercent).toEqual({ x: 50, y: 50 })
    expect(g2.pos.y).toBeGreaterThan(144 + 40) // a direct hit knocks straight down
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

  it('the push-back shot lands on the line to the nearest hostile, short of it', () => {
    let { s } = setup(WARRIOR, { x: 300, y: 144 }, { x: 100, y: 144 }, 1, dummy)
    s = run(s, 3, { ...NO_INPUT, shootShort: true })
    s = stepSim(s, NO_INPUT)
    const target = s.actors.find((a) => a.def === 'spell')!.targetPoint!
    expect(target.y).toBe(144)
    expect(target.x).toBeGreaterThan(100)
    expect(target.x).toBeLessThan(300)
  })

  it('starts a new charge while the released spell still flies (releaseSpell clears pCurrentSpell)', () => {
    let { s } = setup(WARRIOR, { x: 300, y: 144 }, { x: 100, y: 144 }, 1, dummy)
    s = run(s, 3, holdE)
    s = stepSim(s, NO_INPUT)
    s = run(s, 2, holdE)
    const spells = s.actors.filter((a) => a.def === 'spell')
    expect(spells.map((a) => a.mode)).toEqual(['fly', 'charge'])
    expect(spells[1]!.charge).toBe(2)
    expect(playerOf(s).mode).toBe('charge')
  })
})

describe('player hit while charging (objPlayerMerlinCharacter.takeHit, objAiAttack)', () => {
  const holdSpace: InputSnapshot = { ...NO_INPUT, chargeHeld: true, mouseWorld: { x: 100, y: 250 } }
  /** Charges from tick 50 until the warrior's sword lands (tick 58); returns the hit state. */
  function hitWhileCharging(): { s: SimState; spellId: number; charge: number } {
    let { s } = setup(WARRIOR, { x: 300, y: 144 })
    s = run(s, 95)
    const before = playerOf(s).energy
    let ticks: number
    ;[s, ticks] = runUntil(s, (t) => playerOf(t).energy < before, 20, holdSpace)
    expect(ticks).toBe(8)
    const spell = s.actors.find((a) => a.def === 'spell')!
    return { s, spellId: spell.id, charge: spell.charge }
  }

  it('forces walk; the AI keeps the charging spell and holding resumes the same charge', () => {
    let { s, spellId, charge } = hitWhileCharging()
    expect(playerOf(s).mode).toBe('walk')
    expect(charge).toBe(8)
    const spell = actor(s, spellId)!
    expect(spell.mode).toBe('charge')
    // still held: attack() -> chargeMagic re-enters #charge and keeps counting on the same spell
    s = stepSim(s, holdSpace)
    expect(playerOf(s).mode).toBe('charge')
    expect(s.actors.filter((a) => a.def === 'spell')).toHaveLength(1)
    expect(actor(s, spellId)!.charge).toBe(9)
    // letting go releases it (releaseMagic), then a fresh charge starts once the cooldown allows
    s = stepSim(s, { ...holdSpace, chargeHeld: false })
    expect(actor(s, spellId)!.mode).toBe('fly')
    expect(playerOf(s).mode).toBe('release')
    s = stepSim(s, holdSpace)
    const fresh = s.actors.find((a) => a.def === 'spell' && a.id !== spellId)!
    expect(fresh.mode).toBe('charge')
    expect(fresh.charge).toBe(1)
    expect(playerOf(s).mode).toBe('charge')
  })

  it('letting go during the forced walk releases the held spell', () => {
    let { s, spellId } = hitWhileCharging()
    s = stepSim(s, { ...holdSpace, chargeHeld: false })
    const spell = actor(s, spellId)!
    expect(spell.mode).toBe('fly')
    expect(spell.targetPoint).toEqual({ x: 100, y: 250 })
    expect(playerOf(s).mode).toBe('release')
  })
})

describe('death and exits (combat notes §7)', () => {
  /** Position after `n` friction-only moves (open room, no collisions) from `pos` with `vel`. */
  function slide(pos: { x: number; y: number }, vel: { x: number; y: number }, friction: { x: number; y: number }, n: number) {
    let p = pos
    let v = vel
    for (let i = 0; i < n; i++) {
      v = stepVelocity(v, { x: 0, y: 0 }, 0, friction)
      p = { x: p.x + v.x, y: p.y + v.y }
    }
    return p
  }

  it('a blasted warrior dies into a grave; the exits open on the tick after the grave is recorded', () => {
    let { s, enemyId } = setup(WARRIOR, { x: 300, y: 144 }, { x: 100, y: 144 }, 1, { ...dummy, energy: 1 })
    expect(s.exitsOpen).toBe(false)
    s = run(s, 13, holdE)
    s = stepSim(s, NO_INPUT)
    ;[s] = runUntil(s, (t) => t.events.some((e) => e.kind === 'died'), 20)
    expect(s.events).toContainEqual({ kind: 'died', id: enemyId })
    const dying = actor(s, enemyId)!
    expect(dying.mode).toBe('die')
    expect(dying.energy).toBeLessThanOrEqual(0)
    // the dying goblin is still a team member (it leaves the team only in finish): exits stay shut
    expect(s.exitsOpen).toBe(false)
    s = stepSim(s, NO_INPUT)
    expect(actor(s, enemyId)!.mode).toBe('dead')
    expect(actor(s, enemyId)!.anim).toBe('grave')
    expect(s.exitsOpen).toBe(false)
    // the one-frame grave strip (delay 3) loops on its third tick: #finish records the grave where
    // the reel slide (friction 10 %) has carried the body, one move per tick since the hit
    let ticks: number
    ;[s, ticks] = runUntil(s, (t) => actor(t, enemyId) === undefined, 10)
    expect(ticks).toBe(2)
    expect(s.rooms['1,1']!.graves).toEqual([{ def: 'goblinWarrior', pos: slide(dying.pos, dying.vel, dying.frictionPercent, 1 + ticks) }])
    expect(s.exitsOpen).toBe(false)
    expect(s.rooms['1,1']!.clear).toBe(false)
    // teamMaster.tellTeamDied runs on the next update -> attemptOpenExits
    s = stepSim(s, NO_INPUT)
    expect(s.exitsOpen).toBe(true)
    expect(s.events).toContainEqual({ kind: 'exitsOpened' })
    expect(s.rooms['1,1']!.clear).toBe(true)
    expect(s.rooms['1,1']!.graves).toHaveLength(1)
  })

  it('the player dies from a strike at 1 energy and the restart is requested 30 ticks later', () => {
    let { s } = setup(WARRIOR, { x: 300, y: 144 })
    s = { ...s, actors: s.actors.map((a) => (a.id === s.playerId ? { ...a, energy: 1 } : a)) }
    let ticks: number
    ;[s, ticks] = runUntil(s, (t) => playerOf(t).mode === 'die', 150)
    expect(ticks).toBe(103)
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

describe('spreading detour (remake, user request)', () => {
  it('after a melee attack: pauses, walks detourDistance in a random direction, then retargets', () => {
    const forced = { ...defs, goblinWarrior: { ...defs['goblinWarrior']!, detourChance: 1 } }
    const s0 = createSim(grid(openMap([{ x: 10, y: 5, tile: WARRIOR }])), forced, teams, anims, 1, { x: 100, y: 144 })
    const g0 = s0.actors.find((a) => a.id !== s0.playerId)!
    let s: SimState = { ...s0, actors: s0.actors.map((a) => (a.id === g0.id ? { ...a, pos: { x: 120, y: 144 }, prevPos: { x: 120, y: 144 } } : a)) }
    const def = forced['goblinWarrior']!
    // the sword strip loops, the roll succeeds: stop and pause
    let ticks: number
    ;[s, ticks] = runUntil(s, (t) => actor(t, g0.id)!.ai.mode === 'detourPause', 40)
    expect(ticks).toBeGreaterThan(0)
    const at = actor(s, g0.id)!.pos
    expect(actor(s, g0.id)!.ai.targetId).toBeNull()
    for (let i = 1; i < def.detourPauseTicks; i++) {
      s = stepSim(s, NO_INPUT)
      expect(actor(s, g0.id)!.ai.mode).toBe('detourPause')
      expect(actor(s, g0.id)!.pos).toEqual(at)
    }
    s = stepSim(s, NO_INPUT)
    const g = actor(s, g0.id)!
    expect(g.ai.mode).toBe('detourMove')
    const goal = g.ai.detourGoal!
    expect(Math.hypot(goal.x - at.x, goal.y - at.y)).toBeCloseTo(def.detourDistance, 10)
    // walks toward the goal until within the arrival distance (or stalled), then retargets at once
    let dist = Infinity
    ;[s, ticks] = runUntil(s, (t) => {
      const w = actor(t, g0.id)!
      if (w.ai.mode !== 'detourMove') return true
      const d = Math.hypot(goal.x - w.pos.x, goal.y - w.pos.y)
      expect(d).toBeLessThan(dist)
      dist = d
      return false
    }, 80)
    expect(ticks).toBeGreaterThan(10) // ~2 px/tick over most of 50 px
    expect(actor(s, g0.id)!.ai.mode).toBe('moveToAttack')
    expect(actor(s, g0.id)!.ai.targetId).toBe(s.playerId)
  })
})

describe('detour cutoff (remake, user request)', () => {
  it('a detourMove that has not arrived ends after detourMoveMaxTicks and retargets', () => {
    const max = 5
    const forced = { ...defs, goblinWarrior: { ...defs['goblinWarrior']!, detourChance: 1, detourDistance: 200, detourMoveMaxTicks: max } }
    const s0 = createSim(grid(openMap([{ x: 10, y: 5, tile: WARRIOR }])), forced, teams, anims, 1, { x: 100, y: 144 })
    const g0 = s0.actors.find((a) => a.id !== s0.playerId)!
    let s: SimState = { ...s0, actors: s0.actors.map((a) => (a.id === g0.id ? { ...a, pos: { x: 120, y: 144 }, prevPos: { x: 120, y: 144 } } : a)) }
    ;[s] = runUntil(s, (t) => actor(t, g0.id)!.ai.mode === 'detourMove', 80)
    expect(actor(s, g0.id)!.ai.mode).toBe('detourMove')
    let ticks: number
    ;[s, ticks] = runUntil(s, (t) => actor(t, g0.id)!.ai.mode !== 'detourMove', 80)
    expect(ticks).toBe(max)
    expect(actor(s, g0.id)!.ai.targetId).toBe(s.playerId)
  })
})

describe('detour interrupted by a hit (regression: goblins froze and became unhittable)', () => {
  it('a goblin blasted during its detour pause reels, recovers, moves again and can be hit again', () => {
    const forced = { ...defs, goblinWarrior: { ...defs['goblinWarrior']!, detourChance: 1 } }
    const s0 = createSim(grid(openMap([{ x: 10, y: 5, tile: WARRIOR }])), forced, teams, anims, 1, { x: 100, y: 144 })
    const g0 = s0.actors.find((a) => a.id !== s0.playerId)!
    let s: SimState = { ...s0, actors: s0.actors.map((a) => (a.id === g0.id ? { ...a, pos: { x: 120, y: 144 }, prevPos: { x: 120, y: 144 } } : a)) }
    ;[s] = runUntil(s, (t) => actor(t, g0.id)!.ai.mode === 'detourPause', 40)
    const blastAt = (st: SimState): SimState => {
      const aim = actor(st, g0.id)!.pos
      st = run(st, 4, { ...NO_INPUT, chargeHeld: true, mouseWorld: aim })
      return run(st, 1, { ...NO_INPUT, mouseWorld: aim })
    }
    const e0 = actor(s, g0.id)!.energy
    s = blastAt(s)
    ;[s] = runUntil(s, (t) => actor(t, g0.id)!.energy < e0, 20)
    expect(actor(s, g0.id)!.mode).toBe('reel')
    // recovers from the reel and resumes the AI instead of freezing
    ;[s] = runUntil(s, (t) => actor(t, g0.id)!.mode !== 'reel', 120)
    s = run(s, 30)
    const g = actor(s, g0.id)!
    expect(g.ai.mode).not.toBe('dazed')
    // still hittable
    const e1 = g.energy
    s = blastAt(s)
    ;[s] = runUntil(s, (t) => (actor(t, g0.id)?.energy ?? -1) < e1, 20)
    expect(actor(s, g0.id)?.energy ?? -1).toBeLessThan(e1)
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
    // frame 21 (index 20, delay 1) would be fresh 20 ticks later; weaponTechnique -75 stretches frames
    let shotTicks: number
    ;[s, shotTicks] = runUntil(s, (t) => t.actors.some((x) => x.def === 'goblinArrow'), 40)
    expect(shotTicks).toBeGreaterThan(20)
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
    // damage its Manhattan length * 3, applied twice (objBullet.updateFly calls takeHit and then the
    // #takeHit payload): 2 * 3 * 0.5 * 8 * 0.95^14 ~ 11.7.
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
    // the player stood still, so its knockback is exactly the two pushes: arrow velocity (one more 5 %
    // step after the last one observed) times power 0.5, twice; damage = Manhattan length * damageMultiplier 3
    const push = playerOf(s).knockback
    expect(push.x).toBeCloseTo(2 * lastVel.x * 0.95 * 0.5, 10)
    expect(push.y).toBeCloseTo(2 * lastVel.y * 0.95 * 0.5, 10)
    expect(damage).toBeCloseTo(3 * (Math.abs(push.x) + Math.abs(push.y)), 10)
    expect(s.actors.find((x) => x.def === 'goblinArrow')).toBeUndefined()
    // the strip loops at the end of frame 21: back to walking (the knocked-back player may now be out of reach)
    s = run(s, 4)
    a = actor(s, enemyId)!
    expect(a.mode).toBe('walk')
  })

  it('waiting in reach resets only the path stall; a scenic detour resumes toward its waypoint once out of reach', () => {
    // #arrivedAtAttackLoc resets the stall counter and stops the walk but leaves the path mode and
    // waypoint alone (modPathFinding.internalEvent), so a wandering archer keeps its detour.
    const ai = { mode: 'moveToAttack' as const, targetId: null, retargetCounter: 0, pathMode: 'scenic' as const, waypoint: { x: 250, y: 100 }, pathStall: 4, scenicTicks: 0, moveTarget: null, walkTicks: 0, detourTicks: 0, detourGoal: null, idleTicks: 0, wanderGoal: null, chargeKind: null }
    let { s, enemyId } = setup(ARCHER, { x: 190, y: 144 }, undefined, 1, { cooldown: 200, ai })
    for (let i = 0; i < 10; i++) {
      s = stepSim(s, NO_INPUT)
      const a = actor(s, enemyId)!
      expect(a.pos).toEqual({ x: 190, y: 144 })
      expect(a.ai.pathMode).toBe('scenic')
      expect(a.ai.waypoint).toEqual({ x: 250, y: 100 })
      expect(a.ai.pathStall).toBe(0)
      expect(a.mode).not.toBe('weaponRanged')
    }
    // the player steps out of reach: the archer heads for the old waypoint, not for the player
    s = { ...s, actors: s.actors.map((x) => (x.id === s.playerId ? { ...x, pos: { x: 20, y: 144 }, prevPos: { x: 20, y: 144 } } : x)) }
    s = stepSim(s, NO_INPUT)
    const a = actor(s, enemyId)!
    expect(a.ai.pathMode).toBe('scenic')
    expect(a.vel.x).toBeGreaterThan(0)
    expect(a.vel.y).toBeLessThan(0)
  })

  it('a missed arrow stalls under 2 px/tick, lands, and disappears 30 ticks later', () => {
    // the player walks away so the arrow overshoots and stalls out
    let { s } = setup(ARCHER, { x: 190, y: 144 })
    ;[s] = runUntil(s, (t) => t.actors.some((x) => x.def === 'goblinArrow'), 40)
    const arrowId = s.actors.find((x) => x.def === 'goblinArrow')!.id
    const down = { ...NO_INPUT, move: { x: 0, y: 1 } }
    let ticks: number
    // 8 * 0.95^n < 2 -> n = 28 moves
    ;[s, ticks] = runUntil(s, (t) => actor(t, arrowId)!.mode === 'land', 40, down)
    expect(ticks).toBe(28)
    // objBullet.goMode(#land) zeroes the vector: the landed arrow stays put
    expect(actor(s, arrowId)!.vel).toEqual({ x: 0, y: 0 })
    const landedAt = actor(s, arrowId)!.pos
    s = run(s, 29, down)
    expect(actor(s, arrowId)!.mode).toBe('land')
    expect(actor(s, arrowId)!.pos).toEqual(landedAt)
    s = stepSim(s, down)
    expect(actor(s, arrowId)).toBeUndefined()
    expect(playerOf(s).energy).toBe(200)
  })
})

describe('spell details (objSpell)', () => {
  const player = defs['player']!
  const size = (charge: number) => charge * player.attack.chargeSize

  it('sits on top of Merlin while charging: centre = chargeLoc - (0, size / 2), so it grows upward', () => {
    let { s } = setup(WARRIOR, { x: 300, y: 144 }, { x: 100, y: 144 }, 1, dummy)
    s = stepSim(s, holdE)
    let spell = s.actors.find((a) => a.def === 'spell')!
    expect(spell.charge).toBe(1)
    expect(spell.pos).toEqual({ x: 100, y: 144 - 8 - size(1) / 2 })
    s = run(s, 5, holdE)
    spell = s.actors.find((a) => a.def === 'spell')!
    expect(spell.charge).toBe(6)
    expect(spell.pos).toEqual({ x: 100, y: 144 - 8 - size(6) / 2 })
  })

  it('carries its caster\'s team and attack from the charge start (setSpellProperties)', () => {
    let { s, enemyId } = setup(WARRIOR, { x: 300, y: 144 }, { x: 100, y: 144 }, 1, dummy)
    s = run(s, 13, holdE)
    const spell = s.actors.find((a) => a.def === 'spell')!
    expect(spell.team).toBe('aldevar')
    expect(spell.attack).toEqual(player.attack)
    s = stepSim(s, NO_INPUT)
    // the explosion no longer consults the owner: detach it and the warrior is still hit
    s = { ...s, actors: s.actors.map((a) => (a.def === 'spell' ? { ...a, ownerId: 999 } : a)) }
    ;[s] = runUntil(s, (t) => t.events.some((e) => e.kind === 'explode'), 20)
    expect(s.events).toContainEqual({ kind: 'hit', id: enemyId })
    expect(actor(s, enemyId)!.mode).toBe('reel')
  })

  it('explodes in place: position and previous position stay put for the whole fade', () => {
    let { s } = setup(WARRIOR, { x: 300, y: 144 }, { x: 100, y: 144 }, 1, dummy)
    s = run(s, 13, holdE)
    s = stepSim(s, NO_INPUT)
    ;[s] = runUntil(s, (t) => t.events.some((e) => e.kind === 'explode'), 20)
    const at = s.actors.find((a) => a.def === 'spell')!
    expect(at.mode).toBe('explode')
    expect(at.vel).toEqual({ x: 0, y: 0 })
    expect(at.prevPos).toEqual(at.pos) // no interpolated slide on the first explosion frame
    for (let i = 0; i < 7; i++) {
      s = stepSim(s, NO_INPUT)
      const e = s.actors.find((a) => a.def === 'spell')!
      expect(e.pos).toEqual(at.pos)
      expect(e.prevPos).toEqual(at.pos)
    }
  })

  it('stays with the player across a room change and keeps charging (objRoom.removeChargingSpell, #enteringNewRoom)', () => {
    let s = createSim(grid(openMap([], { rooms: 2 })), defs, teams, anims, 1, { x: 560, y: 144 })
    const holdRight: InputSnapshot = { ...NO_INPUT, chargeHeld: true, move: { x: 1, y: 0 }, mouseWorld: { x: 800, y: 144 } }
    s = stepSim(s, holdRight)
    const spellId = s.actors.find((a) => a.def === 'spell')!.id
    ;[s] = runUntil(s, (t) => t.room.x === 2, 20, holdRight)
    expect(s.room).toEqual({ x: 2, y: 1 })
    const carried = actor(s, spellId)!
    expect(carried.mode).toBe('charge')
    expect(playerOf(s).mode).toBe('charge')
    expect(playerOf(s).ai.chargeKind).toBe('mouse')
    // the next tick keeps counting on the same spell, re-aligned on the player
    s = stepSim(s, holdRight)
    const after = actor(s, spellId)!
    expect(after.charge).toBe(carried.charge + 1)
    expect(after.pos.x).toBe(playerOf(s).pos.x)
    expect(s.actors.filter((a) => a.def === 'spell')).toHaveLength(1)
  })
})

describe('reel timing and wall impacts (modReel, objCPUCharacter.collisionWall)', () => {
  it('does not count the hit tick as a stalled tick: a barely-moved victim reels 10 ticks after the hit', () => {
    // Find where a charge-1 blast aimed straight right explodes, then put the warrior just inside the
    // splash edge below it so the push is too small to move it more than the 0.2 stall speed.
    const aim = { x: 300, y: 144 - 8 - defs['player']!.attack.chargeSize / 2 }
    const fire = (s: SimState): SimState => stepSim(stepSim(s, { ...NO_INPUT, chargeHeld: true, mouseWorld: aim }), { ...NO_INPUT, mouseWorld: aim })
    let { s } = setup(WARRIOR, { x: 500, y: 250 }, { x: 100, y: 144 }, 1, dummy)
    ;[s] = runUntil(fire(s), (t) => t.events.some((e) => e.kind === 'explode'), 20)
    const ev = s.events.find((e) => e.kind === 'explode')!
    const centre = ev.kind === 'explode' ? ev.pos : { x: 0, y: 0 }
    // splash radius 2 + victim radius 7.5 = 9.5; at 9.3 px the push is 0.2 * 0.75 * 0.7 = 0.105 px/tick
    let { s: s2, enemyId } = setup(WARRIOR, { x: centre.x, y: centre.y + 9.3 }, { x: 100, y: 144 }, 1, dummy)
    let ticks: number
    ;[s2] = runUntil(fire(s2), (t) => actor(t, enemyId)!.mode === 'reel', 20)
    expect(Math.abs(actor(s2, enemyId)!.vel.y)).toBeLessThan(0.2)
    expect(actor(s2, enemyId)!.stall).toBe(0)
    ;[s2, ticks] = runUntil(s2, (t) => actor(t, enemyId)!.mode === 'walk', 30)
    expect(ticks).toBe(10)
  })

  const wallMap = openMap([{ x: 3, y: 3, tile: WARRIOR }], { solid: [...wallAt(12), ...Array.from({ length: 18 }, (_, i) => ({ x: i + 1, y: 2 }))] })
  const reeling = (vel: { x: number; y: number }, pos: { x: number; y: number }): Partial<ActorState> => ({
    ...dummy, mode: 'reel', anim: 'reel', vel, frictionPercent: { x: 10, y: 10 },
    ai: { ...dummy.ai!, mode: 'dazed' },
  })

  it('a reeling warrior hitting a wall loses |axis speed| - damageSpeed (3) energy', () => {
    // wall column 12 starts at x = 352 (edge location 351); rect half-width 6.5
    let { s, enemyId } = setup(WARRIOR, { x: 340, y: 144 }, { x: 100, y: 144 }, 1, reeling({ x: 10, y: 0 }, { x: 340, y: 144 }), wallMap)
    s = stepSim(s, NO_INPUT)
    let g = actor(s, enemyId)!
    expect(g.pos.x).toBeLessThan(340 + 9) // pushed out of the wall
    expect(g.vel.x).toBe(0)
    expect(g.energy).toBeCloseTo(100 - (9 - 3), 10) // speed after this tick's friction: 10 * 0.9
    // vertical: the solid row 2 (y 32..63) above a warrior moving up (fixed stand rect: top -7)
    ;({ s, enemyId } = setup(WARRIOR, { x: 200, y: 78 }, { x: 100, y: 144 }, 1, reeling({ x: 0, y: -10 }, { x: 200, y: 78 }), wallMap))
    s = stepSim(s, NO_INPUT)
    g = actor(s, enemyId)!
    expect(g.vel.y).toBe(0) // objGameObject.collisionCeiling: setVectY(0)
    expect(g.energy).toBeCloseTo(100 - (9 - 3), 10)
    // no damage at or under damageSpeed, nor outside #reel
    ;({ s, enemyId } = setup(WARRIOR, { x: 340, y: 144 }, { x: 100, y: 144 }, 1, reeling({ x: 3.3, y: 0 }, { x: 340, y: 144 }), wallMap))
    s = run(s, 4)
    expect(actor(s, enemyId)!.energy).toBe(100)
    ;({ s, enemyId } = setup(WARRIOR, { x: 340, y: 144 }, { x: 100, y: 144 }, 1, { ...dummy, vel: { x: 10, y: 0 } }, wallMap))
    s = stepSim(s, NO_INPUT)
    expect(actor(s, enemyId)!.energy).toBe(100)
  })

  it('a warrior leaving its wide sword frame with its back flush against a 1-tile wall stays on its side', () => {
    // modCollisionRect #fixed: the rect comes from the stand frame (15x16 -> half-width 6.5). A rect
    // from the 27 px weaponMelee frame (still shown on the tick the warrior walks off after its
    // swing) would reach 6 px into the wall column, and the push-out against the walking direction
    // would carry the warrior through the wall.
    const wide = { ...anims, goblinWarrior: { ...anims['goblinWarrior']!, weaponMelee: { frames: 11, delay: 2, w: 27, h: 16 } } }
    const flush = 384 + 6.5 // wall column 12 ends at x = 383
    let s = createSim(grid(openMap([{ x: 3, y: 3, tile: WARRIOR }], { solid: wallAt(12) })), defs, teams, wide, 1, { x: flush + 80, y: 144 })
    const g0 = s.actors.find((a) => a.id !== s.playerId)!
    const afterSwing: ActorState = {
      ...g0, pos: { x: flush, y: 144 }, prevPos: { x: flush, y: 144 }, mode: 'walk', anim: 'weaponMelee',
      ai: { ...g0.ai, mode: 'moveToAttack', targetId: s.playerId },
    }
    s = { ...s, actors: s.actors.map((a) => (a.id === g0.id ? afterSwing : a)) }
    for (let i = 0; i < 5; i++) {
      s = stepSim(s, NO_INPUT)
      expect(actor(s, g0.id)!.pos.x).toBeGreaterThanOrEqual(flush)
    }
  })

  it('an arrow flies through a solid tile, slowing only by friction', () => {
    let s = createSim(grid(openMap([], { solid: wallAt(12) })), defs, teams, anims, 1, { x: 100, y: 200 })
    const [arrow, s1] = createActor(s, 'goblinArrow', { x: 330, y: 144 })
    s = { ...s1, actors: [...s1.actors, { ...arrow, vel: { x: 8, y: 0 } }] }
    let x = 330
    let v = 8
    for (let i = 0; i < 12; i++) {
      s = stepSim(s, NO_INPUT)
      v *= 0.95
      x += v
      const a = actor(s, arrow.id)!
      expect(a.mode).toBe('fly')
      expect(a.pos.x).toBeCloseTo(x, 10)
    }
    expect(x).toBeGreaterThan(384) // passed the whole wall column
  })
})

describe('release strip (objAnimStrip getLooped)', () => {
  it('shows the last release frame for its full delay, then the stand frame with no wrap to frame 1', () => {
    let { s } = setup(WARRIOR, { x: 300, y: 144 }, { x: 100, y: 144 }, 1, dummy)
    s = run(s, 3, holdE)
    const seen: [string, string, number][] = []
    s = stepSim(s, NO_INPUT)
    for (let i = 0; i < 10; i++) {
      const p = playerOf(s)
      seen.push([p.mode, p.anim, p.animFrame])
      s = stepSim(s, NO_INPUT)
    }
    // release: 4 frames x delay 2; the mode turns to walk on the last tick of frame 4
    expect(seen).toEqual([
      ['release', 'release', 0], ['release', 'release', 0], ['release', 'release', 1], ['release', 'release', 1],
      ['release', 'release', 2], ['release', 'release', 2], ['release', 'release', 3], ['walk', 'release', 3],
      ['walk', 'stand', 0], ['walk', 'stand', 0],
    ])
  })
})

describe('nav mode (modNavMode)', () => {
  it('walks with navModeAcceleration while the room is clear and walkAcceleration while hostiles live', () => {
    const right = { ...NO_INPUT, move: { x: 1, y: 0 } }
    const speeds = (s: SimState, n: number): [SimState, number[]] => {
      const v: number[] = []
      for (let i = 0; i < n; i++) {
        s = stepSim(s, right)
        v.push(playerOf(s).vel.x)
      }
      return [s, v]
    }
    // a living goblin: exits shut, normal acceleration 2 -> steady speed 2 under 50 % friction
    let { s } = setup(WARRIOR, { x: 500, y: 144 }, { x: 100, y: 144 }, 1, dummy)
    expect(s.navMode).toBe(false)
    let v: number[]
    ;[s, v] = speeds(s, 10)
    expect(v.every((x) => x <= 2)).toBe(true)
    expect(v[9]).toBeGreaterThan(1.99)
    // an empty room is clear on entry: navModeAcceleration 6 (engine default) -> steady speed 6
    s = createSim(grid(openMap()), defs, teams, anims, 1, { x: 100, y: 144 })
    expect(s.navMode).toBe(true)
    ;[s, v] = speeds(s, 10)
    expect(v.every((x) => x <= 6)).toBe(true)
    expect(v[9]).toBeGreaterThan(5.9)
  })
})

describe('stall detection on a wall slide (regression: a goblin stayed in #scenic for 10+ s)', () => {
  it('a walker pressed against a wall whose slide has shrunk below a pixel per tick stalls and leaves #scenic', () => {
    // Waypoint behind a full-height wall, 3 px off the walker's row: the push-out blocks x and the
    // walk vector's y component decays geometrically, so the float position keeps creeping. The
    // stall test is on the on-screen (whole-pixel) move (objMoveXY pMoveVect = pSpr.loc delta).
    const ai = { mode: 'moveToAttack' as const, targetId: null, retargetCounter: 0, pathMode: 'scenic' as const, waypoint: { x: 200, y: 83 }, pathStall: 0, scenicTicks: 0, moveTarget: null, walkTicks: 0, detourTicks: 0, detourGoal: null, idleTicks: 0, wanderGoal: null, chargeKind: null }
    const map = openMap([{ x: 10, y: 5, tile: WARRIOR }], { solid: wallAt(9) })
    let { s, enemyId } = setup(WARRIOR, { x: 310, y: 80 }, { x: 40, y: 40 }, 1, { ai }, map)
    let [, ticks] = runUntil(s, (t) => actor(t, enemyId)!.ai.pathMode === 'beeline', 40)
    expect(ticks).toBeGreaterThan(0)
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

describe('player knockback (remake decision, see applyHit)', () => {
  it('slides the player with the decaying push while walking speed stays normal', () => {
    let { s } = setup(WARRIOR, { x: 300, y: 144 }, { x: 100, y: 144 }, 1, dummy)
    s = { ...s, actors: s.actors.map((a) => (a.id === s.playerId ? { ...a, knockback: { x: 10, y: 0 } } : a)) }
    const walkRight = { ...NO_INPUT, move: { x: 1, y: 0 } }
    s = run(s, 80, walkRight)
    // the knockback has died out and walking is back at its steady 2 px/tick, not 18
    expect(Math.abs(playerOf(s).knockback.x)).toBeLessThan(0.01)
    expect(playerOf(s).vel.x).toBeCloseTo(2, 3)
  })
})

describe('sound and music events (engine notes sound §3, §5)', () => {
  const sounds = (s: SimState) => s.events.filter((e) => e.kind === 'sound')

  it('warrior: the sword sound on the strike tick, wizard_hit at 150 on the player\'s energy loss', () => {
    const { s } = setup(WARRIOR, { x: 300, y: 144 })
    const before = playerOf(s).energy
    const [hit] = runUntil(s, (t) => playerOf(t).energy < before, 150)
    expect(sounds(hit)).toContainEqual({ kind: 'sound', name: 'skeleton_fire', volume: 150 })
    expect(sounds(hit)).toContainEqual({ kind: 'sound', name: 'wizard_hit', volume: 150 })
  })

  it('archer: goblin_fire when the arrow spawns', () => {
    const { s } = setup(ARCHER, { x: 190, y: 144 })
    const [shot] = runUntil(s, (t) => t.actors.some((x) => x.def === 'goblinArrow'), 40)
    expect(sounds(shot)).toContainEqual({ kind: 'sound', name: 'goblin_fire', volume: 150 })
  })

  it('energy blast: release and explode volumes follow the charge (10-255 over 1-100)', () => {
    let { s } = setup(WARRIOR, { x: 300, y: 144 }, { x: 100, y: 144 }, 1, dummy)
    s = run(s, 13, holdE)
    const charge = s.actors.find((a) => a.def === 'spell')!.charge
    s = stepSim(s, NO_INPUT)
    expect(sounds(s)).toContainEqual({ kind: 'sound', name: 'spell_release', volume: chargeVolume(charge) })
    ;[s] = runUntil(s, (t) => t.events.some((e) => e.kind === 'explode'), 20)
    expect(sounds(s)).toContainEqual({ kind: 'sound', name: 'spell_explode', volume: chargeVolume(charge) })
  })

  it('end_screen plays once, on the tick the exits open', () => {
    let { s } = setup(WARRIOR, { x: 300, y: 144 }, { x: 100, y: 144 }, 1, { ...dummy, energy: 1 })
    s = run(s, 13, holdE)
    const cleared: number[] = []
    for (let i = 0; i < 60; i++) {
      s = stepSim(s, NO_INPUT)
      if (s.events.some((e) => e.kind === 'sound' && e.name === 'end_screen')) cleared.push(i)
      if (s.events.some((e) => e.kind === 'exitsOpened')) expect(cleared.at(-1)).toBe(i)
    }
    expect(cleared).toHaveLength(1)
  })

  it('room activation plays the room\'s music tile: start, re-entry, musicOff; rooms without one stay silent', () => {
    const symbols = ['none', 'musicLastStand', 'musicOff']
    const fill = (v: number) => Array.from({ length: 9 }, () => Array(18).fill(v))
    const withTile = (tile: number) => { const o = fill(0); o[0]![0] = tile; return o }
    const objects = [withTile(2), fill(0), withTile(3)]
    const map: MapDefinition = {
      mapSize: { x: 3, y: 1 }, roomSize: { x: 18, y: 9 }, startRoom: { x: 1, y: 1 },
      layers: [{ name: 'backgroundPassive', tileSet: 'p' }, { name: 'backgroundActive', tileSet: 'a' }, { name: 'objects', tileSet: 'o' }],
      rooms: objects.map((o, i) => ({ num: i + 1, layers: { backgroundActive: fill(1), backgroundPassive: fill(1), objects: o } })),
    }
    let s = createSim(buildWorldGrid(map, () => false, symbols), defs, teams, anims, 1, { x: 288, y: 144 })
    const heard: (string | null)[] = []
    const collect = (t: SimState) => { for (const e of t.events) if (e.kind === 'music') heard.push(e.track) }
    collect(s)
    const right: InputSnapshot = { ...NO_INPUT, move: { x: 1, y: 0 } }
    const left: InputSnapshot = { ...NO_INPUT, move: { x: -1, y: 0 } }
    const walk = (input: InputSnapshot, room: number) => {
      for (let i = 0; i < 600 && s.room.x !== room; i++) { s = stepSim(s, input); collect(s) }
      expect(s.room.x).toBe(room)
    }
    walk(right, 3)
    walk(left, 1)
    expect(heard).toEqual(['last_stand_v4', null, 'last_stand_v4'])
  })
})

describe('fast movers against a 1-tile wall (remake: sub-stepped tile collision, see sweepTileCollision)', () => {
  // wall column 12 spans x 352..383; everything else in room 1 is open
  const WALL_LEFT = 352
  const WALL_RIGHT = 383
  const map = openMap([{ x: 3, y: 3, tile: WARRIOR }], { solid: wallAt(12) })
  const far = { x: 150, y: 250 }
  const withKnockback = (s: SimState, knockback: { x: number; y: number }): SimState =>
    ({ ...s, actors: s.actors.map((a) => (a.id === s.playerId ? { ...a, knockback } : a)) })

  // A thunderBlast can stack its bullet hit (applied twice) and its splash into one tick's
  // knockback, well past 31 px on the first tick, hence the larger pushes.
  it('a 30-90 px/tick knockback never carries Merlin through the wall, at any offset or diagonal', () => {
    for (let gap = 1; gap <= 40; gap += 3) {
      for (const [vx, vy] of [[30, 0], [30, 10], [30, -10], [30, 25], [60, 0], [60, 20], [90, -30]] as const) {
        for (const side of [1, -1]) {
          const x = side > 0 ? WALL_LEFT - 8 - gap : WALL_RIGHT + 8 + gap
          let { s } = setup(WARRIOR, far, { x, y: 144 }, 1, dummy, map)
          s = withKnockback(s, { x: vx * side, y: vy })
          for (let i = 0; i < 6; i++) {
            s = stepSim(s, NO_INPUT)
            const p = playerOf(s).pos
            if (side > 0) expect(p.x + 7).toBeLessThan(WALL_LEFT)
            else expect(p.x - 7).toBeGreaterThan(WALL_RIGHT)
          }
        }
      }
    }
  })

  it('a goblin reeling at 30 px/tick stops at the wall and takes its wall damage once', () => {
    const reel = (vel: { x: number; y: number }, pos: { x: number; y: number }): Partial<ActorState> => ({
      ...dummy, mode: 'reel', anim: 'reel', vel, pos, prevPos: pos, frictionPercent: { x: 10, y: 10 },
      ai: { ...dummy.ai!, mode: 'dazed' },
    })
    for (let gap = 1; gap <= 40; gap += 3) {
      for (const vy of [0, 10, -10]) {
        const pos = { x: WALL_LEFT - 7 - gap, y: 144 }
        let { s, enemyId } = setup(WARRIOR, pos, { x: 100, y: 144 }, 1, reel({ x: 30, y: vy }, pos), map)
        for (let i = 0; i < 6; i++) {
          s = stepSim(s, NO_INPUT)
          expect(actor(s, enemyId)!.pos.x + 6.5).toBeLessThan(WALL_LEFT)
        }
      }
    }
    // straight in: the speed after this tick's friction is 27, so it loses 27 - damageSpeed 3 once
    const pos = { x: WALL_LEFT - 30, y: 144 }
    let { s, enemyId } = setup(WARRIOR, pos, { x: 100, y: 144 }, 1, reel({ x: 30, y: 0 }, pos), map)
    s = stepSim(s, NO_INPUT)
    expect(actor(s, enemyId)!.vel.x).toBe(0)
    expect(actor(s, enemyId)!.energy).toBeCloseTo(100 - (27 - 3), 10)
    s = run(s, 3)
    expect(actor(s, enemyId)!.energy).toBeCloseTo(100 - (27 - 3), 10)
  })

  it('a strong diagonal push along the wall slides Merlin along it instead of stopping dead', () => {
    let { s } = setup(WARRIOR, far, { x: WALL_LEFT - 30, y: 100 }, 1, dummy, map)
    s = withKnockback(s, { x: 30, y: 20 })
    s = stepSim(s, NO_INPUT)
    const p = playerOf(s)
    expect(p.pos).toEqual({ x: WALL_LEFT - 1 - 7, y: 120 })
    expect(p.knockback.x).toBe(0)
    expect(p.knockback.y).toBeGreaterThan(0)
  })
})
