// Where Merlin aims (objAiPlayer.getTargetLoc: the mouse), with the remake's Space modes: the
// nearest hostile, or a little short of it (a push-back shot).
import type { Vec } from '../mr-open/mr-geometry'
import type { ActorState, ChargeKind, InputSnapshot } from './state'
import { actorIn, sleeperIn, type Tick } from './tick-context'
import { nearestHostileId } from './tick-ai'
import { viewRect, type Size } from './view'

/** Release distance straight ahead when neither the mouse nor a hostile gives a target. */
const AHEAD_PX = 100
/** The push-back shot (Space with the F toggle on) lands this many px short of the nearest hostile, toward the player. */
const SHORT_PX = 18

/** The input flag that holds each kind of charge; checked in this order when a charge starts. */
const CHARGE_INPUT: Record<ChargeKind, 'chargeHeld' | 'shootNearest' | 'shootShort'> = {
  mouse: 'chargeHeld',
  nearest: 'shootNearest',
  short: 'shootShort',
}

export const isHeld = (input: InputSnapshot, kind: ChargeKind | null): boolean => kind !== null && input[CHARGE_INPUT[kind]]

/** The attack input held this tick (E or a click, Space by its mode), null for none. */
export function chargeKindFor(input: InputSnapshot): ChargeKind | null {
  for (const kind of Object.keys(CHARGE_INPUT) as ChargeKind[]) if (input[CHARGE_INPUT[kind]]) return kind
  return null
}

/**
 * Where Merlin aims: the mouse (else straight ahead), the nearest hostile, or SHORT_PX short of it.
 * In a continuous world (remake) only hostiles inside the play view count; in rooms the room is the view.
 */
export function aimPoint(t: Tick, p: ActorState, input: InputSnapshot, kind: ChargeKind | null, view: Size): Vec {
  const ahead = { x: p.pos.x + (p.facingLeft ? -AHEAD_PX : AHEAD_PX), y: p.pos.y }
  const mouse = input.mouseWorld ?? ahead
  if (kind !== 'nearest' && kind !== 'short') return mouse
  const onScreen = t.s.worldMode === 'continuous' ? viewRect(t.s, p.pos, view) : null
  const nearestId = nearestHostileId(t, p, true, onScreen)
  const nearest = nearestId === null ? undefined : (actorIn(t, nearestId) ?? sleeperIn(t, nearestId))
  if (!nearest) return mouse
  if (kind === 'nearest') return { ...nearest.pos }
  const dx = nearest.pos.x - p.pos.x
  const dy = nearest.pos.y - p.pos.y
  const d = Math.hypot(dx, dy)
  if (d <= SHORT_PX) return { ...p.pos }
  return { x: nearest.pos.x - (dx / d) * SHORT_PX, y: nearest.pos.y - (dy / d) * SHORT_PX }
}
