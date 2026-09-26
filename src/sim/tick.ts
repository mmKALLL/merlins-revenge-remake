// Fixed-step simulation orchestrator. Per tick, in order:
//  1. player movement (walking notes §5-7: velocity with walk or nav-mode acceleration, tile
//     collision, closed-exit clamp, exit test; a dying player never changes rooms)
//  2. player attack input: charge / resume / release (tick-spell.ts)
//  3. CPU AI decisions (tick-ai.ts)
//  4. movement of every other actor (every velocity, walkers' included, decays by the actor's
//     friction first; characters collide with tiles and take wall damage while reeling; bullets
//     and spells ignore tiles)
//  5. animation advance for every actor, strip by mode (anim.ts); weapon technique stretches attack frames
//  6. attack frames: melee strike, bullet spawn; 7. bullets (tick-combat.ts); 8. spells (tick-spell.ts)
//  9. reel and death progression (graves recorded on #finish); 10. cooldowns and regeneration
// 11. removed actors dropped, graves stored in the room; exits open (and nav mode starts) when no
//     hostile team member was left at the start of the tick, i.e. one tick after the last #finish
// 12. room change: living characters stored, the new room restored or spawned (combat notes §2);
//     the new room's music tile (if any) emits a `music` event, as createSim does for the start room
import type { ActorDef } from '../mr-open/mr-actor-data'
import { resolveTileCollisionHits } from '../mr-open/mr-collision'
import { tileCentre, type Rect, type Vec } from '../mr-open/mr-geometry'
import { ROOM_CLEARED_SOUND, DEFAULT_VOLUME } from '../mr-open/mr-sound'
import { stepVelocity } from '../mr-open/mr-movement'
import { clampToRoom, roomAfterMove } from '../mr-open/mr-room-exit'
import type { TeamDef } from '../mr-open/mr-team-data'
import { stepTechnique } from '../mr-open/mr-weapon-technique'
import {
  collisionRectFor, createActor, defOf, faceAlong, isAlive, isCharacter, isSpell, playerOf, roomMusicTrack, spawnRoomActors, stripFor,
} from './actors'
import { advanceAnim, extendFrame, stripNameFor } from './anim'
import {
  DEFAULT_SIM_CONFIG, roomKey,
  type ActorState, type AnimationSet, type InputSnapshot, type RoomState, type SimConfig, type SimState,
} from './state'
import { stepCpuAi } from './tick-ai'
import { exitsOpenFor, stepAttackFrames, stepBullets, stepCooldownsAndRegen, stepReelAndDeath, takeWallDamage } from './tick-combat'
import { beginTick, playerIn, type Tick } from './tick-context'
import { stepPlayerAttack, stepSpells } from './tick-spell'
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
  return withRoomMusic(withExitsEvaluated(spawnRoomActors({ ...s, playerId: player.id, actors: [player] }, s.room)))
}

/**
 * Room activation starts the room's music actor (objMusic.start -> playMusic; engine notes sound §3),
 * on the first entry and on every re-entry; a room without one leaves the current track playing.
 */
function withRoomMusic(s: SimState): SimState {
  const track = roomMusicTrack(s, s.room)
  return track === undefined ? s : { ...s, events: [...s.events, { kind: 'music', track }] }
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
        if (grid.tileAt('objects', wx, wy) === playerTileIndex) return tileCentre(wx, wy)
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
  const def = defOf(s, p)
  const dir = isAlive(p) ? input.move : { x: 0, y: 0 }
  const accel = s.navMode && def.navModeAcceleration > 0 ? def.navModeAcceleration : def.walkAcceleration
  const walkVel = stepVelocity(p.vel, dir, accel, p.frictionPercent)
  // hit knockback slides on top of walking and decays by frictionReel (see applyHit)
  const knock = p.knockback
  const vel = { x: walkVel.x + knock.x, y: walkVel.y + knock.y }
  let loc: Vec = { x: p.pos.x + vel.x, y: p.pos.y + vel.y }
  // objGameObject.collisionWallLeft/Right: setVectX(0); collisionCeiling/collisionPlatform: setVectY(0)
  const pushed = resolveTileCollisionHits(s.grid.solidAt, loc, { x: Math.sign(vel.x), y: Math.sign(vel.y) }, cfg.collisionRect)
  loc = pushed.loc
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
  p.vel = { x: pushed.wallX ? 0 : walkVel.x, y: pushed.wallY ? 0 : walkVel.y }
  const decayed = stepVelocity(knock, { x: 0, y: 0 }, 0, def.frictionReel)
  p.knockback = { x: pushed.wallX ? 0 : decayed.x, y: pushed.wallY ? 0 : decayed.y }
  faceAlong(p, dir.x)
  return room
}

