// Fixed-step simulation orchestrator. Per tick, in order:
//  1. player movement (walking notes §5-7: velocity, tile collision, closed-exit clamp, exit test)
//  2. player attack input: charge / release (tick-combat.ts)
//  3. CPU AI decisions (tick-ai.ts)
//  4. movement of every other actor (walk velocity as set, friction for reel/land/bullets, spells free)
//  5. animation advance for every actor, strip by mode (anim.ts)
//  6. attack frames: melee strike, bullet spawn; 7. bullets; 8. spells (tick-combat.ts)
//  9. reel and death progression; 10. cooldowns and regeneration
// 11. exits open when the room's hostiles are dead; graves recorded; removed actors dropped
// 12. room change: living characters stored, the new room restored or spawned (combat notes §2)
import type { ActorDef } from '../mr-open/mr-actor-data'
import { resolveTileCollision } from '../mr-open/mr-collision'
import { TILE_PX, type Vec } from '../mr-open/mr-geometry'
import { stepVelocity } from '../mr-open/mr-movement'
import { clampToRoom, roomAfterMove } from '../mr-open/mr-room-exit'
import type { TeamDef } from '../mr-open/mr-team-data'
import { collisionRectFor, createActor, isAlive, isCharacter, isSpell, playerOf, spawnRoomActors, stripFor } from './actors'
import { advanceAnim, stripNameFor } from './anim'
import {
  DEFAULT_SIM_CONFIG, roomKey,
  type ActorState, type AnimationSet, type InputSnapshot, type RoomState, type SimConfig, type SimState,
} from './state'
import { stepCpuAi } from './tick-ai'
import {
  exitsOpenFor, stepAttackFrames, stepBullets, stepCooldownsAndRegen, stepPlayerAttack, stepReelAndDeath, stepSpells, takeWallDamage,
} from './tick-combat'
import { beginTick, playerIn, type Tick } from './tick-context'
import type { WorldGrid } from './world-grid'

const EMPTY_ROOM: RoomState = { spawned: true, actors: [], graves: [], clear: false }

export function createSim(
  grid: WorldGrid,
  defs: Record<string, ActorDef>,
  teams: Record<string, TeamDef>,
  anims: Record<string, AnimationSet>,
  seed: number,
  startPos: Vec,
): SimState {
  if (!defs['player']) throw new Error('actor definitions have no "player" entry')
  const empty: SimState = {
    tick: 0,
    grid,
    defs,
    teams,
    anims,
    room: grid.roomOfPoint(startPos.x, startPos.y),
    rooms: {},
    exitsOpen: true,
    navMode: true,
    actors: [],
    nextId: 0,
    rng: { seed: seed >>> 0 },
    playerId: 0,
    restartRequested: false,
    events: [],
  }
  const [player, s] = createActor(empty, 'player', startPos)
  return withExitsEvaluated(spawnRoomActors({ ...s, playerId: player.id, actors: [player] }, s.room))
}

/** Start position for a map: centre of the #player tile in the start room's objects layer, else room centre. */
export function findStartPos(grid: WorldGrid, playerTileIndex: number | null): Vec {
  const { roomSize, startRoom } = grid.map
  const r = grid.roomRectPx(startRoom)
  if (playerTileIndex !== null) {
    for (let ty = 1; ty <= roomSize.y; ty++) {
      for (let tx = 1; tx <= roomSize.x; tx++) {
        const wx = (startRoom.x - 1) * roomSize.x + tx
        const wy = (startRoom.y - 1) * roomSize.y + ty
        if (grid.tileAt('objects', wx, wy) === playerTileIndex) {
          return { x: (wx - 1) * TILE_PX + TILE_PX / 2, y: (wy - 1) * TILE_PX + TILE_PX / 2 }
        }
      }
    }
  }
  return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 }
}

/**
 * objRoom.activate: exits start open iff no hostile is alive in the room (attemptOpenExits), and a
 * clear room puts the player in nav mode (gameMaster.goNavMode; gNavMode taken as on). Leaving a room
 * drops nav mode before moveRoom, so the new room's state applies at once.
 */
