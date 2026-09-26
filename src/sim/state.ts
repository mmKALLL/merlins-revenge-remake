import type { Vec } from '../mr-open/mr-map-format'
import { PLAYER_WALK_ACCELERATION } from '../mr-open/mr-movement'
import type { WorldGrid } from './world-grid'

export const TICKS_PER_SECOND = 30
export const TICK_MS = 1000 / TICKS_PER_SECOND

export interface InputSnapshot {
  move: Vec // components -1, 0, 1 (opposite keys cancel)
  mouseWorld: Vec | null
  chargeHeld: boolean // Space or left mouse button (reserved)
  shootNearest: boolean // E (reserved)
  shootShort: boolean // F (reserved)
}

export const NO_INPUT: InputSnapshot = {
  move: { x: 0, y: 0 },
  mouseWorld: null,
  chargeHeld: false,
  shootNearest: false,
  shootShort: false,
}

export interface AnimationSet {
  /** animation name -> frame count and delay in ticks */
  [name: string]: { frames: number; delay: number }
}

export interface PlayerState {
  pos: Vec
  prevPos: Vec
  vel: Vec
  facingLeft: boolean
  anim: string
  animFrame: number // 0-based
  animCounter: number // ticks shown on this frame
}

export interface SimState {
  tick: number
  grid: WorldGrid
  room: Vec
  exitsOpen: boolean
  player: PlayerState
  anims: AnimationSet
}

export interface SimConfig {
  walkAcceleration: number
}

export const DEFAULT_SIM_CONFIG: SimConfig = { walkAcceleration: PLAYER_WALK_ACCELERATION }
