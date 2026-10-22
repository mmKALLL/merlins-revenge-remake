// The reserve army in the tick (spells notes §5): allies teleport out into it (modArmyUnit.
// armyTeleportOut: hit by a blank army summon blast, or a #leaveWhenFinished unit whose AI finds no
// target), and the army summon brings them back teleporting in (tick-spell.ts summonPayload). A
// teleport plays for TELEPORT_TICKS (modTeleport) while the unit goes on acting.
import { TELEPORT_TICKS, recordUnits } from '../mr-open/mr-army'
import { defOf, isAlive } from './actors'
import type { ActorState } from './state'
import type { Tick } from './tick-context'

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
  const fightOver = t.s.worldMode === 'rooms' ? t.s.exitsOpen : t.s.navMode
  if (targetsDead || fightOver) teleportOut(t, a)
}

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
