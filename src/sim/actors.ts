// Actor records: creation from resolved actor data (actorMaster.startActor, objGameObject.init),
// spawning a room's objects layer (objTileLayer.activateActors, engine-mechanics-combat.md §2) and
// the per-actor collision rect (modCollisionRect: fixed for characters, dynamic for bullets).
import type { ActorDef } from '../mr-open/mr-actor-data'
import { collisionRectForFrame, type CollisionRect } from '../mr-open/mr-collision'
import { tileCentre, type Rect, type Vec } from '../mr-open/mr-geometry'
import { roomMusic } from '../mr-open/mr-sound'
import { dwellingStart } from '../mr-open/mr-residents'
import { isDead } from '../mr-open/mr-take-hit'
import { TECHNIQUE_INIT } from '../mr-open/mr-weapon-technique'
import { stripNameFor } from './anim'
import { roomKey, type ActorMode, type ActorState, type AnimationStrip, type SimState } from './state'

/** objDwelling: a building that releases residents (modResidents); hittable, no AI. */
const DWELLING_OBJ_TYPE = 'objDwelling'
/** objTypes an objects-layer symbol may spawn in this slice; others are skipped with a warning. */
const SPAWNABLE_OBJ_TYPES = new Set(['objCPUCharacter', DWELLING_OBJ_TYPE])
/** AI classes that run objAiCPU (the spell caster adds its movement layer on top, tick-caster.ts). */
export const CPU_AI_TYPES = new Set(['objAiCPU', 'objAiCPUSpellCaster'])
const FLYING_OBJ_TYPES = new Set(['objBullet', 'objSpell'])
const CHARACTER_OBJ_TYPES = new Set(['objCPUCharacter', 'objPlayerMerlinCharacter'])
/** objMusic tiles create no actor here; their track is read by roomMusicTrack on room activation. */
const MUSIC_OBJ_TYPE = 'objMusic'

/** Characters (as opposed to bullets and spells): they have energy, cooldowns and can die. */
export const isCharacter = (s: SimState, a: ActorState): boolean => CHARACTER_OBJ_TYPES.has(s.defs[a.def]?.objType ?? '')
export const isBullet = (s: SimState, a: ActorState): boolean => s.defs[a.def]?.objType === 'objBullet'
export const isSpell = (s: SimState, a: ActorState): boolean => s.defs[a.def]?.objType === 'objSpell'
export const isDwelling = (s: SimState, a: ActorState): boolean => s.defs[a.def]?.objType === DWELLING_OBJ_TYPE
/**
 * Team units: characters (#teamMembers) and dwellings (#teamBuildings). They have energy, can be
 * targeted and hit, keep exits closed while alive and stay in their room when the player leaves.
 */
export const isUnit = (s: SimState, a: ActorState): boolean => isCharacter(s, a) || isDwelling(s, a)
/** Alive for targeting, exits and hits: not dying, dead or finished (modEnergy.checkDead + death modes). */
export const isAlive = (a: ActorState): boolean => a.mode !== 'die' && a.mode !== 'dead' && a.mode !== 'finish' && !isDead(a.energy)

/** The actor's resolved definition; every actor is created from one (createActor), so it exists. */
export const defOf = (s: SimState, a: ActorState): ActorDef => s.defs[a.def]!

/** The definition with the actor's current attack installed (a multiAttack unit may be using its natural one). */
export function armedDefOf(s: SimState, a: ActorState): ActorDef {
  const def = defOf(s, a)
  return a.useNatural ? { ...def, attack: def.naturalAttack } : def
}

/** moveHorizReaction: facing follows horizontal movement; no horizontal movement keeps it. */
export function faceAlong(a: ActorState, dx: number): void {
  if (dx < 0) a.facingLeft = true
  else if (dx > 0) a.facingLeft = false
}

/** The player actor (found by id, which is fixed at createSim). */
export function playerOf(s: SimState): ActorState {
  const p = s.actors.find((a) => a.id === s.playerId)
  if (!p) throw new Error('sim state has no player actor')
  return p
}

const initialMode = (def: ActorDef): ActorMode => (FLYING_OBJ_TYPES.has(def.objType) ? 'fly' : 'walk')
/** The strip an actor starts on: characters stand still (objGameObject initMode #stand), bullets and spells fly. */
const initialAnim = (s: SimState, def: ActorDef): string =>
  stripNameFor(s.anims[def.name], initialMode(def), false, def.objType === 'objSpell')

