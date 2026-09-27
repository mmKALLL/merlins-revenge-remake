// Animation bookkeeping shared by the tick steps: strip selection per character mode
// (modAnimSet.getAnimSym, objAnimSet.symExistsOrDefault) and the per-tick frame advance
// (objAnimSet.update / objAnimStrip: frame 0 on a strip change, `animLooped` on the last tick of
// the last frame).
import type { ActorMode, ActorState, AnimationSet, AnimationStrip } from './state'

/**
 * Strip name for a mode. `moving` picks the walking variants (walk, chargeWalk, releaseWalk);
 * swapping between a still and a walking variant restarts at frame 0 here. The engine does not
 * carry the frame index across either: objAnimSet keeps one objAnimStrip per name, each with its own
 * frame and delay counters, and advances only the strip currently shown (modAnimSet.updateAnim ->
 * objAnimSet.getMember). goMode(#release) resets both release and releaseWalk and goMode(#charge)
 * resets charge only (objCharacter.goMode, resetAnim), so a swap resumes the other strip where it
 * last stopped: frame 1 for the first swap in a release (as here), anywhere for chargeWalk.
 * die/dead/finish play the grave strip; a spell in flight or exploding keeps its charge ball. A
 * missing strip falls back to `stand` (rendered as the first walk frame when that is missing too).
 */
export function stripNameFor(set: AnimationSet | undefined, mode: ActorMode, moving: boolean, isSpell = false): string {
  let name: string
  switch (mode) {
    case 'walk':
    case 'stand':
      name = moving ? 'walk' : 'stand'
      break
    case 'charge':
      name = moving ? 'chargeWalk' : 'charge'
      break
    case 'release':
      name = moving ? 'releaseWalk' : 'release'
      break
    case 'die':
    case 'dead':
    case 'finish':
      name = 'grave'
      break
    case 'fly':
    case 'explode':
      name = isSpell ? 'charge' : mode
      break
    default:
      name = mode
  }
  return (set && stripKey(set, name)) ?? 'stand'
}

/**
 * The atlas key for a strip name, compared case-insensitively (Lingo symbols are: Merlin's frames
 * say `chargewalk`, the goblin mage's `chargeWalk`); undefined when the set has no such strip.
 */
export function stripKey(set: AnimationSet, name: string): string | undefined {
  if (set[name]) return name
  const lower = name.toLowerCase()
  return Object.keys(set).find((k) => k.toLowerCase() === lower)
}

export type AnimFields = Pick<ActorState, 'anim' | 'animFrame' | 'animCounter' | 'animExtend' | 'animExtendCount' | 'animLooped'>

/**
 * Advances one strip by a tick: frame 0 on a strip change. `animLooped` is set on the last tick of
 * the last frame, while that frame is still shown (objAnimStrip.getLooped = the member list has
 * wrapped and the delay counter has finished; the next member is only fetched on the following
 * update), so a mode that ends on the loop never shows the strip's first frame again.
 */
export function advanceAnim(a: ActorState, animName: string, strip: AnimationStrip | undefined): AnimFields {
  let animFrame = 0
  let animCounter = 0
  let animExtend = 0
  let animExtendCount = 0
  if (animName === a.anim) {
    if (!strip) return { anim: animName, animFrame: a.animFrame, animCounter: a.animCounter, animExtend: a.animExtend, animExtendCount: a.animExtendCount, animLooped: false }
    animFrame = a.animFrame
    animCounter = a.animCounter + 1
    animExtend = a.animExtend
    animExtendCount = a.animExtendCount
    if (animCounter >= frameDelay(strip, a.animFrame) + a.animExtend) {
      animCounter = 0
      animExtend = 0
      animExtendCount = 0
      animFrame = a.animFrame + 1 >= strip.frames ? 0 : a.animFrame + 1
    }
  }
  return { anim: animName, animFrame, animCounter, animExtend, animExtendCount, animLooped: loopedOn(strip, animFrame, animCounter, animExtend) }
}

/** Ticks the 0-based `frame` of a strip is shown (objAnimStrip: each member keeps its own delay). */
export const frameDelay = (strip: AnimationStrip, frame: number): number => strip.delays?.[frame] ?? strip.delay

const loopedOn = (strip: AnimationStrip | undefined, frame: number, counter: number, extend: number): boolean =>
  !!strip && frame === strip.frames - 1 && counter === frameDelay(strip, frame) + extend - 1

/**
 * objAnimStrip.extendDelay(1), `times` times: the current frame's delay (tim[2]) grows by one and its
 * delay counter restarts at 1, so a frame shown for c ticks so far (this tick included) with n
 * extensions in total stays up for another delay + n - 1 ticks: length c + delay + n - 1.
 * `animLooped` is re-evaluated against the longer frame.
 */
export function extendFrame(a: ActorState, strip: AnimationStrip | undefined, times: number): Pick<AnimFields, 'animExtend' | 'animExtendCount' | 'animLooped'> {
  if (times <= 0) return { animExtend: a.animExtend, animExtendCount: a.animExtendCount, animLooped: a.animLooped }
  const animExtendCount = a.animExtendCount + times
  const animExtend = a.animCounter + animExtendCount
  return { animExtend, animExtendCount, animLooped: loopedOn(strip, a.animFrame, a.animCounter, animExtend) }
}

/**
 * modAttack.isOnAttackFrame: the strip sits on the first tick of one of the 1-based `frames` (a list
 * strikes or fires on each: crossBow [2,4,6], orcSword [6,10,12]).
 */
export const onFreshFrame = (a: ActorState, frames: readonly number[] | null): boolean =>
  frames !== null && a.animCounter === 0 && frames.includes(a.animFrame + 1)
