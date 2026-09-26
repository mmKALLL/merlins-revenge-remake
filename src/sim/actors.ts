// Actor records: creation from resolved actor data (actorMaster.startActor, objGameObject.init),
// spawning a room's objects layer (objTileLayer.activateActors, engine-mechanics-combat.md §2) and
// the per-actor collision rect (modCollisionRect.initRectFromCurrentImage).
import { collisionRectForFrame, type CollisionRect } from '../mr-open/mr-collision'
import { TILE_PX, type Rect, type Vec } from '../mr-open/mr-geometry'
import { stripNameFor } from './anim'
import { roomKey, type ActorMode, type ActorState, type AnimationStrip, type SimState } from './state'

/** objTypes an objects-layer symbol may spawn in this slice; others are skipped with a warning. */
const SPAWNABLE_OBJ_TYPES = new Set(['objCPUCharacter'])
const FLYING_OBJ_TYPES = new Set(['objBullet', 'objSpell'])
const CHARACTER_OBJ_TYPES = new Set(['objCPUCharacter', 'objPlayerMerlinCharacter'])

/** Characters (as opposed to bullets and spells): they have energy, cooldowns and can die. */
export const isCharacter = (s: SimState, a: ActorState): boolean => CHARACTER_OBJ_TYPES.has(s.defs[a.def]?.objType ?? '')
export const isBullet = (s: SimState, a: ActorState): boolean => s.defs[a.def]?.objType === 'objBullet'
export const isSpell = (s: SimState, a: ActorState): boolean => s.defs[a.def]?.objType === 'objSpell'
/** Alive for targeting, exits and hits: not dying, dead or finished (modEnergy.checkDead + death modes). */
export const isAlive = (a: ActorState): boolean => a.mode !== 'die' && a.mode !== 'dead' && a.mode !== 'finish' && a.energy > 0

/** The player actor (found by id, which is fixed at createSim). */
export function playerOf(s: SimState): ActorState {
  const p = s.actors.find((a) => a.id === s.playerId)
  if (!p) throw new Error('sim state has no player actor')
  return p
}

/** Creates an actor at `pos` from `defs[defKey]` and allocates its id; returns it with the updated state. */
export function createActor(s: SimState, defKey: string, pos: Vec): [ActorState, SimState] {
  const def = s.defs[defKey]
  if (!def) throw new Error(`no actor definition for "${defKey}"`)
  const mode: ActorMode = FLYING_OBJ_TYPES.has(def.objType) ? 'fly' : 'walk'
  const set = s.anims[def.name]
  const anim = stripNameFor(set, mode, false, def.objType === 'objSpell')
  const actor: ActorState = {
    id: s.nextId,
    def: defKey,
    team: def.team,
    pos: { ...pos },
    prevPos: { ...pos },
    vel: { x: 0, y: 0 },
    facingLeft: false,
    mode,
    anim,
    animFrame: 0,
    animCounter: 0,
    animLooped: false,
    energy: def.energy,
    regenCounter: 0,
    cooldown: 0,
    stall: 0,
    frictionPercent: { ...def.friction },
    ai: {
      mode: def.aiType === 'objAiCPU' ? 'findTarget' : 'none',
      targetId: null,
      retargetCounter: 0,
      pathMode: 'beeline',
      waypoint: null,
      pathStall: 0,
      moveTarget: null,
      chargeKind: null,
    },
    ownerId: null,
    targetId: null,
    targetPoint: null,
    charge: 0,
    attack: null,
    age: 0,
  }
  return [actor, { ...s, nextId: s.nextId + 1 }]
}

// Symbols already reported as skipped, so a map full of unported objects warns once per key.
const warnedSymbols = new Set<string>()

function warnOnce(symbol: string, why: string): void {
  if (warnedSymbols.has(symbol)) return
  warnedSymbols.add(symbol)
  console.warn(`objects layer: skipping "${symbol}" (${why})`)
}

/**
 * Spawns the actors of `room`'s objects layer (row-major, reg point at the tile centre) unless the
 * room was spawned before. `player` tiles spawn nothing while a player exists; symbols without a
 * definition or with an unported objType are skipped; a solid tile under the spawn point cancels it
 * (actorMaster.checkCollisionsWithSolidArea).
 */
export function spawnRoomActors(s: SimState, room: Vec): SimState {
  const key = roomKey(room)
  if (s.rooms[key]?.spawned) return s
  let next: SimState = s
  const spawned: ActorState[] = []
  const { roomSize } = s.grid.map
  for (let ty = 1; ty <= roomSize.y; ty++) {
    for (let tx = 1; tx <= roomSize.x; tx++) {
      const wx = (room.x - 1) * roomSize.x + tx
      const wy = (room.y - 1) * roomSize.y + ty
      const symbol = s.grid.objectSymbolAt(wx, wy)
      if (symbol === null) continue
      if (symbol === 'player') {
        if (next.actors.some((a) => a.id === next.playerId)) continue
        warnOnce(symbol, 'the player is created by createSim')
        continue
      }
      const def = s.defs[symbol]
      if (!def) {
        warnOnce(symbol, 'no actor definition')
        continue
      }
      if (!SPAWNABLE_OBJ_TYPES.has(def.objType)) {
        warnOnce(symbol, `objType ${def.objType} is not spawnable yet`)
        continue
      }
      if (s.grid.solidAt(wx, wy)) continue
      const pos = { x: (wx - 1) * TILE_PX + TILE_PX / 2, y: (wy - 1) * TILE_PX + TILE_PX / 2 }
      const [actor, after] = createActor(next, symbol, pos)
      spawned.push(actor)
      next = after
    }
  }
  return {
    ...next,
    actors: [...next.actors, ...spawned],
    rooms: { ...next.rooms, [key]: { spawned: true, actors: [], graves: [], clear: false } },
  }
}

/** The actor's current strip: its anim, else stand, else walk (objAnimSet.symExistsOrDefault), else the atlas's first strip. */
export function stripFor(s: SimState, actor: ActorState): AnimationStrip | undefined {
  const set = s.anims[s.defs[actor.def]?.name ?? '']
  if (!set) return undefined
  return set[actor.anim] ?? set['stand'] ?? set['walk'] ?? Object.values(set)[0]
}

/** Collision rect from the current frame's size (modCollisionRect.initRectFromCurrentImage). */
export function collisionRectFor(s: SimState, actor: ActorState): CollisionRect {
  const strip = stripFor(s, actor)
  if (!strip) throw new Error(`actor ${actor.id} (${actor.def}) has no animation strips for "${actor.anim}"`)
  return collisionRectForFrame(strip.w, strip.h)
}

/** Sprite bounding rect at the actor's position (objGameObject.getRect / SpriteGetRect), from the current strip's frame size. */
export function spriteRectFor(s: SimState, actor: ActorState): Rect {
  const strip = stripFor(s, actor)
  if (!strip) throw new Error(`actor ${actor.id} (${actor.def}) has no animation strips for "${actor.anim}"`)
  const { x, y } = actor.pos
  return { left: x - strip.w / 2, top: y - strip.h / 2, right: x + strip.w / 2, bottom: y + strip.h / 2 }
}
