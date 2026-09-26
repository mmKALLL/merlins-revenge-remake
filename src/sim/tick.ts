// Fixed-step simulation. Tick order follows docs/notes/engine-mechanics-walking-and-rooms.md §5-7:
// velocity (input, friction, clamp) -> tile collision (direction = sign of velocity) ->
// closed-exit clamp -> exit test on the reg point -> wall hit zeroes horizontal velocity ->
// facing from horizontal input -> animation. Room changes store the old room's actors and
// restore or spawn the new room's (objRoom.activate / restoreState, combat notes §2).
import type { ActorDef } from '../mr-open/mr-actor-data'
import { resolveTileCollision } from '../mr-open/mr-collision'
import { TILE_PX, type Vec } from '../mr-open/mr-geometry'
import { stepVelocity } from '../mr-open/mr-movement'
import { clampToRoom, roomAfterMove } from '../mr-open/mr-room-exit'
import type { TeamDef } from '../mr-open/mr-team-data'
import { createActor, spawnRoomActors, stripFor } from './actors'
import {
  DEFAULT_SIM_CONFIG, roomKey,
  type ActorState, type AnimationSet, type AnimationStrip, type InputSnapshot, type SimConfig, type SimState,
} from './state'
import type { WorldGrid } from './world-grid'

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
    actors: [],
    nextId: 0,
    rng: { seed: seed >>> 0 },
    playerId: 0,
    restartRequested: false,
    events: [],
  }
  const [player, s] = createActor(empty, 'player', startPos)
  return spawnRoomActors({ ...s, playerId: player.id, actors: [player] }, s.room)
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

/** Advances one strip by a tick (objAnimSet.update): frame 0 on a strip change, `animLooped` on the tick it wraps. */
function advanceAnim(a: ActorState, animName: string, strip: AnimationStrip | undefined): Pick<ActorState, 'anim' | 'animFrame' | 'animCounter' | 'animLooped'> {
  if (animName !== a.anim) return { anim: animName, animFrame: 0, animCounter: 0, animLooped: false }
  if (!strip) return { anim: animName, animFrame: a.animFrame, animCounter: a.animCounter, animLooped: false }
  let animFrame = a.animFrame
  let animCounter = a.animCounter + 1
  let animLooped = false
  if (animCounter >= strip.delay) {
    animCounter = 0
    animFrame = a.animFrame + 1
    if (animFrame >= strip.frames) {
      animFrame = 0
      animLooped = true
    }
  }
  return { anim: animName, animFrame, animCounter, animLooped }
}

function stepPlayer(s: SimState, p: ActorState, input: InputSnapshot, cfg: SimConfig): { player: ActorState; room: Vec } {
  const def = s.defs[p.def]!
  // 1-4. input, acceleration, friction, clamp (objMoveXY.update)
  const vel = stepVelocity(p.vel, input.move, def.walkAcceleration, p.frictionPercent)
  let loc: Vec = { x: p.pos.x + vel.x, y: p.pos.y + vel.y }
  // 5. collision, direction = sign of velocity (collisionMaster.checkCollisions)
  const dir = { x: Math.sign(vel.x), y: Math.sign(vel.y) }
  const before = loc
  loc = resolveTileCollision(s.grid.solidAt, loc, dir, cfg.collisionRect)
  const hitWallX = loc.x !== before.x
  const roomRect = s.grid.roomRectPx(s.room)
  if (!s.exitsOpen) loc = clampToRoom(roomRect, loc, cfg.collisionRect)
  // 6. exit test on the reg point (collisionMaster.checkLeaveScreen)
  let room = s.room
  if (s.exitsOpen) {
    const next = roomAfterMove(roomRect, loc, s.room)
    if (s.grid.roomExists(next)) room = next
  }
  // wall hits zero horizontal velocity only (objGameObject.collisionWallLeft/Right)
  const finalVel = { x: hitWallX ? 0 : vel.x, y: vel.y }
  // facing: horizontal input only (modMoveToLoc.moveHorizReaction)
  const facingLeft = input.move.x < 0 ? true : input.move.x > 0 ? false : p.facingLeft
  // 7. animation: "moving" = a move key held this tick
  const moving = input.move.x !== 0 || input.move.y !== 0
  const set = s.anims[def.name]
  const animName = moving && set?.['walk'] ? 'walk' : 'stand'
  const anim = advanceAnim(p, animName, set?.[animName])
  return { player: { ...p, pos: loc, prevPos: p.pos, vel: finalVel, facingLeft, ...anim }, room }
}

/** Store the old room's non-player actors, then restore the new room's or spawn it on a first visit. */
function changeRoom(s: SimState, from: Vec, to: Vec): SimState {
  const fromKey = roomKey(from)
  const toKey = roomKey(to)
  const player = s.actors.find((a) => a.id === s.playerId)!
  const stored = s.rooms[fromKey] ?? { spawned: true, actors: [], graves: [], clear: false }
  let next: SimState = {
    ...s,
    room: to,
    actors: [player],
    rooms: { ...s.rooms, [fromKey]: { ...stored, actors: s.actors.filter((a) => a.id !== s.playerId) } },
  }
  const target = next.rooms[toKey]
  if (target?.spawned) {
    return { ...next, actors: [player, ...target.actors], rooms: { ...next.rooms, [toKey]: { ...target, actors: [] } } }
  }
  return spawnRoomActors(next, to)
}

export function stepSim(s: SimState, input: InputSnapshot, cfg: SimConfig = DEFAULT_SIM_CONFIG): SimState {
  const { player, room } = stepPlayer(s, s.actors.find((a) => a.id === s.playerId)!, input, cfg)
  // Non-player actors only animate for now (AI, attacks and movement come in later tasks).
  const actors = s.actors.map((a) => {
    if (a.id === s.playerId) return player
    return { ...a, prevPos: a.pos, ...advanceAnim(a, a.anim, stripFor(s, a)) }
  })
  const next: SimState = { ...s, tick: s.tick + 1, actors, events: [] }
  return room.x !== s.room.x || room.y !== s.room.y ? changeRoom(next, s.room, room) : next
}
