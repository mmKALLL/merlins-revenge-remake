import type { ActorDef, AttackDef } from '../mr-open/mr-actor-data'
import { PLAYER_COLLISION_RECT, type CollisionRect } from '../mr-open/mr-collision'
import type { Vec } from '../mr-open/mr-geometry'
import type { DwellingState } from '../mr-open/mr-residents'
import type { TeamDef } from '../mr-open/mr-team-data'
import type { TechniqueState } from '../mr-open/mr-weapon-technique'
import type { Rng } from './rng'
import { PLAY_VIEW, type Size } from './view'
import type { WorldGrid } from './world-grid'

export const TICKS_PER_SECOND = 30
export const TICK_MS = 1000 / TICKS_PER_SECOND

export interface InputSnapshot {
  move: Vec // components -1, 0, 1 (opposite keys cancel)
  mouseWorld: Vec | null
  chargeHeld: boolean // E or left mouse button: charge, release at the mouse
  shootNearest: boolean // Space (F toggle off): charge, release at the nearest hostile
  shootShort: boolean // Space (F toggle on): charge, release a little short of the nearest hostile (push-back shot)
  cheatKillAll: boolean // K pressed (once per press): kill the hostile units on screen (tick-cheats.ts)
  cheatHeal: boolean // M pressed (once per press): Merlin back to full energy (tick-cheats.ts)
}

export const NO_INPUT: InputSnapshot = {
  move: { x: 0, y: 0 },
  mouseWorld: null,
  chargeHeld: false,
  shootNearest: false,
  shootShort: false,
  cheatKillAll: false,
  cheatHeal: false,
}

export interface AnimationStrip {
  frames: number
  delay: number // ticks per frame (the first frame's when `delays` is given)
  /** per-frame delays when the strip mixes them (anm_bowOrc_weaponRanged_02_01 .. _04_09); absent = `delay` for every frame */
  delays?: number[]
  w: number // frame size in px (first frame of the strip)
  h: number
  /** registration point in the first frame when known; absent = the frame centre */
  reg?: Vec
}

export interface AnimationSet {
  /** animation name -> strip */
  [name: string]: AnimationStrip
}

/** Character strips an AI attack plays (the attack's animType): weapon or natural, melee or ranged. */
export type AttackStrip = 'weaponMelee' | 'weaponRanged' | 'naturalMelee' | 'naturalRanged' | 'magicMelee'
export const ATTACK_STRIPS: ReadonlySet<string> = new Set<AttackStrip>(['weaponMelee', 'weaponRanged', 'naturalMelee', 'naturalRanged', 'magicMelee'])

export type ActorMode =
  | 'stand' | 'walk' | AttackStrip | 'charge' | 'release' | 'reel'
  | 'die' | 'dead' | 'finish' | 'fly' | 'land' | 'explode'

/**
 * detourPause / detourMove: the remake's random spreading detour (tick-ai.ts stepDetour), not in
 * the original AI: stand still, then walk a short way in a random direction, then retarget.
 * idleWander: the remake's idle wander of a sleeping unit near the view in a continuous world
 * (idle-wander.ts): walk to a random point near home, still asleep.
 */
export type AiMode = 'findTarget' | 'moveToAttack' | 'attack' | 'dazed' | 'none' | 'detourPause' | 'detourMove' | 'runReload' | 'idleWander'

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
  idleTicks: number // remake idle wander: ticks walked in idleWander
  wanderGoal: Vec | null // remake idle wander: where idleWander walks to
  chargeKind: ChargeKind | null // player only
}

export interface ActorState {
  id: number
  def: string // key into defs
  team: string
  pos: Vec
  prevPos: Vec
  home: Vec // spawn position (remake idle wander stays near it)
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
  cooldown: number // remaining counter units of the current attack; ready when <= 0
  /** multiAttack: the natural attack is the current one (else the weapon); the other's cooldown runs on in otherCooldown */
  useNatural: boolean
  otherCooldown: number
  stall: number // objMoveXY stall counter (reel end at 10)
  frictionPercent: Vec
  knockback: Vec // player only: push from hits, decaying by frictionReel separately from walking (see applyHit)
  ai: AiState
  // projectiles and spells
  ownerId: number | null
  targetId: number | null
  targetPoint: Vec | null
  charge: number // spell charge (objSpell pCurrentCharge)
  chargeMax: number // spell of a CPU caster: this cast's charge counter length (randomised for summoners)
  summonReserved: number // summon spell: team slots reserved for its payload (reservationsMaster)
  attack: AttackDef | null // spell: copy of the caster's attack (objSpell.setSpellProperties); null otherwise
  age: number // ticks in the current mode for timed modes (land, explode, player die)
  technique: TechniqueState // modWeaponTechnique counter and cache
  dwelling: DwellingState | null // objDwelling production (modResidents); null for everything else
  /** continuous world (activation.ts): a sleeping unit has no AI, movement, attacks, production or regeneration (bar an idle wander); always true in rooms mode */
  awake: boolean
  wakeHold: number // continuous world: ticks a unit hit from far away stays awake regardless of distance
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
  /** the whole map cleared or the end room cleared (gameMaster.gameComplete); emitted once */
  | { kind: 'mapComplete' }

/**
 * rooms: the original room-by-room play (store/restore, exits, room-cleared jingle). continuous
 * (remake feature, ?camera=follow): the whole map is one room with every unit spawned at the start
 * and units far from Merlin asleep (activation.ts).
 */
export type WorldMode = 'rooms' | 'continuous'

export interface SimState {
  tick: number
  worldMode: WorldMode
  grid: WorldGrid
  defs: Record<string, ActorDef>
  teams: Record<string, TeamDef>
  anims: Record<string, AnimationSet> // sprite name (ActorDef.name) -> strips
  room: Vec // continuous world: the room Merlin stands in (music, grave storage)
  rooms: Record<string, RoomState> // key `${x},${y}`
  exitsOpen: boolean
  navMode: boolean // modNavMode: the player walks with navModeAcceleration while the room is clear (exits open)
  actors: ActorState[]
  nextId: number
  rng: Rng
  playerId: number
  restartRequested: boolean
  /** gameMaster.gameComplete has run (map-complete.ts): units no longer act; the presentation takes over */
  mapComplete: boolean
  events: SimEvent[] // per tick, for rendering/sound (cleared each tick)
}

export const roomKey = (room: Vec): string => `${room.x},${room.y}`

/** A sleeping unit walking an idle wander (idle-wander.ts): the tick steps and animates it like an awake one. */
export const isSleepWandering = (a: ActorState): boolean => !a.awake && a.ai.mode === 'idleWander'

/** Whether the tick steps the actor: every awake one and the sleepers walking an idle wander. */
export const isStepped = (a: ActorState): boolean => a.awake || a.ai.mode === 'idleWander'

export interface SimConfig {
  // TODO(Task 8): derive from frame via collisionRectFor; the player uses this fixed rect until then
  collisionRect: CollisionRect
  /** the play view in px: in a continuous world, Space's nearest-enemy shot only aims at units inside it */
  view: Size
}

export const DEFAULT_SIM_CONFIG: SimConfig = { collisionRect: PLAYER_COLLISION_RECT, view: PLAY_VIEW }
