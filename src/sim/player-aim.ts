// Where Merlin aims (objAiPlayer.getTargetLoc: the mouse), with the remake's Space modes: the
// nearest hostile or the farthest hostile.
import type { Rect, Vec } from '../mr-open/mr-geometry'
import { hatedTeams, type Targetable } from '../mr-open/mr-targeting'
import type { ActorState, ChargeKind, InputSnapshot } from './state'
import { actorIn, sleeperIn, type Tick } from './tick-context'
import { nearestHostileId, targetables } from './tick-ai'
import { insideRect, viewRect, type Size } from './view'

/** Release distance straight ahead when neither the mouse nor a hostile gives a target. */
const AHEAD_PX = 100

/** The input flag that holds each kind of charge; checked in this order when a charge starts. */
const CHARGE_INPUT: Record<ChargeKind, 'chargeHeld' | 'shootNearest' | 'shootFarthest'> = {
  mouse: 'chargeHeld',
  nearest: 'shootNearest',
  farthest: 'shootFarthest',
}

export const isHeld = (input: InputSnapshot, kind: ChargeKind | null): boolean => kind !== null && input[CHARGE_INPUT[kind]]

/** The attack input held this tick (E or a click, Space by its mode), null for none. */
export function chargeKindFor(input: InputSnapshot): ChargeKind | null {
  for (const kind of Object.keys(CHARGE_INPUT) as ChargeKind[]) if (input[CHARGE_INPUT[kind]]) return kind
  return null
}

/**
 * Where Merlin aims: the mouse (else straight ahead), the nearest hostile or the farthest hostile. In a continuous world (remake) only hostiles inside the play view count; in
 * rooms the room is the view. Without a hostile in sight every kind aims like the mouse.
 */
export function aimPoint(t: Tick, p: ActorState, input: InputSnapshot, kind: ChargeKind | null, view: Size): Vec {
  const ahead = { x: p.pos.x + (p.facingLeft ? -AHEAD_PX : AHEAD_PX), y: p.pos.y }
  const mouse = input.mouseWorld ?? ahead
  if (kind === null || kind === 'mouse') return mouse
  const target = kind === 'farthest' ? farthestHostileOnScreen(t, p, view) : nearestHostileOnScreen(t, p, view)
  return target ? { ...target.pos } : mouse
}

/** What Merlin can see: the play view in a continuous world, null (the whole room) in rooms. */
const sightOf = (t: Tick, p: ActorState, view: Size): Rect | null => (t.s.worldMode === 'continuous' ? viewRect(t.s, p.pos, view) : null)

/** The actor (or waiting sleeper) with an id; undefined for null. */
const hostileById = (t: Tick, id: number | null): ActorState | undefined => (id === null ? undefined : (actorIn(t, id) ?? sleeperIn(t, id)))

/** The nearest hostile Merlin can see: in the room, or (continuous world) inside the play view; undefined for none. */
export function nearestHostileOnScreen(t: Tick, p: ActorState, view: Size): ActorState | undefined {
  return hostileById(t, nearestHostileId(t, p, true, sightOf(t, p, view)))
}

/**
 * Remake (the farthest Space mode): the farthest hostile Merlin can see, from the same candidates
 * as nearestHostileOnScreen (living units of the teams he hates, sleepers included); undefined for none.
 */
export function farthestHostileOnScreen(t: Tick, p: ActorState, view: Size): ActorState | undefined {
  const sight = sightOf(t, p, view)
  const candidates = targetables(t, true).filter((c) => !sight || insideRect(c.pos, sight))
  return hostileById(t, farthestTarget(p, candidates, hatedTeams(p.team, t.s.teams)))
}

/** findTarget turned around: the farthest living member of a hated team by squared distance; ties keep the first. */
function farthestTarget(me: ActorState, candidates: readonly Targetable[], hated: readonly string[]): number | null {
  let best: number | null = null
  let bestD = -1
  for (const c of candidates) {
    if (c.id === me.id || !c.alive || !hated.includes(c.team)) continue
    const d = (c.pos.x - me.pos.x) ** 2 + (c.pos.y - me.pos.y) ** 2
    if (d > bestD) {
      bestD = d
      best = c.id
    }
  }
  return best
}
