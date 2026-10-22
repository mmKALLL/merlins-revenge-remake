// Debug cheat keys (gameMaster.cheat), read with the move keys in objAiPlayer.update
// (interpretCheatKeys) while Merlin is under player control, so they apply at the start of the tick.
//  - K, #killAll: gameMaster.killAll -> teamMaster.killEnemyTeams(#aldevar) tells every member and
//    building of each team Merlin's team hates (every priority group) to die (killUnit). The
//    engine's teams hold only the current room's units. Remake: in the continuous world, where
//    every room's units are in play, only the hostiles within the player's killAllCheatRadius of
//    Merlin (plain distance) die.
//  - M, #medikit: objPlayerMerlinCharacter.medikitCollected without a medikit type restores
//    getMaxEnergy() - getEnergy(), i.e. full energy, and starts the temporary invincibility.
//    Remake (owner request): M gives Merlin one medikit instead, as collecting one does
//    (medikitCollected(#medikit): one more in stock, +25 energy, the temporary invincibility),
//    without the pickup's sound or writing.
import { MEDIKIT_CHARACTER } from '../mr-open/mr-pickup'
import { defOf, isAlive, isUnit } from './actors'
import type { ActorState, InputSnapshot } from './state'
import { killUnit } from './tick-combat'
import { bringIn, playerIn, waitingSleepers, type Tick } from './tick-context'
import { medikitCollected } from './tick-pickup'

export function stepCheats(t: Tick, input: InputSnapshot): void {
  const p = playerIn(t)
  if (!isAlive(p)) return
  if (input.cheatKillAll) killEnemiesOnScreen(t, p)
  if (input.cheatMedikit) medikitCollected(t, p, MEDIKIT_CHARACTER)
}

/** Every priority group of `team`'s hates (teamMaster.killEnemyTeams walks them all). */
function allHatedTeams(t: Tick, team: string): string[] {
  return (t.s.teams[team]?.hates ?? []).flat()
}

function killEnemiesOnScreen(t: Tick, p: ActorState): void {
  const hated = allHatedTeams(t, p.team)
  const radius = defOf(t.s, p).killAllCheatRadius
  const inReach = (a: ActorState) => t.s.worldMode === 'rooms' || Math.hypot(a.pos.x - p.pos.x, a.pos.y - p.pos.y) <= radius
  const isVictim = (a: ActorState) => hated.includes(a.team) && isUnit(t.s, a) && isAlive(a) && inReach(a)
  const victims = [...t.actors.filter(isVictim), ...waitingSleepers(t).filter(isVictim).map((a) => bringIn(t, a))]
  for (const a of victims) killUnit(t, a)
}
