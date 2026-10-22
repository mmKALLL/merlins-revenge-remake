# Random floors: design

First step toward the roguelite in `docs/design/the-sorcerers-tower.md`: procedurally generated
floors built in the browser from a seed, one per floor of the sketch (Goblin Forest, Undead Marsh,
Dragon Canyon, Magic Maze). Owner direction: fully procedural rooms (no templates); floors of 3x3
rooms (the sketch has 4x4).

## Shape

- Output is a plain `MapDefinition` (18x9 rooms, the theme's floor size, 3x3 by default), so the
  rest of the engine (tiles, enemies, exits, arrows, map complete, both camera modes) needs no changes.
- `?map=random/<theme>&seed=N` builds the floor instead of fetching JSON. Without `seed`, `main.ts`
  picks one and writes it into the URL (`history.replaceState`) so a floor can be shared; picking a
  map from the menu drops the seed, so it is a new floor each time. The seed also seeds the sim. Every
  theme is listed in the converted maps index (`GENERATED_MAPS` in `src/gen/generated-maps.ts`), so
  the Maps menu offers `random/goblin-forest`, `random/undead-marsh`, `random/dragon-canyon` and
  `random/magic-maze`.
- Code lives in `src/gen/`: `random.ts` (seeded mutable RNG), `grid.ts` (cells, flood fill),
  `floor.ts` (edges, rooms, units), `room-shape.ts` (patches, retries, carving), `interior-walls.ts`
  (one small strategy per wall style), `themes.ts` (all theme data). A theme is data: floor size,
  tilesets, tiles per role, patch materials, which wall styles it uses and their parameters, enemy
  weights, counts, factions, corner groups and difficulty ramps.

## Coordinates

Engine rooms are (x, y) with y down. The sketch counts y up from the start, so the start is the
bottom-left room and the exit the top-right one (the map's `endRoom`; clearing it completes the
map). Corner rooms are named as in the sketch: `farX` is its "4,1" (the other bottom corner, engine
(3,3) on 3x3), `farY` its "1,4" (the other top corner, engine (1,1)). Progress is measured as the
share of the floor crossed, `fx = px / (width - 1)` and `fy = py / (height - 1)` (0 at the start
column/row, 1 at the far one), so the sketch's ramps read the same on any floor size.

## Edges (connectivity by construction)

1. Every shared edge between neighbours is decided once, for both rooms: open or closed, and for an
   open edge a fixed opening (offset and width along the edge).
2. A random spanning tree over the rooms is always open; every other edge opens by the theme's
   chance (high in the forest, lower in the maze).
3. Map boundary and closed edges get a solid wall on the room's edge line. Open edges have no wall;
   the opening is kept clear two tiles deep on both sides, so the rooms meet there.

## Rooms

1. A few obstacle patches grow from random tiles (random frontier growth), then cellular automata
   steps fill notches, giving small clumps.
2. Interior walls, each style optional theme data (`shape.division`, `shape.baffles`, `shape.cuts`,
   `shape.longWallChance`); they never build on an opening's reserved tiles:
   - **Long wall** (Goblin Forest): one straight wall from a walled edge toward the centre (U shapes).
   - **Cuts** (Undead Marsh): tree lines from an edge across the room until the far side, some
     turning once partway (L and T shaped parts), most leaving a 2-3 tile gap, with sideways wobbles.
   - **Baffles** (Dragon Canyon): 2-3 parallel walls from alternating sides, reaching 55-75 % across,
     vertical or horizontal, 1-2 tiles thick: the way through zigzags (S shapes).
   - **Division** (Magic Maze): recursive division into chambers at least 2 tiles wide, each wall with
     one 2-tile door; walls run to the room's edge where that edge is open.
3. Stumps as single solid tiles; walkable decoration (flowers, pebbles, puddles, coins).
4. Flood fill from one opening: every other opening must be reached and enough of the room must be
   open, else retry the room (bounded); after the last try, carve straight corridors from every
   opening to the centre. Unreachable open pockets are filled in, so nothing spawns where the player
   cannot go.
5. Obstacle patches are labelled; each picks a material, each tile a variant.

A final flood fill over the whole floor checks start room to exit room and every unit; the floor is
regenerated from a derived seed on failure (bounded) and generation throws rather than return a
disconnected map. Generation takes 1-7 ms per floor.

## Units

- Start room: the player only (plus the theme's music tile), no enemies.
- Enemies per room: `enemiesBase + enemiesFarX * fx + random`; dwellings `floor(dwellingsFarY * fy +
  random)`, so the x direction brings more enemies and the y direction more dwellings/summoners.
  Difficulty ramps from the theme's start to its exit value over x + y steps and gates the stronger
  choices (`minDifficulty`, `maxPerRoom`). Choices can also gain weight toward the far column or row
  (`weightFarX`, `weightFarY`: the canyon's dragons along x, golems along y).
- **Factions.** Enemy teams hate each other and brawl (engine behaviour,
  `engine-mechanics-enemies-3.md`, Teams). Where a theme mixes rival teams, each choice names a
  faction and a room draws one faction (weighted by its eligible choices), taking only choices of
  that faction or of none. Corner groups set their room's faction.
- **Corner groups.** `farX`, `farY` and the exit room each pick one of their groups (the sketch's
  "boss A or boss B") on top of the usual enemies. The sketch's potion pickups in the side corners
  wait for potions to be ported. The exit room gets the last-stand music.
- Units go on reachable open tiles at least two tiles from every room edge, one per tile.

## Themes

Only ported actors with sprites (checked by `floor-sim.test.ts`). Tiles come from the original's
tilesets; every obstacle is `#solid` and every decoration `#none` in its tile key (`floor.test.ts`).

| Floor | Tilesets | Difficulty | Enemies | Dwellings | farX / farY | Exit (one of) |
|---|---|---|---|---|---|---|
| Goblin Forest | merlin4 | 0 -> 3 | goblin archers, warriors, bats; goblin mages from 1.5; orcs from 2.5 | goblin huts, bat trees, mage huts | goblin warrior band / - | orc camp; hydra trainer (hydra1, goblin hero, warrior) |
| Undead Marsh | merlinOpen | 1 -> 5 | undead: skeleton warriors, throwers, archers, ghosts, necromancers, commandos, giants; critters: quadranids; bats in either | skeleton dwellings, cocoons, bat trees | critter nest (cocoon, quadranids) / necromancer guard | skeleton army (skeleton lord); necromancy club |
| Dragon Canyon | merlinOpen | 3 -> 6 | karate guys, kung fu chickens, lizards, plants (traps); boulder monsters and dark golems toward far y; dragons toward far x; lizard soldiers, hydra1 later | dojos, boulder caves, dark caves (far y) | dragon roost / golem quarry | dark golems (four-arm + double dark golem); dragon's lair; hydra den (hydra3, plants) |
| Magic Maze | merlinOpen | 5 -> 7 | alliance: bomb mages, thunder monks, shrouders; undead: necromancers, dark mages, ghosts; scarlet: warriors, archers, monks; monsters: black orcs, vulture guards | magic portals, skeleton dwellings | portal ward / necromancy study | dark sorcerer's court (dark mages); Scarlet's guard |

Looks: the forest is grass with pine copses and rock clumps; the marsh dark grass and marsh water
with barren black and dead trees, skulls and puddles; the canyon brown earth with grey boulder walls,
rock spires and cacti; the maze blue cobbles with grey brick walls, iron bars, pots and shrines.

### Substitutions (sketch enemy -> ported stand-in)

- **Goblin Forest boss "hydra trainer"**: hydra1 with a goblin hero and a warrior (no trainer unit).
- **Undead Marsh "cave enemies and bats"**: bats and bat trees (cave team; they do not fight the
  undead). The owner's "gun critter" is the quadranid (monsters team, which brawls with the undead,
  so quadranids and their cocoons hold rooms of their own).
- **Dragon Canyon "martial artists, rock golems"**: karate guys, kung fu chickens (and dojos, which
  also release speedy guys); boulder monsters and dark golems. Owner additions: hydras (hydra1 in
  rooms, hydra3 as a boss) and traps: the plant (stationary needle shooter) is the only ported
  stationary hazard that fits; pit monsters, fire and cracks are not ported, gar towers are goblin.
- **Magic Maze "MR3's new wizard enemies"**: not ported (the in-game wizards and ochre wizard need
  `#wizard` and energy pulse); the magical alliance (bomb mage, thunder monk, shrouder, magic
  portal) stands in. "Chromatic sorcerers": Scarlet's army (scarlet warrior, archer, monk).
  "The Black Sorcerer": not in the engine's data (only his team file exists); a court of dark mages
  with a necromancer and a ghost, or Scarlet's guard. Owner additions: black orcs ("giant orcs")
  and vulture guards, both monsters, so in rooms of their own.

## Tests

For every theme: determinism, start-to-exit connectivity over 500 seeds, matching openings on every
shared edge, units only on open tiles with the right object symbols, start room empty of enemies,
one faction per room, corner groups present, tile solidity against the tile keys, object tiles
against the key symbols, generation time; in the sim, a clear start in both world modes, map
complete when the exit room is cleared, and every placeable unit a ported actor with sprites.
`pnpm tsx tools/render-random-floor.ts <outDir> [theme|all] [seed...]` writes PNG renders for
tuning by eye.

## Status (2026-10-22)

Four themes on 3x3 floors. Known gaps: `mr.loadState` and the snapshot test helpers fetch maps as
converted JSON, so a snapshot of a generated floor cannot be replayed yet (it would need the seed
passed to `generateMap`). Not yet: stacking floors into the tower, the floor-start rewards (spell or
allies), potion corner rooms.
