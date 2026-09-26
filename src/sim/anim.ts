// Animation bookkeeping shared by the tick steps: strip selection per character mode
// (modAnimSet.getAnimSym, objAnimSet.symExistsOrDefault) and the per-tick frame advance
// (objAnimSet.update / objAnimStrip: frame 0 on a strip change, `animLooped` on the last tick of
// the last frame).
import type { ActorMode, ActorState, AnimationSet, AnimationStrip } from './state'

/**
 * Strip name for a mode. `moving` picks the walking variants (walk, chargewalk, releasewalk);
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
      name = moving ? 'chargewalk' : 'charge'
      break
    case 'release':
      name = moving ? 'releasewalk' : 'release'
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
  return set?.[name] ? name : 'stand'
}

export type AnimFields = Pick<ActorState, 'anim' | 'animFrame' | 'animCounter' | 'animLooped'>

/**
 * Advances one strip by a tick: frame 0 on a strip change. `animLooped` is set on the last tick of
 * the last frame, while that frame is still shown (objAnimStrip.getLooped = the member list has
 * wrapped and the delay counter has finished; the next member is only fetched on the following
 * update), so a mode that ends on the loop never shows the strip's first frame again.
 */
export function advanceAnim(a: ActorState, animName: string, strip: AnimationStrip | undefined): AnimFields {
  let animFrame = 0
  let animCounter = 0
  if (animName === a.anim) {
    if (!strip) return { anim: animName, animFrame: a.animFrame, animCounter: a.animCounter, animLooped: false }
    animFrame = a.animFrame
    animCounter = a.animCounter + 1
    if (animCounter >= strip.delay) {
      animCounter = 0
      animFrame = a.animFrame + 1 >= strip.frames ? 0 : a.animFrame + 1
    }
  }
  const animLooped = !!strip && animFrame === strip.frames - 1 && animCounter === strip.delay - 1
  return { anim: animName, animFrame, animCounter, animLooped }
}

/** isOnAttackFrame: the strip sits on the first tick of the 1-based frame `frame`. */
export const onFreshFrame = (a: ActorState, frame: number | null): boolean =>
  frame !== null && a.animCounter === 0 && a.animFrame === frame - 1
