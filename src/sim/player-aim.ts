// Where Merlin aims (objAiPlayer.getTargetLoc: the mouse), with the remake's Space modes: the
// nearest hostile or the farthest hostile (a healing spell: the nearest ally, else Merlin).
import type { AttackDef } from '../mr-open/mr-actor-data'
import type { Rect, Vec } from '../mr-open/mr-geometry'
import { friendlyTeams, hatedTeams, type Targetable } from '../mr-open/mr-targeting'
import { defOf, isAlive, isCharacter } from './actors'
import type { ActorState, ChargeKind, InputSnapshot } from './state'
import { actorIn, sleeperIn, type Tick } from './tick-context'
import { nearestHostileId, targetables } from './tick-ai'
import { insideRect, viewRect, type Size } from './view'

/** Release distance straight ahead when the aim's kind finds no target (no mouse position, no hostile in sight). */
const AHEAD_PX = 100

/** The input flag that holds each kind of charge; checked in this order when a charge starts. */
const CHARGE_INPUT: Record<ChargeKind, 'chargeHeld' | 'shootNearest' | 'shootFarthest'> = {
  mouse: 'chargeHeld',
  nearest: 'shootNearest',
  farthest: 'shootFarthest',
}

export const isHeld = (input: InputSnapshot, kind: ChargeKind | null): boolean => kind !== null && input[CHARGE_INPUT[kind]]

/** The attack input held this tick (a click, Space by its mode), null for none. */
export function chargeKindFor(input: InputSnapshot): ChargeKind | null {
  for (const kind of Object.keys(CHARGE_INPUT) as ChargeKind[]) if (input[CHARGE_INPUT[kind]]) return kind
  return null
}

/**
 * Where Merlin aims: the mouse (else straight ahead), the nearest hostile or the farthest hostile. In a continuous world (remake) only hostiles inside the play view count; in
 * rooms the room is the view. Without a hostile in sight the nearest and farthest kinds aim
 * straight ahead: the mouse is never their target (owner request).
 */
export function aimPoint(t: Tick, p: ActorState, input: InputSnapshot, kind: ChargeKind | null, view: Size): Vec {
  const ahead = { x: p.pos.x + (p.facingLeft ? -AHEAD_PX : AHEAD_PX), y: p.pos.y }
  if (kind === null || kind === 'mouse') return input.mouseWorld ?? ahead
  const target = kind === 'farthest' ? farthestHostileOnScreen(t, p, view) : nearestHostileOnScreen(t, p, view)
  return target ? { ...target.pos } : ahead
}

/** A spell whose impact heals (the heal blast: #takeHeal). */
const heals = (atk: AttackDef): boolean => atk.payloadFunction.includes('takeHeal')

/**
 * Remake (owner request): where a spell of Merlin's flies. A healing spell fired by a Space mode
 * (nearest or farthest) goes to the nearest ally he can see, else to Merlin himself; the rest, and
 * every spell aimed by the mouse, as aimPoint.
 */
export function spellAimPoint(t: Tick, p: ActorState, input: InputSnapshot, kind: ChargeKind | null, view: Size, atk: AttackDef): Vec {
  if (kind === null || kind === 'mouse' || !heals(atk)) return aimPoint(t, p, input, kind, view)
  const ally = nearestFriendOnScreen(t, p, view, atk)
  return { ...(ally ?? p).pos }
}

/** The nearest living friendly character Merlin can see (not himself) of a role `atk` hits; undefined for none. */
function nearestFriendOnScreen(t: Tick, p: ActorState, view: Size, atk: AttackDef): ActorState | undefined {
  const sight = sightOf(t, p, view)
  const teams = friendlyTeams(p.team, t.s.teams)
  let nearest: ActorState | undefined
  let nearestD = Infinity
  for (const a of t.actors) {
    if (a.id === p.id || t.removed.has(a.id) || !teams.includes(a.team) || !isCharacter(t.s, a) || !isAlive(a)) continue
    if (!atk.hits.includes(defOf(t.s, a).teamRole) || (sight && !insideRect(a.pos, sight))) continue
    const d = (a.pos.x - p.pos.x) ** 2 + (a.pos.y - p.pos.y) ** 2
    if (d < nearestD) {
      nearestD = d
      nearest = a
    }
  }
  return nearest
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
