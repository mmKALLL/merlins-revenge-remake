// The cut scene players' own data. objScriptPerformer.createMissingPlayers asks actorMaster for a
// new actor of each script character's key (act_merlin, act_ulin, act_tv, ...: `#inherit
// #actorPlayer`, objActorPlayer), so a character walks, faces, holds props and colours its lines
// (modThespian #speechColor) as its actor file says.
import type { ActorDef } from '../mr-open/mr-actor-data'
import type { Vec } from '../mr-open/mr-geometry'
import { DEFAULT_CAST_MEMBER, type Cast, type CastMember } from './performer'
import type { Rgb } from './script'

/** objActorPlayer: the actors cut scenes are played with. */
export const CUT_SCENE_PLAYER_OBJ_TYPE = 'objActorPlayer'
/** #initFaceDir: -1 faces left. */
const FACE_LEFT = -1

const isRgb = (v: unknown): v is Rgb => typeof v === 'object' && v !== null && ['r', 'g', 'b'].every((k) => typeof (v as Record<string, unknown>)[k] === 'number')
const isVec = (v: unknown): v is Vec => typeof v === 'object' && v !== null && typeof (v as Vec).x === 'number' && typeof (v as Vec).y === 'number'

function castMemberOf(def: ActorDef): CastMember {
  // engine properties the port keeps in raw only (lowercased: they are not in the canonical list)
  const carry = def.raw['propcarryloc']
  const speech = def.raw['speechcolor']
  return {
    walkSpeed: def.walkSpeed,
    propCarryLoc: isVec(carry) ? { x: carry.x, y: carry.y } : DEFAULT_CAST_MEMBER.propCarryLoc,
    startsFacingLeft: def.raw['initfacedir'] === FACE_LEFT,
    speechColour: isRgb(speech) ? { r: speech.r, g: speech.g, b: speech.b } : DEFAULT_CAST_MEMBER.speechColour,
  }
}

/** Every cut scene player's data, by character (its actor key). */
export function cutSceneCast(defs: Readonly<Record<string, ActorDef>>): Cast {
  return Object.fromEntries(Object.values(defs).filter((d) => d.objType === CUT_SCENE_PLAYER_OBJ_TYPE).map((d) => [d.key, castMemberOf(d)]))
}
