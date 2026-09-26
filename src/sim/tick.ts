// Fixed-step simulation. Tick order follows docs/notes/engine-mechanics-walking-and-rooms.md §5-7:
// velocity (input, friction, clamp) -> tile collision (direction = sign of velocity) ->
// closed-exit clamp -> exit test on the reg point -> wall hit zeroes horizontal velocity ->
// facing from horizontal input -> animation.
import { PLAYER_COLLISION_RECT, resolveTileCollision } from '../mr-open/mr-collision'
import type { Vec } from '../mr-open/mr-map-format'
import { stepVelocity } from '../mr-open/mr-movement'
import { clampToRoom, roomAfterMove } from '../mr-open/mr-room-exit'
import { DEFAULT_SIM_CONFIG, type AnimationSet, type InputSnapshot, type SimConfig, type SimState } from './state'
import { TILE_PX, type WorldGrid } from './world-grid'

export function createSim(grid: WorldGrid, anims: AnimationSet, startPos: Vec): SimState {
  return {
    tick: 0,
    grid,
    room: grid.roomOfPoint(startPos.x, startPos.y),
    exitsOpen: true,
    anims,
    player: {
      pos: { ...startPos },
      prevPos: { ...startPos },
      vel: { x: 0, y: 0 },
      facingLeft: false,
      anim: 'stand',
      animFrame: 0,
      animCounter: 0,
    },
  }
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

export function stepSim(s: SimState, input: InputSnapshot, cfg: SimConfig = DEFAULT_SIM_CONFIG): SimState {
  const p = s.player
  // 1-4. input, acceleration, friction, clamp (objMoveXY.update)
  const vel = stepVelocity(p.vel, input.move, cfg.walkAcceleration)
  let loc: Vec = { x: p.pos.x + vel.x, y: p.pos.y + vel.y }
  // 5. collision, direction = sign of velocity (collisionMaster.checkCollisions)
  const dir = { x: Math.sign(vel.x), y: Math.sign(vel.y) }
  const before = loc
  loc = resolveTileCollision(s.grid.solidAt, loc, dir, PLAYER_COLLISION_RECT)
  const hitWallX = loc.x !== before.x
  const roomRect = s.grid.roomRectPx(s.room)
  if (!s.exitsOpen) loc = clampToRoom(roomRect, loc, PLAYER_COLLISION_RECT)
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
  const animName = moving && s.anims['walk'] ? 'walk' : 'stand'
  let animFrame = p.animFrame
  let animCounter = p.animCounter
  if (animName !== p.anim) {
    animFrame = 0
    animCounter = 0
  } else {
    const def = s.anims[animName]
    if (def) {
      animCounter++
      if (animCounter >= def.delay) {
        animCounter = 0
        animFrame = (animFrame + 1) % def.frames
      }
    }
  }
  return {
    ...s,
    tick: s.tick + 1,
    room,
    player: { pos: loc, prevPos: p.pos, vel: finalVel, facingLeft, anim: animName, animFrame, animCounter },
  }
}