/**
 * 4. Movement of every non-player actor. Every velocity decays by the actor's friction before the
 * move (objMoveXY.update). That includes walkers: modMoveToLoc sets a walkSpeed vector, but the
 * same objMoveXY.update then takes the walking friction (50 %) off it before moving, so a goblin
 * with walkSpeed 4 covers 2 px/tick; the AI overwrites the velocity again next tick. Reeling,
 * dying and landing characters and bullets decay by their current friction the same way. Spells
 * fly free (no friction) and a charging spell stays aligned to its caster. Bullets ignore tiles
 * too (gBulletsCollideWithBackground off, as the original plays); characters collide with them
 * (see collideCharacter).
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
    const vel = stepVelocity(a.vel, { x: 0, y: 0 }, 0, a.frictionPercent)
    const loc: Vec = { x: a.pos.x + vel.x, y: a.pos.y + vel.y }
    const moved = isCharacter(s, a) ? collideCharacter(t, a, loc, vel, roomRect) : { loc, vel }
    a.prevPos = a.pos
    a.pos = moved.loc
    a.vel = moved.vel
  }
}

/**
 * A character's move against tiles and the room edge: the axis pushed out loses its speed
 * (objGameObject.collisionWall*: setVectX(0), collisionCeiling/Platform: setVectY(0)), a reeling
 * one taking wall damage first (objCPUCharacter.collisionWall/collisionVertical), and it stays
 * inside the room.
 */
function collideCharacter(t: Tick, a: ActorState, loc: Vec, vel: Vec, roomRect: Rect): { loc: Vec; vel: Vec } {
  const cr = collisionRectFor(t.s, a)
  // A corner push moves both axes but the engine only calls the wall callbacks for it
  // (objCollisionMap.checkCollisions), so it zeroes x and takes wall damage once.
  const hit = resolveTileCollisionHits(t.s.grid.solidAt, loc, { x: Math.sign(vel.x), y: Math.sign(vel.y) }, cr)
  let v = vel
  if (hit.wallX) {
    takeWallDamage(t, a, vel.x)
    v = { x: 0, y: vel.y }
  } else if (hit.wallY) {
    takeWallDamage(t, a, vel.y)
    v = { x: vel.x, y: 0 }
  }
  const clamped = clampToRoom(roomRect, hit.loc, cr)
  if (clamped.x !== hit.loc.x) v = { x: 0, y: v.y }
  return { loc: clamped, vel: v }
}

/** 5. Animation advance for every actor; the player is "moving" while a move key is held, others while their velocity is non-zero. */
function stepAnimation(t: Tick, input: InputSnapshot): void {
  const s = t.s
  for (const a of t.actors) {
    if (t.removed.has(a.id)) continue
    const set = s.anims[defOf(s, a).name]
    const moving = a.id === s.playerId ? isAlive(a) && (input.move.x !== 0 || input.move.y !== 0) : a.vel.x !== 0 || a.vel.y !== 0
    const name = stripNameFor(set, a.mode, moving, isSpell(s, a))
    Object.assign(a, advanceAnim(a, name, stripFor(s, { ...a, anim: name })))
  }
}

/**
 * modWeaponTechnique.update: while the AI is in #attack the technique counter runs and a negative
 * technique lengthens the attack strip's current frame (the goblin archer's -75 adds roughly one
 * tick per three to its 21-tick bow strip).
 */
function stepWeaponTechnique(t: Tick): void {
  for (const a of t.actors) {
    if (t.removed.has(a.id) || a.ai.mode !== 'attack') continue
    const r = stepTechnique(a.technique, defOf(t.s, a).weaponTechnique)
    a.technique = r.state
    Object.assign(a, extendFrame(a, stripFor(t.s, a), r.extend))
  }
}

