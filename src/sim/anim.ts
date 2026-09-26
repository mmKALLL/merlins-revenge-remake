// Animation bookkeeping shared by the tick steps: strip selection per character mode
// (modAnimSet.getAnimSym, objAnimSet.symExistsOrDefault) and the per-tick frame advance
// (objAnimSet.update / objAnimStrip: frame 0 on a strip change, `animLooped` on the wrap tick).
import type { ActorMode, ActorState, AnimationSet, AnimationStrip } from './state'

/**
 * Strip name for a mode. `moving` picks the walking variants (walk, chargewalk, releasewalk);
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

/** Advances one strip by a tick: frame 0 on a strip change, `animLooped` on the tick it wraps. */
export function advanceAnim(a: ActorState, animName: string, strip: AnimationStrip | undefined): AnimFields {
  if (animName !== a.anim) return { anim: animName, animFrame: 0, animCounter: 0, animLooped: false }
  if (!strip) return { anim: animName, animFrame: a.animFrame, animCounter: a.animCounter, animLooped: false }
  let animFrame = a.animFrame
  let animCounter = a.animCounter + 1
  let animLooped = false
  if (animCounter >= strip.delay) {
    animCounter = 0
    animFrame = a.animFrame + 1
    if (animFrame >= strip.frames) {
      animFrame = 0
      animLooped = true
    }
  }
  return { anim: animName, animFrame, animCounter, animLooped }
}

/** isOnAttackFrame: the strip sits on the first tick of the 1-based frame `frame`. */
export const onFreshFrame = (a: ActorState, frame: number | null): boolean =>
  frame !== null && a.animCounter === 0 && a.animFrame === frame - 1
