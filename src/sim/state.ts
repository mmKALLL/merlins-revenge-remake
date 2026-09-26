import type { ActorDef, AttackDef } from '../mr-open/mr-actor-data'
import { PLAYER_COLLISION_RECT, type CollisionRect } from '../mr-open/mr-collision'
import type { Vec } from '../mr-open/mr-geometry'
import type { TeamDef } from '../mr-open/mr-team-data'
import type { TechniqueState } from '../mr-open/mr-weapon-technique'
import type { Rng } from './rng'
import type { WorldGrid } from './world-grid'

export const TICKS_PER_SECOND = 30
export const TICK_MS = 1000 / TICKS_PER_SECOND

export interface InputSnapshot {
  move: Vec // components -1, 0, 1 (opposite keys cancel)
  mouseWorld: Vec | null
  chargeHeld: boolean // Space or left mouse button: charge, release at the mouse
  shootNearest: boolean // E: charge, release at the nearest hostile
  shootShort: boolean // F: charge, release 16 px short of the nearest hostile
}

export const NO_INPUT: InputSnapshot = {
  move: { x: 0, y: 0 },
  mouseWorld: null,
  chargeHeld: false,
  shootNearest: false,
  shootShort: false,
}

export interface AnimationStrip {
  frames: number
  delay: number // ticks per frame
  w: number // frame size in px (first frame of the strip)
  h: number
}

export interface AnimationSet {
  /** animation name -> strip */
  [name: string]: AnimationStrip
}

export type ActorMode =
  | 'stand' | 'walk' | 'weaponMelee' | 'weaponRanged' | 'charge' | 'release' | 'reel'
  | 'die' | 'dead' | 'finish' | 'fly' | 'land' | 'explode'

/**
 * detourPause / detourMove: the remake's random spreading detour (tick-ai.ts stepDetour), not in
 * the original AI: stand still, then walk a short way in a random direction, then retarget.
 */
export type AiMode = 'findTarget' | 'moveToAttack' | 'attack' | 'dazed' | 'none' | 'detourPause' | 'detourMove'

/** Which input started the player's current charge; decides the release target (null when not charging). */
export type ChargeKind = 'mouse' | 'nearest' | 'short'

export interface AiState {
  mode: AiMode
  targetId: number | null
  retargetCounter: number // ticks since last retarget (retarget at 30)
  pathMode: 'beeline' | 'scenic'
  waypoint: Vec | null
  pathStall: number // consecutive stalled ticks (switches path mode at ActorDef.pathFindingStallTime)
  scenicTicks: number // remake cutoff: ticks walked on the current #scenic leg (ends at ActorDef.scenicMaxTicks)
  moveTarget: Vec | null // modMoveToLoc target; null = not moving
  walkTicks: number // remake detour: consecutive ticks spent walking toward the target
  detourTicks: number // remake detour: pause ticks left in detourPause, then ticks walked in detourMove
  detourGoal: Vec | null // remake detour: where detourMove walks to
  chargeKind: ChargeKind | null // player only
}

export interface ActorState {
  id: number
  def: string // key into defs
  team: string
  pos: Vec
  prevPos: Vec
  vel: Vec
  facingLeft: boolean
  mode: ActorMode
  anim: string
  animFrame: number // 0-based
  animCounter: number // ticks shown on this frame
  animExtend: number // extra ticks added to the current frame (objAnimStrip.extendDelay); 0 on a new frame
  animExtendCount: number // extendDelay calls on the current frame
  animLooped: boolean // set on the tick the strip wrapped
  energy: number
  regenCounter: number
  cooldown: number // remaining counter units; ready when <= 0
  stall: number // objMoveXY stall counter (reel end at 10)
  frictionPercent: Vec
  knockback: Vec // player only: push from hits, decaying by frictionReel separately from walking (see applyHit)
  ai: AiState
  // projectiles and spells
  ownerId: number | null
  targetId: number | null
  targetPoint: Vec | null
  charge: number // spell charge (objSpell pCurrentCharge)
  attack: AttackDef | null // spell: copy of the caster's attack (objSpell.setSpellProperties); null otherwise
  age: number // ticks in the current mode for timed modes (land, explode, player die)
  technique: TechniqueState // modWeaponTechnique counter and cache
}

export interface RoomState {
  spawned: boolean
  actors: ActorState[] // living characters stored when the player leaves; empty while the room is current
  graves: { def: string; pos: Vec }[]
  clear: boolean
}

export type SimEvent =
  | { kind: 'explode'; pos: Vec; radius: number }
  | { kind: 'hit'; id: number }
  | { kind: 'died'; id: number }
  | { kind: 'exitsOpened' }
  /** a one-shot effect (soundMaster.playSound); volume 0-255 */
  | { kind: 'sound'; name: string; volume: number }
  /** room activation with a music tile (soundMaster.playMusic); null = musicOff stops the music */
  | { kind: 'music'; track: string | null }

export interface SimState {
  tick: number
  grid: WorldGrid
  defs: Record<string, ActorDef>
  teams: Record<string, TeamDef>
  anims: Record<string, AnimationSet> // sprite name (ActorDef.name) -> strips
  room: Vec
  rooms: Record<string, RoomState> // key `${x},${y}`
  exitsOpen: boolean
  navMode: boolean // modNavMode: the player walks with navModeAcceleration while the room is clear (exits open)
  actors: ActorState[]
  nextId: number
  rng: Rng
  playerId: number
  restartRequested: boolean
  events: SimEvent[] // per tick, for rendering/sound (cleared each tick)
}

export const roomKey = (room: Vec): string => `${room.x},${room.y}`

export interface SimConfig {
  // TODO(Task 8): derive from frame via collisionRectFor; the player uses this fixed rect until then
  collisionRect: CollisionRect
}

export const DEFAULT_SIM_CONFIG: SimConfig = { collisionRect: PLAYER_COLLISION_RECT }
