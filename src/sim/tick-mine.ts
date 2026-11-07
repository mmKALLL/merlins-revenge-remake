// Mines (objMine with modExploder; spells notes §5, enemies-3 "Pit monsters"): #stand while priming,
// then #primed, checking every few ticks for a hated unit within the trigger radius
// (teamMaster.findTargetWithin), then the explosion (#mineTriggered) and the explode strip, after
// which the mine is gone (dieOnExplode) or stands and primes again (the pit monster). The timings
// and radius are the mine's data (objMine.new defaults).
import { distance } from '../mr-open/mr-geometry'
import type { ActorDef } from '../mr-open/mr-actor-data'
import { defOf, isMine } from './actors'
import type { ActorState } from './state'
import { actorIn, type Tick } from './tick-context'
import { nearestHostileId } from './tick-ai'
import { explodeBullet, lingerExplosion } from './tick-combat'

export function stepMines(t: Tick): void {
  for (const a of t.actors) {
    if (t.removed.has(a.id) || !isMine(t.s, a)) continue
    const def = defOf(t.s, a)
    if (a.mode === 'stand') prime(a, def)
    else if (a.mode === 'primed') watch(t, a, def)
    else if (a.mode === 'explode') {
      lingerExplosion(t, a)
      if (a.animLooped) explodeFinished(t, a, def)
    }
  }
}

/** objMine.updatePrime: primed after timeToPrime ticks. */
function prime(a: ActorState, def: ActorDef): void {
  a.age++
  if (a.age < def.timeToPrime) return
  a.mode = 'primed'
  a.age = 0
}

/** objMine #primed: every timeToCheck ticks, the nearest hated unit closer than triggerRadius sets it off. */
function watch(t: Tick, a: ActorState, def: ActorDef): void {
  a.age++
  if (a.age < def.timeToCheck) return
  a.age = 0
  const id = nearestHostileId(t, a)
  const nearest = id === null ? undefined : actorIn(t, id)
  if (nearest && distance(a.pos, nearest.pos) < def.triggerRadius) explodeBullet(t, a, def)
}

/** #explodeFin: a mine that dies on exploding is gone; one that does not stands and primes again. */
function explodeFinished(t: Tick, a: ActorState, def: ActorDef): void {
  if (def.dieOnExplode) {
    t.removed.add(a.id)
    return
  }
  a.mode = 'stand'
  a.age = 0
  a.explosionHitIds = null
}