function withExitsEvaluated(s: SimState): SimState {
  const exitsOpen = exitsOpenFor(s, s.actors)
  const key = roomKey(s.room)
  return { ...s, exitsOpen, navMode: exitsOpen, rooms: { ...s.rooms, [key]: { ...(s.rooms[key] ?? EMPTY_ROOM), clear: exitsOpen } } }
}

/** 1. The player's own movement (objMoveXY.update -> collisions -> exit test); returns the room after the move. */
function stepPlayerMove(t: Tick, input: InputSnapshot, cfg: SimConfig): Vec {
  const s = t.s
  const p = playerIn(t)
  const def = s.defs[p.def]!
  const dir = isAlive(p) ? input.move : { x: 0, y: 0 }
  const accel = s.navMode && def.navModeAcceleration > 0 ? def.navModeAcceleration : def.walkAcceleration
  const vel = stepVelocity(p.vel, dir, accel, p.frictionPercent)
  let loc: Vec = { x: p.pos.x + vel.x, y: p.pos.y + vel.y }
  const before = loc
  loc = resolveTileCollision(s.grid.solidAt, loc, { x: Math.sign(vel.x), y: Math.sign(vel.y) }, cfg.collisionRect)
  const hitWallX = loc.x !== before.x
  const roomRect = s.grid.roomRectPx(s.room)
  if (!s.exitsOpen) loc = clampToRoom(roomRect, loc, cfg.collisionRect)
  let room = s.room
  // a dying player (stretch death) never leaves the room
  if (s.exitsOpen && isAlive(p)) {
    const next = roomAfterMove(roomRect, loc, s.room)
    if (s.grid.roomExists(next)) room = next
  }
  p.prevPos = p.pos
  p.pos = loc
  p.vel = { x: hitWallX ? 0 : vel.x, y: vel.y }
  if (dir.x < 0) p.facingLeft = true
  else if (dir.x > 0) p.facingLeft = false
  return room
}

/**
 * 4. Movement of every non-player actor. Walking characters keep the AI-set velocity (no friction,
 * modMoveToLoc overwrites it each tick); reeling, dying and landing ones and bullets decay by their
 * friction. Spells fly free and bullets ignore tiles too (gBulletsCollideWithBackground off, as the
 * original plays). Characters collide with tiles: the axis pushed out loses its speed
 * (objGameObject.collisionWall*: setVectX(0), collisionCeiling/Platform: setVectY(0)), a reeling
 * one taking wall damage first (objCPUCharacter.collisionWall/collisionVertical), and they stay
 * inside the room.
 */
function stepMovement(t: Tick): void {
  const s = t.s
  const roomRect = s.grid.roomRectPx(s.room)
  for (const a of t.actors) {
    if (a.id === s.playerId || t.removed.has(a.id)) continue
    if (isSpell(s, a)) {
      if (a.mode === 'charge') continue // aligned to the caster in stepPlayerAttack
      a.prevPos = a.pos
      a.pos = { x: a.pos.x + a.vel.x, y: a.pos.y + a.vel.y }
      continue
    }
    const character = isCharacter(s, a)
    const walking = character && (a.mode === 'walk' || a.mode === 'stand' || a.mode === 'weaponMelee' || a.mode === 'weaponRanged')
    let vel = walking ? a.vel : stepVelocity(a.vel, { x: 0, y: 0 }, 0, a.frictionPercent)
    const before: Vec = { x: a.pos.x + vel.x, y: a.pos.y + vel.y }
    let loc = before
    if (character) {
      const cr = collisionRectFor(s, a)
      loc = resolveTileCollision(s.grid.solidAt, before, { x: Math.sign(vel.x), y: Math.sign(vel.y) }, cr)
      if (loc.x !== before.x) {
        takeWallDamage(t, a, vel.x)
        vel = { x: 0, y: vel.y }
      }
      if (loc.y !== before.y) {
        takeWallDamage(t, a, vel.y)
        vel = { x: vel.x, y: 0 }
      }
      const clamped = clampToRoom(roomRect, loc, cr)
      if (clamped.x !== loc.x) vel = { x: 0, y: vel.y }
      loc = clamped
    }
    a.prevPos = a.pos
    a.pos = loc
    a.vel = vel
  }
}

