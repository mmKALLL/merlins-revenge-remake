// The Sorcerer's Tower (docs/design/the-sorcerers-tower.md; docs/plans/2026-09-28-random-floor-design.md,
// The tower): the four floors stacked into one map, the forest at the bottom and the maze at the
// top. Each floor is an ordinary generated floor of its theme; every second one is mirrored in x,
// so the corners snake (start bottom-left, exit top-right, then start bottom-right, exit top-left)
// and each floor's exit room sits under the next floor's start room. One opening joins the two;
// every other edge between floors stays walled.
import type { Vec } from '../mr-open/mr-geometry'
import type { MapDefinition } from '../mr-open/mr-map-format'
import { ROOM_SIZE, exitRoom, floorIsConnected, floorSteps, randomOpening, retrySeed, startRoom, themeIsSolid, type BoundaryOpening, type EnergyOf, type GeneratedFloor } from './floor'
import { runSteps, scaledSteps, type Steps } from './steps'
import { mirrorOpeningX, placeFloor } from './floor-transform'
import { GenRandom } from './random'
import type { Opening } from './room-shape'
import { TOWER_THEMES, type FloorTheme } from './themes'
import { TOWER_TILESETS, inTowerTilesets } from './tower-tilesets'

export const TOWER_ID = 'sorcerers-tower'

/** The floors from the bottom up, drawing from the tower tilesets. */
export const TOWER_FLOORS: readonly FloorTheme[] = TOWER_THEMES.map(inTowerTilesets)

const floorWidth = TOWER_FLOORS[0]!.floorSize.x
if (TOWER_FLOORS.some((t) => t.floorSize.x !== floorWidth)) throw new Error('tower floors must be equally wide')

export const TOWER_SIZE: Vec = { x: floorWidth, y: TOWER_FLOORS.reduce((rows, t) => rows + t.floorSize.y, 0) }

/** Whole-tower attempts (each from a derived seed) before giving up. */
const TOWER_ATTEMPTS = 8
/** Floor seeds are drawn from the tower's seed, uniform over 32 bits. */
const SEED_RANGE = 2 ** 32

/** Every second floor (from the bottom) is mirrored in x. */
export const isMirrored = (floor: number): boolean => floor % 2 === 1

/** Rooms above a floor in the tower: the floors on top of it. */
const rowsAbove = (floor: number): number => TOWER_FLOORS.slice(floor + 1).reduce((rows, t) => rows + t.floorSize.y, 0)

/** Solidity across the tower tilesets: an obstacle unless it is some floor's walkable decoration. */
export const towerIsSolid: (active: number) => boolean = (() => {
  const checks = TOWER_FLOORS.map(themeIsSolid)
  return (active) => checks.every((isSolid) => isSolid(active))
})()

/** A seeded tower; the same seed and actor energies always give the same tower. */
export function generateTower(seed: number, energyOf: EnergyOf): GeneratedFloor {
  return runSteps(towerSteps(seed, energyOf))
}

/** generateTower in steps: yields its progress after each room of each floor (a retry starts the count again). */
export function* towerSteps(seed: number, energyOf: EnergyOf): Steps<GeneratedFloor> {
  for (let attempt = 0; attempt < TOWER_ATTEMPTS; attempt++) {
    const tower = yield* buildTower(retrySeed(seed, attempt), energyOf)
    if (floorIsConnected(tower, towerIsSolid)) return tower
  }
  throw new Error(`${TOWER_ID}: no connected tower for seed ${seed} after ${TOWER_ATTEMPTS} attempts`)
}

function* buildTower(seed: number, energyOf: EnergyOf): Steps<GeneratedFloor> {
  const rng = new GenRandom(seed)
  // stairs[k] joins floor k's exit room to floor k + 1's start room, in tower coordinates
  const stairs = TOWER_FLOORS.slice(1).map((_, k) => randomOpening(rng, ROOM_SIZE.x, TOWER_FLOORS[k]!.edges.endOpening))
  const scrolls = drawSpellScrolls(rng)
  const floors: GeneratedFloor[] = []
  for (const [k, theme] of TOWER_FLOORS.entries()) {
    const share = 1 / TOWER_FLOORS.length
    const floor = yield* scaledSteps(floorSteps(theme, Math.floor(rng.next() * SEED_RANGE), energyOf, {
      placePlayer: k === 0,
      boundaryOpenings: stairOpenings(theme, k, stairs),
      spellScroll: scrolls[k]!,
    }), k * share, share)
    floors.push(placeFloor(floor, { mapSize: TOWER_SIZE, offset: { x: 0, y: rowsAbove(k) }, mirrorX: isMirrored(k) }))
  }
  const map: MapDefinition = {
    mapSize: TOWER_SIZE,
    roomSize: ROOM_SIZE,
    startRoom: floors[0]!.map.startRoom,
    endRoom: floors[floors.length - 1]!.map.endRoom!,
    layers: (['backgroundPassive', 'backgroundActive', 'objects'] as const).map((name) => ({ name, tileSet: TOWER_TILESETS[name] })),
    rooms: floors.flatMap((f) => f.map.rooms).sort((a, b) => a.num - b.num),
  }
  return {
    map,
    edges: Object.assign({}, ...floors.map((f) => f.edges)),
    placements: floors.flatMap((f) => f.placements),
  }
}

/**
 * One start-room spell scroll per floor, from the bottom up, each drawn from its floor's list
 * without the ones drawn below it (from the whole list again should none be left).
 */
function drawSpellScrolls(rng: GenRandom): string[] {
  const drawn: string[] = []
  for (const theme of TOWER_FLOORS) {
    const list = theme.units.startRewards.spellScrolls
    const fresh = list.filter((s) => !drawn.includes(s.value))
    drawn.push(rng.weighted(fresh.length > 0 ? fresh : list))
  }
  return drawn
}

/** Floor k's openings to the floors below and above, in its own (unmirrored) coordinates. */
function stairOpenings(theme: FloorTheme, k: number, stairs: readonly Opening[]): BoundaryOpening[] {
  const local = (o: Opening): Opening => (isMirrored(k) ? mirrorOpeningX(o) : o)
  const out: BoundaryOpening[] = []
  const below = stairs[k - 1]
  const above = stairs[k]
  if (below) out.push({ room: startRoom(theme.floorSize), edge: 'bottom', opening: local(below) })
  if (above) out.push({ room: exitRoom(theme.floorSize), edge: 'top', opening: local(above) })
  return out
}
