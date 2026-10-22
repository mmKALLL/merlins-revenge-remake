// The reserve army in the tick (spells notes §5): allies teleport out into it (modArmyUnit.
// armyTeleportOut: hit by a blank army summon blast, or a #leaveWhenFinished unit whose AI finds no
// target), and the army summon brings them back teleporting in (tick-spell.ts summonPayload). A
// teleport plays for TELEPORT_TICKS (modTeleport) while the unit goes on acting. The #army key (R)
// summons the whole reserve at once (modAutoSummon), or once the fight is over sends the army back
// into it (remake).
import { AUTO_SUMMON_JITTER, autoSummonTypes } from '../mr-open/mr-auto-summon'
import { TELEPORT_TICKS, recordUnits, reserveCount, takeUnit } from '../mr-open/mr-army'
import { tileOfPx } from '../mr-open/mr-collision'
import { distance, type Vec } from '../mr-open/mr-geometry'
import { defOf, isAlive } from './actors'
import { nearestHostileOnScreen } from './player-aim'
import { randomInt } from './rng'
import type { ActorState, InputSnapshot } from './state'
import { playerIn, spawn, type Tick } from './tick-context'
import { teamSlotsFree } from './tick-dwelling'
import { insideRect, viewRect, type Size } from './view'

/** modArmyUnit.armyTeleportOut: a teleportable living unit starts teleporting out (once). */
export function teleportOut(t: Tick, a: ActorState): void {
  if (!defOf(t.s, a).teleportable || a.teleport === 'out' || !isAlive(a)) return
  a.teleport = 'out'
  a.teleportAge = 0
}

/**
 * objAiCPU #noTargetFound (objAiCPU.txt:232-237): the AI found no target and either no hated unit is
 * left or the fight is over (the room is clear; in a continuous world, nav mode: no awake hostile
 * near Merlin). A #leaveWhenFinished unit (Merlin's allies) then teleports out into the reserve.
 */
export function leaveIfFinished(t: Tick, a: ActorState, targetsDead: boolean): void {
  if (!defOf(t.s, a).leaveWhenFinished) return
  if (targetsDead || fightOver(t)) teleportOut(t, a)
}

/** The fight is over: the room is clear (its exits are open), or in a continuous world nav mode is on. */
const fightOver = (t: Tick): boolean => (t.s.worldMode === 'rooms' ? t.s.exitsOpen : t.s.navMode)

/**
 * modTeleport.update: the teleport plays out; teleporting out ends in the reserve
 * (#teleportOutFinished -> armyMaster.recordUnitDetails, leaveGame: no death, no grave).
 */
export function stepTeleports(t: Tick): void {
  for (const a of t.actors) {
    if (t.removed.has(a.id) || a.teleport === null) continue
    a.teleportAge++
    if (a.teleportAge < TELEPORT_TICKS) continue
    if (a.teleport === 'out') {
      t.removed.add(a.id)
      t.army = recordUnits(t.army, a.team, a.def)
    }
    a.teleport = null
    a.teleportAge = 0
  }
}

/**
 * The #army key (R; objAiPlayer.interpretGameKeys -> modAutoSummon.summonArmy) while Merlin is
 * alive: the whole reserve summoned around the mouse (Merlin without a mouse position). Remake
 * (owner requests): while army members of Merlin's are in play, the key teleports them all out
 * into the reserve instead (armyTeleportOut each, as a blank army summon blast does), but only once
 * the fight is over; mid-fight it does nothing. Unless Space is in mouse mode the army is summoned
 * at the nearest hostile on screen (the mouse without one).
 */
export function stepArmyKey(t: Tick, input: InputSnapshot, view: Size): void {
  if (!input.armyKey) return
  const p = playerIn(t)
  if (!isAlive(p)) return
  const inPlay = armyMembersInPlay(t, p)
  if (inPlay.length === 0) summonWholeReserve(t, p, summonPoint(t, p, input, view))
  else if (fightOver(t)) for (const a of inPlay) teleportOut(t, a)
}

function summonPoint(t: Tick, p: ActorState, input: InputSnapshot, view: Size): Vec {
  const nearest = input.armyAtNearest ? nearestHostileOnScreen(t, p, view) : undefined
  return nearest?.pos ?? input.mouseWorld ?? p.pos
}

/**
 * Remake: Merlin's army member nearest to him that he can see (in the room, or inside the play view
 * in a continuous world), the aim of a blank army summon that sends one ally home; undefined for none.
 */
export function nearestAllyOnScreen(t: Tick, p: ActorState, view: Size): ActorState | undefined {
  const onScreen = t.s.worldMode === 'continuous' ? viewRect(t.s, p.pos, view) : null
  const seen = armyMembersInPlay(t, p).filter((a) => !onScreen || insideRect(a.pos, onScreen))
  let nearest: ActorState | undefined
  for (const a of seen) if (!nearest || distance(a.pos, p.pos) < distance(nearest.pos, p.pos)) nearest = a
  return nearest
}

/** Merlin's living army members (his armyMembers types on his team) in the tick that can still teleport out. */
function armyMembersInPlay(t: Tick, p: ActorState): ActorState[] {
  const types = defOf(t.s, p).armyMembers
  const canGo = (a: ActorState) => a.id !== p.id && a.team === p.team && types.includes(a.def) && isAlive(a) && a.teleport !== 'out' && defOf(t.s, a).teleportable
  return t.actors.filter((a) => !t.removed.has(a.id) && canGo(a))
}

/**
 * modAutoSummon.summonArmy: autoSummonTypes picks the units under the team cap; each comes out of
 * the reserve teleporting in (armyMaster.createUnitNum) at `at` moved up or down by random(30) - 15
 * (summonArmy sets locv twice and never loch). A solid tile refuses the unit (actorMaster.newActor
 * returns #none) and summonArmy stops there (`exit`).
 */
function summonWholeReserve(t: Tick, p: ActorState, at: Vec): void {
  const types = autoSummonTypes(teamSlotsFree(t, p.team), defOf(t.s, p).armyMembers, (typ) => reserveCount(t.army, p.team, typ))
  for (const typ of types) {
    const [r, rng] = randomInt(t.rng, AUTO_SUMMON_JITTER)
    t.rng = rng
    const pos = { x: at.x, y: at.y + r - AUTO_SUMMON_JITTER / 2 }
    const army = takeUnit(t.army, p.team, typ)
    if (!army || !t.s.defs[typ] || t.s.grid.solidAt(tileOfPx(pos.x), tileOfPx(pos.y))) return
    t.army = army
    spawn(t, typ, pos, { teleport: 'in', teleportAge: 0 })
  }
}