/** 5. Animation advance for every actor; the player is "moving" while a move key is held, others while their velocity is non-zero. */
function stepAnimation(t: Tick, input: InputSnapshot): void {
  const s = t.s
  for (const a of t.actors) {
    if (t.removed.has(a.id)) continue
    const set = s.anims[s.defs[a.def]!.name]
    const moving = a.id === s.playerId ? isAlive(a) && (input.move.x !== 0 || input.move.y !== 0) : a.vel.x !== 0 || a.vel.y !== 0
    const name = stripNameFor(set, a.mode, moving, isSpell(s, a))
    Object.assign(a, advanceAnim(a, name, stripFor(s, { ...a, anim: name })))
  }
}

/** 12. Store the old room's living characters, then restore the new room's or spawn it on a first visit. */
function changeRoom(s: SimState, from: Vec, to: Vec): SimState {
  const fromKey = roomKey(from)
  const toKey = roomKey(to)
  let player = playerOf(s)
  // a charging or releasing player leaves its spell behind (dropped with the room)
  if (player.mode === 'charge' || player.mode === 'release') player = { ...player, mode: 'walk' }
  player = { ...player, ai: { ...player.ai, chargeKind: null } }
  const survivors = s.actors.filter((a) => a.id !== s.playerId && isCharacter(s, a) && isAlive(a))
  const stored = s.rooms[fromKey] ?? EMPTY_ROOM
  const next: SimState = {
    ...s,
    room: to,
    actors: [player],
    rooms: { ...s.rooms, [fromKey]: { ...stored, actors: survivors } },
  }
  const target = next.rooms[toKey]
  if (target?.spawned) {
    return withExitsEvaluated({ ...next, actors: [player, ...target.actors], rooms: { ...next.rooms, [toKey]: { ...target, actors: [] } } })
  }
  return withExitsEvaluated(spawnRoomActors(next, to))
}

export function stepSim(s: SimState, input: InputSnapshot, cfg: SimConfig = DEFAULT_SIM_CONFIG): SimState {
  const t = beginTick(s)
  const room = stepPlayerMove(t, input, cfg)
  stepPlayerAttack(t, input)
  stepCpuAi(t)
  stepMovement(t)
  stepAnimation(t, input)
  stepAttackFrames(t)
  stepBullets(t)
  stepSpells(t)
  stepReelAndDeath(t)
  stepCooldownsAndRegen(t)
  const actors: ActorState[] = t.actors.filter((a) => !t.removed.has(a.id))
  const key = roomKey(s.room)
  const current = s.rooms[key] ?? EMPTY_ROOM
  let roomState = t.graves.length ? { ...current, graves: [...current.graves, ...t.graves] } : current
  // teamMaster.leaveTeam schedules tellTeamDied for the next update: the exits open on the tick
  // after the last hostile finished (its grave is already recorded), so test the incoming actors
  let exitsOpen = s.exitsOpen
  if (!exitsOpen && exitsOpenFor(s, s.actors)) {
    exitsOpen = true
    roomState = { ...roomState, clear: true }
    t.events.push({ kind: 'exitsOpened' })
  }
  const next: SimState = {
    ...s,
    tick: s.tick + 1,
    actors,
    rooms: roomState === current ? s.rooms : { ...s.rooms, [key]: roomState },
    exitsOpen,
    navMode: exitsOpen, // attemptOpenExits -> goNavMode
    rng: t.rng,
    nextId: t.nextId,
    events: t.events,
    restartRequested: t.restartRequested,
  }
  return room.x !== s.room.x || room.y !== s.room.y ? changeRoom(next, s.room, room) : next
}
