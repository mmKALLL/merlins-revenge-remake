// Pickups in the tick (docs/notes/engine-mechanics-potions.md): Merlin collects a potion or medikit
// by touching it (objAiPowerUp.update -> CollisionCheck), the collected writing fades out and goes
// (modFader), a medikit in stock heals him while he is hurt (modMedikit.update) and the temporary
// invincibility of a pickup counts down (modInvince.update).
import { collisionCheck, rectAt } from '../mr-open/mr-collision'
import {
  BONUS_ENERGY, POTION_OBJ_TYPE, SCROLL_OBJ_TYPE, TEMP_INVINCE_TICKS, WRITING_FADE_TICKS, collectMedikit, drinkPotion, medikitStep,
} from '../mr-open/mr-pickup'
import { DEFAULT_VOLUME } from '../mr-open/mr-sound'
import { collisionRectFor, defOf, isAlive, isPickup } from './actors'
import type { ActorState } from './state'
import { playSound, playerIn, type Tick } from './tick-context'
import { collectScroll } from './tick-weapons'

/** modInvince.startTempInvince: invincible for TEMP_INVINCE_TICKS from now. */
export function startTempInvince(t: Tick): void {
  t.pickups = { ...t.pickups, invinceTicks: TEMP_INVINCE_TICKS }
}

/** modInvince.getInvinceActive for Merlin. */
export const isInvincible = (t: Tick): boolean => t.pickups.invinceTicks > 0

export function stepPickups(t: Tick): void {
  const p = playerIn(t)
  for (const a of t.actors) {
    if (t.removed.has(a.id) || !isPickup(t.s, a)) continue
    if (a.mode === 'collected') fadeWriting(t, a)
    else if (touchesPlayer(t, a, p)) collect(t, a, p)
  }
  stepMedikit(t, p)
  if (isInvincible(t)) t.pickups = { ...t.pickups, invinceTicks: t.pickups.invinceTicks - 1 }
}

/** CollisionCheck(pickup, player): Merlin's reg point inside the pickup's rect grown by his. */
const touchesPlayer = (t: Tick, a: ActorState, p: ActorState): boolean =>
  collisionCheck(rectAt(a.pos, collisionRectFor(t.s, a)), p.pos, collisionRectFor(t.s, p))

/** modFader: the writing fades out, then the pickup is gone (faderFin -> setDead). */
function fadeWriting(t: Tick, a: ActorState): void {
  a.age++
  if (a.age >= WRITING_FADE_TICKS) t.removed.add(a.id)
}

/**
 * objPowerUpWriting.collected (writing, fade, collect sound), then objPotion.collected ->
 * potionCollected, objMedikit.collected -> medikitCollected (temporary invincibility and energy),
 * or objScroll.collected -> newScrollCollected (tick-weapons.ts).
 */
function collect(t: Tick, a: ActorState, p: ActorState): void {
  const def = defOf(t.s, a)
  a.mode = 'collected'
  a.age = 0
  playSound(t, def.collectSound, DEFAULT_VOLUME)
  if (def.objType === SCROLL_OBJ_TYPE) {
    collectScroll(t, p, def)
    return
  }
  if (def.vanishOnCollect) t.removed.add(a.id)
  startTempInvince(t)
  const maxEnergy = defOf(t.s, p).maxEnergy
  if (def.objType === POTION_OBJ_TYPE) {
    t.pickups = { ...t.pickups, potionsDrunk: drinkPotion(t.pickups.potionsDrunk, def.character ?? def.key) }
    p.energy = Math.min(p.energy + BONUS_ENERGY, maxEnergy)
    return
  }
  const healed = collectMedikit(t.pickups.medikits, def.character, p.energy, maxEnergy)
  t.pickups = { ...t.pickups, medikits: healed.medikits }
  p.energy = healed.energy
}

/** modMedikit.update, while Merlin is alive. */
function stepMedikit(t: Tick, p: ActorState): void {
  if (!isAlive(p)) return
  const r = medikitStep(t.pickups.medikits, p.energy, defOf(t.s, p).maxEnergy)
  t.pickups = { ...t.pickups, medikits: r.medikits }
  p.energy = r.energy
}
