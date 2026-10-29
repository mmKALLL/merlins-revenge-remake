// Port of the golden machine gun (docs/notes/engine-mechanics-spells.md §6): modGoldenMachineGun
// (gmgCollected, setGmg), modAttack.gmgOn (the spell's gmg* charge fields), objAiAttack.ensureSpell
// (fireDelay 0), objAiPlayer.internalEvent(#spellCharged) (autofire), objCharacter.gmgOn (the charge
// sits beside the gun) and modAnimSet.getAnimSym (Merlin holds the gun). The gun is a mode over every
// spell, switched by its own key; the remake's volleys get a gun version of their own, and the
// owner's tuning adds the muzzle, streaming mines, the army summon's lowest stage and the gun's
// rhythm (Remake decisions in the notes).
import type { Vec } from './mr-geometry'
import type { AttackDef } from './mr-actor-data'
import { stageNumber, type ChargeLimits } from './mr-spell'

/** A spell's #gmgChargeMax / #gmgChargeSpeed / #gmgChargeStart / #gmgAutoFire. */
export interface GmgCharge {
  chargeMax: number
  chargeSpeed: number
  chargeStart: number
  autoFire: boolean
  /** remake (#gmgChargeFullTicks): the gun version's chargeFullTicks (owner: cBlast every 2 s); null keeps the attack's own */
  chargeFullTicks: number | null
}

/** modGoldenMachineGun's pGmgCollected and pGmgOn. */
export interface GmgState {
  collected: boolean
  on: boolean
}

/** modGoldenMachineGun.init: not found, off. */
export const NO_GMG: GmgState = { collected: false, on: false }

/** modGoldenMachineGun.setGmg (the #gmg key): once collected, the gun flips on or off; before, nothing. */
export const setGmg = (g: GmgState): GmgState => (g.collected ? { ...g, on: !g.on } : g)

/** modGoldenMachineGun.gmgCollected: found, and setGmg: the first pickup turns it on (a second one off). */
export const gmgCollected = (g: GmgState): GmgState => setGmg({ ...g, collected: true })

/**
 * modAttack.gmgOn and objAiAttack.ensureSpell with the gmg on: the charge fields swapped for the gmg*
 * ones (chargeSpeedMax becomes gmgChargeSpeed too, so mana_flow cannot raise it) and fireDelay 0.
 */
export function gmgAttack(a: AttackDef): AttackDef {
  if (a.gmg === null) throw new Error(`${a.name}: no gmg* charge fields for the golden machine gun`)
  const { chargeMax, chargeSpeed, chargeStart } = a.gmg
  const chargeFullTicks = a.gmg.chargeFullTicks ?? a.chargeFullTicks // remake (#gmgChargeFullTicks)
  return { ...a, chargeMax, chargeSpeed, chargeStart, chargeSpeedMax: chargeSpeed, chargeFullTicks, fireDelay: 0, gmgOn: true }
}

/**
 * The spell Merlin starts with the gun on: its gmg version (gmgAttack; every original spell of his
 * has the gmg* fields). Remake: a spell without them (the remake's volleys, whose gun version is a
 * stream, src/sim/volley.ts) keeps its own charge, charging beside the gun; so does a streaming one
 * (gmgStreamSlowdown, the mines), at its own speed slowed by that factor.
 */
export function gunAttack(a: AttackDef): AttackDef {
  if (a.gmgStreamSlowdown > 0) return streamingGunAttack(a)
  return a.gmg === null ? { ...a, gmgOn: true } : gmgAttack(a)
}

/** Remake (gmgStreamSlowdown): the attack's own charge, its speed (and any cap on it) divided by the slowdown. */
function streamingGunAttack(a: AttackDef): AttackDef {
  const slow = a.gmgStreamSlowdown
  const chargeSpeedMax = a.chargeSpeedMax === null ? null : a.chargeSpeedMax / slow
  return { ...a, chargeSpeed: a.chargeSpeed / slow, chargeSpeedMax, gmgOn: true }
}

/** Remake: a gun spell that streams while held, sending a spell of chargePerUnit (one mine) whenever it holds one. */
export const isSpellStream = (a: AttackDef): boolean => a.gmgOn && a.gmgStreamSlowdown > 0

/**
 * Remake (gmgSummonsLowest, the army summon in gun mode): the spell goes once its charge reaches
 * `lowest`, the lowest stage with a unit in the reserve (1-based; 0 = none, so it waits, held
 * short of the first stage as the engine holds it).
 */
export function gmgSummonDue(a: AttackDef, charge: number, lowest: number): boolean {
  return a.gmgOn && a.gmgSummonsLowest && lowest > 0 && stageNumber(charge, a) >= lowest
}

/**
 * Remake (gmgFireRateScale below 1, the pulse): gun spells start only on `rate` of the ticks, spread
 * evenly (the ticks on which floor(tick x rate) steps up), so a held gun fires that much slower.
 */
export const onGunRhythm = (tick: number, rate: number): boolean => rate >= 1 || Math.floor(tick * rate) > Math.floor((tick - 1) * rate)

/**
 * objAiPlayer.internalEvent(#spellCharged) with the gmg on and gmgAutoFire: the spell is released
 * (and a new charge tried) on the tick its charge counter finishes. objAiAttack.chargeSpell gives the
 * spell the counter's count and then steps it (CounterOnce), finishing when the step reaches the
 * max, so a spell holding `charge` is let go once one more step would reach the max: a charge that
 * starts at its max (the pulse's and beam's 0) goes at once.
 */
export function gmgAutoFires(a: AttackDef, charge: number, limits: ChargeLimits): boolean {
  return a.gmgOn && a.gmg !== null && a.gmg.autoFire && charge + limits.speed >= limits.max
}

/**
 * objSpell.calcChargeOffset with chargeOffsetSide #side (objCharacter.gmgOn): the ball beside the
 * gun's muzzle (the caster's gmgChargeLoc, x mirrored by facing), its near edge there, growing ahead.
 */
export function gmgSpellCentre(caster: Vec, gmgChargeLoc: Vec, facingLeft: boolean, ballPx: number): Vec {
  const dir = facingLeft ? -1 : 1
  return { x: caster.x + dir * (gmgChargeLoc.x + ballPx / 2), y: caster.y + gmgChargeLoc.y }
}

/** A frame's size and reg point. */
export interface GunFrame {
  w: number
  h: number
  reg: Vec
}

/**
 * Remake (owner): where a spell fired through the gun launches: the gun's tip, the middle of the
 * front edge of Merlin's gun frame (the right edge, mirrored to the left when he faces left), from
 * its reg point on his position, and `shift` px further out (gmgMuzzleShift).
 */
export function gmgMuzzle(caster: Vec, frame: GunFrame, facingLeft: boolean, shift: number): Vec {
  const dir = facingLeft ? -1 : 1
  return { x: caster.x + dir * (frame.w - frame.reg.x + shift), y: caster.y + frame.h / 2 - frame.reg.y }
}

/** modAnimSet.getAnimSym with the gmg on: whatever the mode, Merlin holds the gun, walking or still. */
export const gmgStrip = (moving: boolean): string => (moving ? 'weaponMagicWalk' : 'weaponMagic')