/** 12. Store the old room's living characters, then restore the new room's or spawn it on a first visit. */
function changeRoom(s: SimState, from: Vec, to: Vec): SimState {
  const fromKey = roomKey(from)
  const toKey = roomKey(to)
  // objPlayerMerlinCharacter #leaveRoom restores the mode it left in (pLeaveMode), and
  // objRoom.getRoomObjects takes the player's charging spell out of the room before freezing it:
  // the spell stays with the player (modSpellMultistage #enteringNewRoom), so the charge goes on.
  const player = playerOf(s)
  const charging = s.actors.filter((a) => isSpell(s, a) && a.ownerId === s.playerId && a.mode === 'charge')
  const survivors = s.actors.filter((a) => a.id !== s.playerId && isCharacter(s, a) && isAlive(a))
  const stored = s.rooms[fromKey] ?? EMPTY_ROOM
  const carried = [player, ...charging]
  const next: SimState = {
    ...s,
    room: to,
    actors: carried,
    rooms: { ...s.rooms, [fromKey]: { ...stored, actors: survivors } },
  }
  const target = next.rooms[toKey]
  if (target?.spawned) {
    return withRoomMusic(withExitsEvaluated({ ...next, actors: [...carried, ...target.actors], rooms: { ...next.rooms, [toKey]: { ...target, actors: [] } } }))
  }
  return withRoomMusic(withExitsEvaluated(spawnRoomActors(next, to)))
}

/**
 * 11. The current room after the tick: this tick's graves stored, and the exits opened (with the
 * room-cleared sound) once no hostile team member is left. teamMaster.leaveTeam schedules
 * tellTeamDied for the next update, so the exits open on the tick after the last hostile finished
 * (its grave is already recorded): the test runs on the tick's incoming actors.
 */
function settleRoom(t: Tick): { rooms: SimState['rooms']; exitsOpen: boolean } {
  const s = t.s
  const key = roomKey(s.room)
  const current = s.rooms[key] ?? EMPTY_ROOM
  let roomState = t.graves.length ? { ...current, graves: [...current.graves, ...t.graves] } : current
  let exitsOpen = s.exitsOpen
  if (!exitsOpen && exitsOpenFor(s, s.actors)) {
    exitsOpen = true
    roomState = { ...roomState, clear: true }
    t.events.push({ kind: 'exitsOpened' })
    // objRoom.openExits (objRoom.txt:200-206): the room-cleared sound, once per room (pRoomCleared).
    // The engine skips it when pMap.isMapClear() so it does not clash with the game-complete sound;
    // there is no game-complete screen yet, so the port always plays it.
    t.events.push({ kind: 'sound', name: ROOM_CLEARED_SOUND, volume: DEFAULT_VOLUME })
  }
  return { rooms: roomState === current ? s.rooms : { ...s.rooms, [key]: roomState }, exitsOpen }
}

export function stepSim(s: SimState, input: InputSnapshot, cfg: SimConfig = DEFAULT_SIM_CONFIG): SimState {
  const t = beginTick(s)
  const room = stepPlayerMove(t, input, cfg)
  stepPlayerAttack(t, input)
  stepCpuAi(t)
  stepMovement(t)
  stepAnimation(t, input)
  stepWeaponTechnique(t)
  stepAttackFrames(t)
  stepBullets(t)
  stepSpells(t)
  stepReelAndDeath(t)
  stepCooldownsAndRegen(t)
  const { rooms, exitsOpen } = settleRoom(t)
  const next: SimState = {
    ...s,
    tick: s.tick + 1,
    actors: t.actors.filter((a) => !t.removed.has(a.id)),
    rooms,
    exitsOpen,
    navMode: exitsOpen, // attemptOpenExits -> goNavMode
    rng: t.rng,
    nextId: t.nextId,
    events: t.events,
    restartRequested: t.restartRequested,
  }
  return room.x !== s.room.x || room.y !== s.room.y ? changeRoom(next, s.room, room) : next
}