/** Creates an actor at `pos` from `defs[defKey]` and allocates its id; returns it with the updated state. */
export function createActor(s: SimState, defKey: string, pos: Vec): [ActorState, SimState] {
  const def = s.defs[defKey]
  if (!def) throw new Error(`no actor definition for "${defKey}"`)
  const mode = initialMode(def)
  const anim = initialAnim(s, def)
  const actor: ActorState = {
    id: s.nextId,
    def: defKey,
    team: def.team,
    pos: { ...pos },
    prevPos: { ...pos },
    home: { ...pos },
    vel: { x: 0, y: 0 },
    facingLeft: false,
    mode,
    anim,
    animFrame: 0,
    animCounter: 0,
    animExtend: 0,
    animExtendCount: 0,
    animLooped: false,
    energy: def.energy,
    regenCounter: 0,
    cooldown: 0,
    useNatural: false,
    otherCooldown: 0,
    stall: 0,
    frictionPercent: { ...def.friction },
    knockback: { x: 0, y: 0 },
    ai: {
      mode: def.aiType !== null && CPU_AI_TYPES.has(def.aiType) ? 'findTarget' : 'none',
      targetId: null,
      retargetCounter: 0,
      pathMode: 'beeline',
      waypoint: null,
      pathStall: 0,
      scenicTicks: 0,
      moveTarget: null,
      walkTicks: 0,
      detourTicks: 0,
      detourGoal: null,
      idleTicks: 0,
      wanderGoal: null,
      chargeKind: null,
    },
    ownerId: null,
    targetId: null,
    targetPoint: null,
    charge: 0,
    chargeMax: 0,
    summonReserved: 0,
    attack: null,
    age: 0,
    technique: TECHNIQUE_INIT,
    dwelling: def.objType === DWELLING_OBJ_TYPE ? dwellingStart(def) : null,
    awake: true,
    wakeHold: 0,
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
      if (def.objType === MUSIC_OBJ_TYPE) continue
      if (!SPAWNABLE_OBJ_TYPES.has(def.objType)) {
        warnOnce(symbol, `objType ${def.objType} is not spawnable yet`)
        continue
      }
      if (s.grid.solidAt(wx, wy)) continue
      const [actor, after] = createActor(next, symbol, tileCentre(wx, wy))
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

/** Continuous world: every room's objects layer spawned at once, row of rooms by row of rooms. */
export function spawnAllRooms(s: SimState): SimState {
  let next = s
  const { mapSize } = s.grid.map
  for (let y = 1; y <= mapSize.y; y++) {
    for (let x = 1; x <= mapSize.x; x++) next = spawnRoomActors(next, { x, y })
  }
  return next
}

/** Calls `fn` with the objects-layer symbol of every tile of `room`, row-major. */
function forEachRoomSymbol(s: SimState, room: Vec, fn: (symbol: string) => void): void {
  const { roomSize } = s.grid.map
  for (let ty = 1; ty <= roomSize.y; ty++) {
    for (let tx = 1; tx <= roomSize.x; tx++) {
      const symbol = s.grid.objectSymbolAt((room.x - 1) * roomSize.x + tx, (room.y - 1) * roomSize.y + ty)
      if (symbol !== null) fn(symbol)
    }
  }
}

/**
 * The music `room`'s activation asks for (objMusic.start -> soundMaster.playMusic, on the first
 * entry and every re-entry via objRoom.restoreState): a track, null for musicOff, or undefined when
 * the room has no music tile and the current track keeps playing.
 */
export function roomMusicTrack(s: SimState, room: Vec): string | null | undefined {
  const tracks: (string | null)[] = []
  forEachRoomSymbol(s, room, (symbol) => {
    const def = s.defs[symbol]
    if (def?.objType === MUSIC_OBJ_TYPE) tracks.push(def.musicTrack)
  })
  return roomMusic(tracks)
}

/** The actor's current strip: its anim, else stand, else walk (objAnimSet.symExistsOrDefault), else the atlas's first strip. */
export function stripFor(s: SimState, actor: ActorState): AnimationStrip | undefined {
  const set = s.anims[s.defs[actor.def]?.name ?? '']
  if (!set) return undefined
  return set[actor.anim] ?? set['stand'] ?? set['walk'] ?? Object.values(set)[0]
}

/**
 * modCollisionRect.calcCollisionRect: the rect comes from a frame's size
 * (initRectFromCurrentImage). Only bullets are `collisionRectType #dynamic` (objBullet) and
 * recompute it from the current frame; everything else is `#fixed`, computed once on the first
 * collision check, when a character still shows its stand frame. So a character's rect never
 * follows a wider attack frame (the warrior's 27 px sword swing).
 */
export function collisionRectFor(s: SimState, actor: ActorState): CollisionRect {
  const def = s.defs[actor.def]
  if (!def) throw new Error(`no actor definition for "${actor.def}"`)
  const anim = def.objType === 'objBullet' ? actor.anim : initialAnim(s, def)
  const strip = stripFor(s, { ...actor, anim })
  if (!strip) throw new Error(`actor ${actor.id} (${actor.def}) has no animation strips for "${anim}"`)
  const r = collisionRectForFrame(strip.w, strip.h, strip.reg?.x, strip.reg?.y)
  // remake: collisionRectScale shrinks or grows the rect about the reg point (goblinArrow 0.5)
  const k = def.collisionRectScale
  return k === 1 ? r : { left: r.left * k, top: r.top * k, right: r.right * k, bottom: r.bottom * k }
}

/** Sprite bounding rect at the actor's position (objGameObject.getRect / SpriteGetRect), from the current strip's frame size. */
export function spriteRectFor(s: SimState, actor: ActorState): Rect {
  const strip = stripFor(s, actor)
  if (!strip) throw new Error(`actor ${actor.id} (${actor.def}) has no animation strips for "${actor.anim}"`)
  const { x, y } = actor.pos
  const reg = strip.reg ?? { x: strip.w / 2, y: strip.h / 2 }
  // a mirrored sprite flips about its reg point
  const left = actor.facingLeft ? x - (strip.w - reg.x) : x - reg.x
  return { left, top: y - reg.y, right: left + strip.w, bottom: y - reg.y + strip.h }
}
