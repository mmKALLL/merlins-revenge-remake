# Random floor: design (Goblin Forest)

First step toward the roguelite in `docs/design/the-sorcerers-tower.md`: one procedurally generated
4x4 floor, themed Goblin Forest, built in the browser from a seed. Owner direction: fully
procedural rooms (no templates), one theme first.

## Shape

- Output is a plain `MapDefinition` (merlin4 tilesets, 18x9 rooms, 4x4 rooms), so the rest of the
  engine (tiles, enemies, exits, arrows, map complete, both camera modes) needs no changes.
- `?map=random/goblin-forest&seed=N` builds the floor instead of fetching JSON. Without `seed`,
  `main.ts` picks one and writes it into the URL (`history.replaceState`) so a floor can be shared.
  The seed also seeds the sim, as before. `random/goblin-forest` is listed in the converted maps
  index (a generated-maps list in `src/gen/`), so the map browser offers it.
- Code lives in `src/gen/`: `random.ts` (seeded mutable RNG), `floor.ts` (edges, rooms, units),
  `room-shape.ts` (obstacles and flood fill), `themes.ts` (tile and enemy tables). A theme is data:
  tile lists, patch materials, enemy weights, counts and difficulty ramps.

## Coordinates

Engine rooms are (x, y) with y down. The sketch counts y up from the start, so the start is the
bottom-left room (1,4) and the exit the top-right room (4,1), which is the map's `endRoom`
(clearing it completes the map). The sketch's warrior room "4,1" is the other bottom corner,
engine (4,4). Progress is `px = x - 1` (more enemies) and `py = 4 - y` (more dwellings).

## Edges (connectivity by construction)

1. Every shared edge between neighbours is decided once, for both rooms: open or closed, and for an
   open edge a fixed opening (offset and width along the edge).
2. A random spanning tree over the 16 rooms is always open; every other edge opens with high
   probability, so rooms are mostly T or + shaped.
3. Map boundary and closed edges get a solid wall on the room's edge line. Open edges have no wall;
   the opening is kept clear two tiles deep on both sides, so the rooms meet there.

## Rooms

1. A few obstacle patches grow from random tiles (random frontier growth), then one cellular
   automata step fills notches, giving small forest and rock clumps.
2. Sometimes a long wall grows from a closed or boundary edge toward the centre (U-shaped rooms).
3. Stumps as single solid tiles; flowers and pebbles as walkable decoration.
4. Flood fill from one opening: every other opening must be reached, else retry the room (bounded);
   after the last try, carve straight corridors from every opening to the centre. Unreachable open
   pockets are filled in, so nothing spawns where the player cannot go.
5. Obstacle patches are labelled; each picks a material (forest or rock), each tile a variant.

A final flood fill over the whole floor checks start room to exit room; the floor is regenerated
from a derived seed on failure (bounded) and generation throws rather than return a disconnected map.

## Units

- Start room: the player only (plus the forest music tile), no enemies.
- Enemies: count grows with `px`, dwellings (goblin huts) with `py`; difficulty 0 -> 3 over
  `px + py`. Mostly goblin archers; warriors concentrated in the warrior room; goblin mages and
  orcs only past a difficulty threshold (toward the exit). The exit room gets the last-stand music.
- Units go on open tiles at least two tiles from every room edge, one per tile, not on decoration
  that blocks.

## Tests

Determinism, start-to-exit connectivity over 500 seeds, matching openings on every shared edge,
units only on open tiles, start room empty of enemies, theme indices match the tile keys, and
generation time. `tools/render-random-floor.ts` writes PNG renders for tuning by eye.

## Status (2026-09-28)

Implemented as designed; the floor plays in both camera modes and completes when the exit room is
cleared (checked in `src/gen/floor-sim.test.ts`). Generation takes about 1 ms per floor.
Known gaps: `mr.loadState` and the snapshot test helpers fetch maps as converted JSON, so a
snapshot of a generated floor cannot be replayed yet (it would need the seed passed to
`generateMap`); the map browser keeps the current `seed` parameter when it switches maps, so
picking the random floor again from it replays the same floor.
