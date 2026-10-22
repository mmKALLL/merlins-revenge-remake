// Builders (objAiCPUBuilder, modBuilder, modConstruction; spells notes §5, the dwarf): on starting,
// a builder looks for its building (#lookForBuilding, once no teleport plays), continues an
// unfinished one of its team or starts a new one 32 px to its right (#beBuilt: 1 energy, its strip
// paused), walks beside it (#walkToBuilding, modBuilder.alignToBuilding) and builds it frame by
// frame (#build, updateBuild); a finished building fights on its own and the builder turns to
// fighting (#findTarget). A building with `buildOne` already standing means nothing to build.
import type { ActorDef } from '../mr-open/mr-actor-data'
import { BUILD_RANGE, BUILDER_AI, NEW_BUILDING_OFFSET, UNBUILT_ENERGY, buildStep, energyPerBuildFrame } from '../mr-open/mr-builder'
import { tileOfPx } from '../mr-open/mr-collision'
import { distance, type Vec } from '../mr-open/mr-geometry'
import { arrived, frameMove } from '../mr-open/mr-pathfinding'
import { defOf, isAlive, spriteRectFor, stripFor, walkSpeedOf } from './actors'
import { randomInt } from './rng'
import type { ActorState, AiMode } from './state'
import { actorIn, spawn, type Tick } from './tick-context'
import { fightOver, teleportOut } from './tick-army'

/** The builder's own AI modes; objAiCPU takes over in the others. */
export const BUILDER_AI_MODES: ReadonlySet<AiMode> = new Set<AiMode>(['lookForBuilding', 'walkToBuilding', 'build'])
/** modConstruction: the building's strip while it is built. */
const BE_BUILT = 'beBuilt'
/** modBuilder: the builder's strip while building. */
const BUILD_STRIP = 'build'

export function stepBuilders(t: Tick): void {
  for (const a of t.actors) {
    if (t.removed.has(a.id) || !a.awake || !isAlive(a)) continue
    const def = defOf(t.s, a)
    // a hit dazes the AI (applyHit), which then looks for a target as objAiCPU does
    if (def.aiType !== BUILDER_AI || !BUILDER_AI_MODES.has(a.ai.mode)) continue
    // remake (owner request): an ally builder leaves with the others once the fight is over, its
    // building unfinished if need be (it stands there for the next builder to continue)
    if (def.leaveWhenFinished && fightOver(t) && a.teleport === null) {
      teleportOut(t, a)
      continue
    }
    if (a.ai.mode === 'lookForBuilding') {
      // objAiCPUBuilder #lookForBuilding: wait for the teleport in to finish
      if (a.teleport === null) startBuilding(t, a, def)
      continue
    }
    const building = a.ai.buildingId === null ? undefined : actorIn(t, a.ai.buildingId)
    // #outOfEnergy of the building (or it is gone): back to fighting
    if (!building || !isAlive(building) || building.mode !== BE_BUILT) {
      stopBuilding(a)
      continue
    }
    alignToBuilding(t, a, def, building)
    if (a.ai.mode === 'walkToBuilding') {
      if (distance(a.pos, building.pos) <= BUILD_RANGE) a.ai.mode = 'build' // checkMyBuildingInRange
    } else {
      build(t, a, def, building)
    }
  }
}

/**
 * objAiCPUBuilder.startBuilding: continue the team's unfinished building of the type, or (none
 * standing) start a new one (startNewConstruction); either way the builder goes #build and walks to
 * it. Nothing to build, or a new building blocked by a solid tile: #findTarget.
 */
function startBuilding(t: Tick, a: ActorState, def: ActorDef): void {
  const [pick, rng] = randomInt(t.rng, def.unitToBuild.length) // modBuilder.getUnitToBuild: random(count)
  t.rng = rng
  const typ = def.unitToBuild[pick - 1]
  const existing = typ === undefined ? undefined : teamBuildingOfType(t, a, typ)
  let building: ActorState | undefined
  if (existing?.mode === BE_BUILT) building = existing
  else if (typ !== undefined && (!existing || !def.buildOne)) building = startNewConstruction(t, a, typ)
  if (!building) {
    stopBuilding(a)
    return
  }
  a.mode = BUILD_STRIP
  a.ai = { ...a.ai, mode: 'walkToBuilding', buildingId: building.id, buildAmount: 0, moveTarget: null }
}

/** teamMaster.getBuildingOfType: the first living building of `typ` on the builder's team. */
function teamBuildingOfType(t: Tick, a: ActorState, typ: string): ActorState | undefined {
  return t.actors.find((o) => !t.removed.has(o.id) && o.def === typ && o.team === a.team && isAlive(o) && defOf(t.s, o).teamRole === 'teamBuildings')
}

/** objAiCPUBuilder.startNewConstruction: the building (preBuilt false) beside the builder, unless the tile there is solid. */
function startNewConstruction(t: Tick, a: ActorState, typ: string): ActorState | undefined {
  if (!t.s.defs[typ]) return undefined
  const at: Vec = { x: a.pos.x + NEW_BUILDING_OFFSET.x, y: a.pos.y + NEW_BUILDING_OFFSET.y }
  if (t.s.grid.solidAt(tileOfPx(at.x), tileOfPx(at.y))) return undefined
  // modConstruction.startBeBuilt: 1 energy, the beBuilt strip paused on its first frame
  return spawn(t, typ, at, { mode: BE_BUILT, anim: BE_BUILT, animFrame: 0, energy: UNBUILT_ENERGY, team: a.team })
}

/** #buildingFinished (or the building lost): the builder walks and fights (objAiCPU #findTarget). */
function stopBuilding(a: ActorState): void {
  a.mode = 'walk'
  a.vel = { x: 0, y: 0 }
  a.ai = { ...a.ai, mode: 'findTarget', buildingId: null, buildAmount: 0 }
}

/**
 * modBuilder.alignToBuilding: moveTowardsLoc with the builder's right edge on the building's left
 * edge and their bottoms level, facing it.
 */
function alignToBuilding(t: Tick, a: ActorState, def: ActorDef, building: ActorState): void {
  const mine = spriteRectFor(t.s, a)
  const its = spriteRectFor(t.s, building)
  const spot = { x: its.left - (mine.right - a.pos.x), y: its.bottom - (mine.bottom - a.pos.y) }
  a.vel = arrived(a.pos, spot) ? { x: 0, y: 0 } : frameMove(a.pos, spot, walkSpeedOf(a, def))
  a.facingLeft = building.pos.x < a.pos.x // faceObject
}

/**
 * objAiCPUBuilder.updateBuild + modConstruction.advanceBuildFrame: each 100 of build amount moves
 * the building one frame on and adds 1/frames of its energy; when the strip comes round it is
 * finished (#buildingFinished: #stand, its AI starts) and the builder stops.
 */
function build(t: Tick, a: ActorState, def: ActorDef, building: ActorState): void {
  const step = buildStep(a.ai.buildAmount, def.buildRate)
  a.ai.buildAmount = step.carried
  const strip = stripFor(t.s, building)
  const frames = strip?.frames ?? 1
  const buildingDef = defOf(t.s, building)
  for (let i = 0; i < step.frames; i++) {
    building.energy = Math.min(buildingDef.maxEnergy, building.energy + energyPerBuildFrame(buildingDef.maxEnergy, frames))
    if (building.animFrame + 1 < frames) {
      building.animFrame++
      continue
    }
    building.mode = 'walk'
    building.animFrame = 0
    stopBuilding(a)
    return
  }
}
