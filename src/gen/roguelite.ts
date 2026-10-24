// Roguelite floors (docs/plans/2026-10-25-roguelite-mode-design.md): one generated floor of a theme on
// the tower tilesets, so the page's tilesets never change between floors, its exit room opened at the
// top so Merlin can leave the floor upward. Merlin arrives safe (no unit within SAFE_ARRIVAL_TILES)
// beside a sign with the floor's name.
import { ROOM_SIZE, exitRoom, floorSteps, randomOpening, type EnergyOf, type GeneratedFloor } from './floor'
import { GenRandom } from './random'
import type { Steps } from './steps'
import type { FloorTheme } from './themes'

/** The floor's own seed is drawn from the given one, uniform over 32 bits. */
const SEED_RANGE = 2 ** 32
/** Owner: no unit (dwellings included) within this many tiles, across plus down, of Merlin's arrival. */
export const SAFE_ARRIVAL_TILES = 3

/** A seeded roguelite floor of a theme (one already in the tower tilesets, as TOWER_FLOORS). */
export function* rogueliteFloor(theme: FloorTheme, seed: number, energyOf: EnergyOf): Steps<GeneratedFloor> {
  const rng = new GenRandom(seed)
  const exit = { room: exitRoom(theme.floorSize), edge: 'top' as const, opening: randomOpening(rng, ROOM_SIZE.x, theme.edges.endOpening) }
  const floor = yield* floorSteps(theme, Math.floor(rng.next() * SEED_RANGE), energyOf, {
    boundaryOpenings: [exit],
    safeArrivalTiles: SAFE_ARRIVAL_TILES,
    locationSign: theme.name,
  })
  return { ...floor, map: { ...floor.map, markExit: true } }
}
