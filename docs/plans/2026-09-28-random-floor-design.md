# Random floors: design

First step toward the roguelite in `docs/design/the-sorcerers-tower.md`: procedurally generated
floors built in the browser from a seed, one per floor of the sketch (Goblin Forest, Undead Marsh,
Dragon Canyon, Magic Maze). Owner direction: fully procedural rooms (no templates); floors of 3x3
rooms (the sketch has 4x4).

## Shape

- Output is a plain `MapDefinition` (18x9 rooms, the theme's floor size, 3x3 by default), so the
  rest of the engine (tiles, enemies, exits, arrows, map complete, both camera modes) needs no changes.
- `?map=randomly_generated/<theme>&seed=N` builds the floor instead of fetching JSON. Without `seed`, `main.ts`
  picks one and writes it into the URL (`history.replaceState`) so a floor can be shared; picking a
  map from the menu drops the seed, so it is a new floor each time. Settings, Random maps: on New
  each run (default) every restart (after a death, after map complete, Restart map) regenerates
  the map from a fresh seed (`nextRunSeed`), rebuilds the grid and start position and updates
  `?seed=`; Same layout only reseeds the sim on the same layout. The seed also seeds the sim. Every
  theme is listed in the converted maps index (`GENERATED_MAPS` in `src/gen/generated-maps.ts`), so
  the Maps menu offers `randomly_generated/1-goblin-forest`, `randomly_generated/2-undead-marsh`, `randomly_generated/3-dragon-canyon`
  and `randomly_generated/4-magic-maze` (numbered by difficulty, so the browser lists them in that order), then
  the tower, `randomly_generated/sorcerers-tower`.
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
3. A room's whole edge line is solid wall except for its openings (map boundary and closed edges
   are walled end to end). The opening is kept clear two tiles deep on both sides, so facing edge
   tiles of neighbours always agree and an entrance is exactly its opening. Every opening is at
   least 3 tiles wide (owner rule; the maze's openings were widened to 3-4 for it).

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
   opening (and the exit room's boss tile) to the centre. Unreachable open pockets are filled in, so nothing spawns where the player
   cannot go.
5. Obstacle patches are labelled; each picks a material, each tile a variant.

A final flood fill over the whole floor checks start room to exit room and every unit; the floor is
regenerated from a derived seed on failure (bounded) and generation throws rather than return a
disconnected map. Generation takes 1-7 ms per floor.

## Units

- Start room: the player (plus the theme's music tile) and the start rewards below, no enemies.
- **Quality over y, quantity over x** (owner rule). Difficulty ramps over the y share only, from the
  theme's start value in the start row to its exit value in the far row, and gates the stronger
  choices (`minDifficulty`, `maxPerRoom`). Choices can also gain weight toward the far column or row
  (`weightFarX`, `weightFarY`: the canyon's dragons along x, golems along y).
- **Room forms.** Every other room takes one of two forms by the theme's `quantity` weights: a
  **swarm** of single regular enemies, `floor(swarm.base + swarm.farX * fx + random 0..1)`, with no
  producers; or **producers**, `floor(producers.base + producers.farX * fx + random 0..1)` dwellings
  and summoners (1 near the start column up to 2-3 in the far one) with only `escorts` regular enemies
  alongside. Summoners are enemy choices tagged `producer` (their weapon is a summon spell in the
  actor data: necromancer, grey ghost, orc mage, Scarlet monk; the shrouder and dark mage do not
  summon). A room whose faction has no producer (the maze's monsters, Scarlet below difficulty 6) is
  a swarm. The side corner groups come on top of the form.
- **Boss.** The exit room has both forms (swarm and producers) plus one of the theme's `bosses`
  groups; the group's `boss` unit stands 2 tiles in from the floor's far corner (the exit room's
  outer corner tile, `BOSS_TILE`), which the room layout keeps open and connected to its openings.
- **Factions.** Enemy teams hate each other and brawl (engine behaviour,
  `engine-mechanics-enemies-3.md`, Teams). Where a theme mixes rival teams, each choice names a
  faction and a room draws one faction (weighted by its eligible choices), taking only choices of
  that faction or of none. Corner groups set their room's faction.
- **Corner groups.** `farX` and `farY` each pick one of their groups, the exit room one of its
  bosses (the sketch's "boss A or boss B"). The exit room gets the last-stand music.
- **Corner potions (owner request).** Each side corner room (`farX`, `farY`; never the start or
  exit room) gets two pickups drawn from the theme's weighted `units.potions` list, side by side 2
  tiles in from the floor's outer corner in that room (`potionTiles`: the corner tile as
  `BOSS_TILE` is for the boss, the second one step along x away from the corner), so Merlin has to
  cross the room for them. The room layout keeps those tiles open and connected (like the boss
  tile), no unit is placed on them, and as placements they are covered by the connectivity check;
  a mirrored tower floor mirrors them with the room. The lists favour Quick Charge (manaFlow) and
  Max Blast (manaCapacity), then Burst, with an occasional Walk Speed; medikits are in every list
  (the original maps place them as rewards alongside potions), maxikits only on the merlinOpen
  floors (merlin4Objects has no maxikit tile), most of them in the maze.
- Units go on reachable open tiles at least two tiles from every room edge, one per tile.

## Start rewards (owner request)

Every floor's start room, and in the tower every floor's start room, gives (`units.startRewards`
in `themes.ts`, `placeStartRoom` in `floor.ts`):

- **3 potions** (4 until Merlin kept his tuned starting charge, owner decision 2026-10-22) drawn from the theme's start potion list (the four potions weighted as the corner
  lists weigh them: Quick Charge 3, Max Blast 3, Burst 2, Walk Speed 1; no kits) and **1 medikit**.
- **1 spell scroll** drawn from the theme's weighted `spellScrolls` (below). The tower draws the
  four floors' scrolls up front, bottom up, each without the ones drawn below it, so a tower run
  never repeats a spell (`drawSpellScrolls` in `tower.ts`, passed as `FloorOptions.spellScroll`).
- `extras`: further pickups, one each; the maze's golden machine gun goes here (below).

Placement: the player and the music take the reachable tiles nearest the room's centre as before;
the rewards then take the free unit tiles (reachable, two tiles off every edge, so never on a stair
opening) nearest the tile where Merlin comes in, at least 2 tiles (Chebyshev) from it: the
player's tile, or on the tower's floors 2-4 the inside end of the stair from below (the middle of
the start room's bottom boundary opening). They are placements, so the connectivity check covers
them, and a mirrored tower floor mirrors them with the room. Tests: counts per start room (single
floors over 500 seeds, the tower over 40), never on the player's tile, distinct scrolls per tower.

### Spell scrolls

The scroll pickups are the original's `act_<spell>` files with `objType #objScroll`
(`objScroll.collected` -> `objPlayerMerlinCharacter.newScrollCollected`: `addWeapon(character,
attack)`, +25 energy, temporary invincibility; for `#gmg` `gmgCollected` instead). The sim does not
spawn objScroll yet: `spawnRoomActors` skips the tile with its "not spawnable yet" (or "no actor
definition", for scrolls whose `act_` file is not copied yet) console note, so until scrolls are
ported a scroll is only a tile on the map (`PENDING_SCROLLS`; `floor-sim.test.ts` exempts them from
the ported-actor check). Energy blast is left out (Merlin starts with it).

| Key | merlinOpenObjects | merlin4Objects | Spell |
|---|---|---|---|
| armySummon | 22 | 10 | summons the reserve army (below) |
| energyMines | 23 | 11 | `explodeFunction #depositMines` |
| energyPulseSpell | 24 | 12 | `releaseFunction #fireBullets`, bullet `#energyPulse` |
| cBlast | 25 | 32 | blast variant |
| energyPunch | 26 | 103 | `animType #magicMelee` |
| monsterSummon | 27 | 104 | summons by charge: summonArcher, summonWarrior, summonOrc, summonBoulder, summonGolem |
| healBlast | 28 | 101 | `payloadFunction #takeHeal` on friendlies |
| arcticBlast | 29 | - | `[#takeFreeze, #takeHit]` |
| energyBeamSpell | 30 | - | beam, bullet `#energyBeam` |
| merlinSword | 39 | 40 | `animType #weaponMelee` (a sword, not a spell) |
| gmg | 38 | - | golden machine gun |

Theme lists (weights): Goblin Forest armySummon 3, energyMines 2, energyPulseSpell 2, merlinSword 2,
healBlast 1 (allies early, merlin4 has no arctic or beam tile); Undead Marsh energyPulseSpell 2,
energyMines 2, arcticBlast 2, cBlast 2, armySummon 1, healBlast 1, monsterSummon 1; Dragon Canyon
arcticBlast 2, energyBeamSpell 2, cBlast 2, energyPunch 2, armySummon 1, monsterSummon 1; Magic Maze
energyBeamSpell 3, cBlast 2, energyPunch 2, monsterSummon 2, arcticBlast 1.

### Army summon and the owner's army

Owner rule: the army summon spell comes with 2 warriors, 2 archers, 1 healer and 1 tower dwarf.
What the original does (archive `casts/`):

- `act_armySummon`: `explodeFunction #summonUnit`, `residentTeamCategory #aldevar`,
  `payloadFunction #armyTeleportOut`, `targetAllegiance #friendly`, and the charge stages
  `multistage [#warrior: 10, #archer: 15, #monk: 20, #dwarf: 25, #kingInGame: 32]`: the longer the
  charge, the stronger the unit type summoned.
- It does not create units. `armyMaster.createUnit` (`master_objects/armyMaster.txt`) returns
  `#none` for `#armySummon` when `lookupArmyDetails(team, typ)` finds no saved unit, and
  `checkUnitAvailability` / `modSpellMultistage.chargeReinInToAvailable` rein the charge in to the
  best stage that has a unit. Units get into the reserve (`pReserveArmy`, per team and type) by
  the same spell's payload: a blast on a friendly unit calls `modArmyUnit.armyTeleportOut`, which
  records it (`recordUnitDetails`, with its experience level); summoning restores the highest-level
  one (`restoreUnitToCombat`, `armyTeleportIn`). So in the original the spell moves an army Merlin
  already has (allies placed on the map) between rooms.
- `act_player #armyMembers [#warrior, #archer, #monk, #dwarf, #kingInGame]` is for
  `modAutoSummon.summonArmy` (summon many reserve units at once with a button, slots shared by type).
- The units: `act_warrior` (warriorSword), `act_archer` (archerBow), `act_monk`
  (`objAiCPUSpellCaster`, weapon `#healBlast`: the healer), `act_dwarf` (`objAiCPUBuilder`,
  `unitToBuild [#dwarfTower]`, `buildOne`, throws axes: the "tower dwarf"; `act_dwarfTower` is the
  tower he builds, an `#aldevar` building that fires axes). All `#aldevar`, Merlin's team.

Mapping: the owner's list is a **starting reserve army** filled in when the scroll is collected:
`pReserveArmy[#aldevar]` gets `warrior` x2, `archer` x2, `monk` x1, `dwarf` x1 (level 0), which the
spell's charge stages then summon (warrior from 10, archer 15, monk 20, dwarf 25). The king stage
stays empty. To be done with the spell port, as a remake decision: tunable data on the scroll (an
`ActorDef` field such as `startingArmy`, empty by default, set for `armySummon` in
`assets/tuning.json`), recorded in the engine notes.

### Golden machine gun (pending)

Owner note: the Magic Maze (the mage tower, floor 4) should also give the golden machine gun once
`act_gmg` is ported. The data is in place behind `MAZE_GIVES_GOLDEN_MACHINE_GUN = false`
(`themes.ts`); on, the maze's `extras` hold `gmg` (merlinOpenObjects tile 38; merlin4Objects has
none, and the tower takes merlinOpen's tile).

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
shared edge, facing edge tiles solid together with entrances at least 3 wide and a closed border,
units only on open tiles with the right object symbols, start room empty of enemies,
one faction per room, corner groups and the boss present, tile solidity against the tile keys, object tiles
against the key symbols, generation time; in the sim, a clear start in both world modes, map
complete when the exit room is cleared, and every placeable unit a ported actor with sprites.
For the tower (`tower.test.ts`, against the converted tower keys): connectivity over 40 seeds,
floors joined only through the stairs, the player on the bottom floor only, each floor's start music
and boss, and object symbols in the combined key. `pnpm tsx tools/render-random-floor.ts <outDir>
[map|all] [seed...]` (map: `goblin-forest`, `sorcerers-tower`, ...) writes PNG renders for tuning
by eye.

## The tower

`randomly_generated/sorcerers-tower` (`src/gen/tower.ts`) stacks the four floors into one 3x12 map, the forest
at the bottom and the maze at the top, seeded via `?seed=` like the single floors.

- Each floor is an ordinary `generateFloor` of its theme (its own room shapes, walls, enemies,
  difficulty, corner groups, bosses and music) with options: `placePlayer` (only the bottom floor
  places the player; later start rooms only play their start music) and `boundaryOpenings`. The floor
  is then moved into the tower and every second one mirrored in x (`placeFloor`,
  `src/gen/floor-transform.ts`), which mirrors its rooms, tiles, openings and units, so the corner
  roles (farX, farY) and the ramps mirror with it. The corners snake: the forest starts bottom-left
  and exits top-right, the marsh starts bottom-right and exits top-left, and so on.
- The stairs: one opening (the lower floor's `endOpening` width) from each floor's exit room up into
  the next floor's start room, decided by the tower in tower coordinates and passed to both floors
  (mirrored back for a mirrored floor) so both rooms keep it clear. Every other edge between floors
  is walled. The map's `startRoom` is the forest's start, `endRoom` the maze's exit.
- Each floor checks itself as usual (the flood starts from its start room's first unit: the player,
  or the start music); the whole tower is flood-filled from the player once more and rebuilt from a
  derived seed on failure. A tower takes 4-10 ms.
- **Tilesets.** A map has one tileset per layer, but the forest draws from merlin4 and the others
  from merlinOpen. `tools/convert-assets.ts` builds `towerPassive`, `towerActive` and `towerObjects`
  (10 per row): merlinOpen's tiles and key symbols from tile 1, merlin4's from tile 301
  (`TOWER_TILESET_PARTS` in `src/gen/tower-tilesets.ts`; the converter fails if a part overruns the
  next). The forest's tile numbers move by 300 in the tower (`inTowerTilesets`); object keys both
  sets have use merlinOpen's tile, so the player is on the key's first `player` tile, where the page
  looks for the start. The single floors keep their own tilesets.

## Status (2026-10-22)

Four themes on 3x3 floors and the tower. Known gaps: `mr.loadState` and the snapshot test helpers
fetch maps as converted JSON, so a snapshot of a generated map cannot be replayed yet (it would need
the seed passed to `generateMap`). Start rewards are placed; their spell scrolls (and the army
summon's starting army, and the maze's golden machine gun) wait for the spell port.
