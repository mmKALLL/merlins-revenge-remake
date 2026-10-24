// Energy mines (objMine with modExploder; spells notes §5): #stand while priming, then #primed,
// checking every few ticks for a hated unit within the trigger radius (teamMaster.findTargetWithin),
// then the explosion (#mineTriggered) and the explode strip, after which the mine is gone.
import { distance } from '../mr-open/mr-geometry'
import { MINE } from '../mr-open/mr-mine'
import { defOf, isMine } from './actors'
import type { ActorState } from './state'
import { actorIn, type Tick } from './tick-context'
import { nearestHostileId } from './tick-ai'
import { explodeBullet, lingerExplosion } from './tick-combat'

export function stepMines(t: Tick): void {
  for (const a of t.actors) {
    if (t.removed.has(a.id) || !isMine(t.s, a)) continue
    if (a.mode === 'stand') prime(a)
    else if (a.mode === 'primed') watch(t, a)
    else if (a.mode === 'explode') {
      lingerExplosion(t, a)
      if (a.animLooped) t.removed.add(a.id) // #explodeFin, dieOnExplode
    }
  }
}

/** objMine.updatePrime: primed after timeToPrime ticks. */
function prime(a: ActorState): void {
  a.age++
  if (a.age < MINE.timeToPrime) return
  a.mode = 'primed'
  a.age = 0
}

/** objMine #primed: every timeToCheck ticks, the nearest hated unit closer than triggerRadius sets it off. */
function watch(t: Tick, a: ActorState): void {
  a.age++
  if (a.age < MINE.timeToCheck) return
  a.age = 0
  const id = nearestHostileId(t, a)
  const nearest = id === null ? undefined : actorIn(t, id)
  if (nearest && distance(a.pos, nearest.pos) < MINE.triggerRadius) explodeBullet(t, a, defOf(t.s, a))
}
