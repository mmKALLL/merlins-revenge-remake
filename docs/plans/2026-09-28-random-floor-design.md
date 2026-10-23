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
  `randomly_generated/4-magic-maze` and `randomly_generated/5-golden-fort` (numbered by difficulty, so the browser lists them in that order; the fort is not part of the tower), then
  the tower, `randomly_generated/sorcerers-tower`.
- Code lives in `src/gen/`: `random.ts` (seeded mutable RNG), `grid.ts` (cells, flood fill),
  `floor.ts` (edges, rooms, units), `room-shape.ts` (patches, retries, carving), `interior-walls.ts`
  (one small strategy per wall style), `themes.ts` (all theme data). A theme is data: floor size,
  tilesets, tiles per role, patch materials, which wall styles it uses and their parameters, enemy
  weights and tiers, factions, bosses and the room plan. Besides the theme and the seed, the
  generator's one input is the units' energies (`EnergyOf`, for HP budgets; see Room plans).

## Coordinates

Engine rooms are (x, y) with y down. The sketch counts y up from the start, so the start is the
bottom-left room and the exit the top-right one (the map's `endRoom`; clearing it completes the
map). Corner rooms are named as in the sketch: `farX` is its "4,1" (the other bottom corner, engine
(3,3) on 3x3), `farY` its "1,4" (the other top corner, engine (1,1)). Room plans are written as
on screen, so their first row is engine y 1.

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
   opening (from its middle tile just inside the room, not along the walled edge line) and the exit room's boss tile to the centre. Unreachable open pockets are filled in, so nothing spawns where the player
   cannot go.
5. Obstacle patches are labelled; each picks a material, each tile a variant.
6. **Wall autotiling** (owner request, 2026-10-22; `src/gen/wall-autotile.ts`). A theme with a
   `wallAutotile` table picks each wall cell's tile (edge walls and interior walls alike) by which
   of its four neighbours are walls too, instead of drawing from `wall`/`longWall`. The table is a
   list of rules `{ when: { up?, right?, down?, left? }, tiles }` (true = a wall there, false = none,
   unnamed = either); the first match wins and the last rule matches anything (tested). Beyond the
   room's edge counts as no wall, so every room frames itself and facing edges still agree in
   solidity. Every rule tile must be `#solid` (tested with the other obstacles). The Magic Maze's
   castle table follows the original MR3 maps (Scarlet_Castle, mr4Demo; neighbour counts over
   every merlinOpen map): vertical runs are towers, top 2 / middle 12 / base 22; horizontal runs the
   crenellated wall face 21; corners and junctions take the tower piece (so a wall face runs off a
   tower, as in the originals); a wall face ending in the open, or a lone wall tile, stops at a
   one-tile tower top (2). Towers with a wall on their left only take the B variant (3 / 13 / 23),
   which the originals put at a wall's right end. In the tower the maze is mirrored, so those
   variants swap sides there (a shading difference only).

A final flood fill over the whole floor checks start room to exit room and every unit; the floor is
regenerated from a derived seed on failure (bounded) and generation throws rather than return a
disconnected map. Generation takes 1-7 ms per floor.

## Units

- Start room: the player (plus the theme's music tile) and the start rewards below, no enemies.
- **Room plans** (owner request, 2026-10-22; replaces the difficulty ramp over y, the quantity
  forms over x, `minDifficulty` and `weightFarX`/`weightFarY`). Each theme has a `units.roomPlan`:
  a grid of cells laid out as on screen (first row = engine y 1, start bottom-left, exit top-right).
  A cell is `start`, `boss` (the exit room: one of the theme's `bosses`), `midboss` (a side corner
  led by a powerful group) or `normal`. Any cell but the start can carry `groups` (one picked at
  random; on top of the cell's counts unless the group is `alone`) and two draws: `producers`
  (dwellings and summoners) and `regulars` (the other enemies), each `{ count: [lo, hi], tiers }`
  with the count drawn uniformly and each unit's tier by the tier weights (a tier the room cannot
  take, by faction or `maxPerRoom`, is skipped), then the choice by its weight within the tier. A
  draw can also be a weighted list of alternatives (the centre's "2-3 weak producers or 1 strong
  one"). `checkRoomPlan` throws unless the plan matches the floor size with the start, boss and
  midboss cells where they belong.
- **Tiers.** Every enemy and dwelling choice is `weak`, `mid` or `strong` within its theme (lists
  below). Summoners are enemy choices tagged `producer` (their weapon is a summon spell in the
  actor data: necromancer, grey ghost, orc mage, Scarlet monk; the shrouder and dark mage do not
  summon).
- **Wildcards** (owner: keep some variance). With `units.wildcardChance` (0.1 on every theme) a
  normal room draws another normal cell's producers and regulars (picked at random) instead of its
  own; it keeps its own groups. Never the start, midboss or boss room.
- **Boss.** The exit room gets one of the theme's `bosses` groups, plus the cell's counts unless the
  group is `alone`; the group's `boss` unit stands 2 tiles in from the floor's far corner (the exit
  room's outer corner tile, `BOSS_TILE`), which the room layout keeps open and connected to its
  openings. The exit room gets the last-stand music.
- **Factions.** Enemy teams hate each other and brawl (engine behaviour,
  `engine-mechanics-enemies-3.md`, Teams). Where a theme mixes rival teams, each choice names a
  faction and a room draws one faction, taking only choices of that faction or of none. A group's
  faction sets its room's; otherwise the faction is drawn by the weight of its choices the room's
  draws can take, among the factions that have a choice for every draw asking for at least one
  unit (so a generator room is never given the maze's producer-less monsters).
- **Corner potions (owner request).** Each side corner room (`farX`, `farY`; never the start or
  exit room) gets two pickups drawn from the theme's weighted `units.potions` list, side by side 2
  tiles in from the floor's outer corner in that room (`potionTiles`: the corner tile as
  `BOSS_TILE` is for the boss, the second one step along x away from the corner), so Merlin has to
  cross the room for them. The room layout keeps those tiles open and connected (like the boss
  tile), no unit is placed on them, and as placements they are covered by the connectivity check;
  a mirrored tower floor mirrors them with the room. The lists favour Quick Charge (manaFlow) and
  Max Blast (manaCapacity), then Burst, with an occasional Walk Speed. Potions only, no medikits or
  maxikits (owner rule, 2026-10-22: the start room's medikit is the floor's one kit).
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
attack)`, +25 energy, temporary invincibility; for `#gmg` `gmgCollected` instead), ported with
Merlin's spells (`docs/notes/engine-mechanics-spells.md`). Only the golden machine gun is still
pending: its tile is skipped ("no actor definition"; `PENDING_SCROLLS`, which `floor-sim.test.ts`
exempts from the ported-actor check). Energy blast is left out (Merlin starts with it).

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

Owner rule (2026-10-22): every spell can come up on every floor. Each list (`spellWeights` in
`themes.ts`) holds every spell of `SPELL_SCROLLS` its objects tileset has a tile for at weight 1,
and the floor's themed spells weighted 3 more (their old weights 1 / 2 / 3 become 4 / 5 / 6). The
forest draws from merlin4Objects, which has no arctic blast or energy beam tile, so it never gives
those two. Themed spells (weights before the bonus): Goblin Forest armySummon 3, energyMines 2,
energyPulseSpell 2, merlinSword 2, healBlast 1 (allies early); Undead Marsh energyPulseSpell 2,
energyMines 2, arcticBlast 2, cBlast 2, armySummon 1, healBlast 1, monsterSummon 1; Dragon Canyon
arcticBlast 2, energyBeamSpell 2, cBlast 2, energyPunch 2, armySummon 1, monsterSummon 1; Magic Maze
energyBeamSpell 3, cBlast 2, energyPunch 2, monsterSummon 2, arcticBlast 1. The tower's no-repeat
rule is unchanged.

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
stays empty. Done with the spell port as a remake decision: `armySummon.startingArmy` in
`assets/tuning.json` (an `ActorDef` field, `{}` by default), recorded in the spells notes.

### Golden machine gun (pending)

Owner note: the Magic Maze (the mage tower, floor 4) should also give the golden machine gun once
`act_gmg` is ported. The data is in place behind `MAZE_GIVES_GOLDEN_MACHINE_GUN = false`
(`themes.ts`); on, the maze's `extras` hold `gmg` (merlinOpenObjects tile 38; merlin4Objects has
none, and the tower takes merlinOpen's tile).

## Themes

Only ported actors with sprites (checked by `floor-sim.test.ts`). Tiles come from the original's
tilesets; every obstacle is `#solid` and every decoration `#none` in its tile key (`floor.test.ts`).

| Floor | Tilesets | Enemies | Dwellings | Exit (one of) |
|---|---|---|---|---|
| Goblin Forest | merlin4 | goblin archers, warriors, bats, goblin mages; orcs | goblin huts, bat trees, mage huts, orc houses | orc camp; hydra trainer (hydra1, goblin hero, warrior) |
| Undead Marsh | merlinOpen | undead: skeleton warriors, throwers, archers, ghosts, commandos, giants; critters: quadranids; bats in either | skeleton dwellings, cocoons, bat trees | skeleton army (skeleton lord); necromancer pair; necromancer and giant |
| Dragon Canyon | merlinOpen | karate guys, kung fu chickens, lizards, plants (traps), boulder monsters, lizard soldiers; hydra1, dragons, dark golems | dojos, boulder caves, dark caves | dark golems (four-arm + double dark golem); dragon's lair; hydra den (hydra3, plants) |
| Magic Maze | merlinOpen | alliance: bomb mages, thunder monks, shrouders; undead: necromancers, dark mages, ghosts; scarlet: warriors, archers, monks; monsters: black orcs, vulture guards | magic portals, skeleton dwellings | dark sorcerer's court (dark mages); Scarlet's guard |
| Golden Fort (not in the tower) | merlinOpen | every floor's enemies, in alliances of teams (see Golden Fort) | every floor's dwellings | any floor's boss group |

Corner groups and tiers: see Room plans.

Looks: the forest is grass with pine copses and rock clumps; the marsh dark grass and marsh water
with barren black and dead trees, skulls and puddles; the canyon brown earth with grey boulder walls,
rock spires and cacti; the maze blue cobbles with grey castle walls (towers and crenellated wall faces, autotiled), pots and shrines.

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
one faction per room, corner groups and the boss present, room plans (one midboss, two or more
groups per side corner, plain rooms within their cell's counts and tiers, at most one generator a
room in the regular-enemy half, with wildcards off), tile solidity against the tile keys, object tiles
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
  room plan, bosses and music) with options: `placePlayer` (only the bottom floor
  places the player; later start rooms only play their start music) and `boundaryOpenings`. The floor
  is then moved into the tower and every second one mirrored in x (`placeFloor`,
  `src/gen/floor-transform.ts`), which mirrors its rooms, tiles, openings and units, so the corner
  roles (farX, farY) and the room plan mirror with it. The corners snake: the forest starts bottom-left
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

Five themes on 3x3 floors (the Golden Fort a floor of its own) and the tower of the first four. Known gaps: `mr.loadState` and the snapshot test helpers
fetch maps as converted JSON, so a snapshot of a generated map cannot be replayed yet (it would need
the seed passed to `generateMap`). Start rewards are placed; their spell scrolls (and the army
summon's starting army, and the maze's golden machine gun) wait for the spell port.

## Room plans (owner, 2026-10-22)

The owner's Goblin Forest plan, as on screen (P = producers, R = regulars, counts per room):

| | left | middle | right |
|---|---|---|---|
| top | **midboss**: one group, + R 0-2 weak | many weak generators: P 4-6 weak, R 0-2 weak | **boss** group + P 0-1 weak/mid, R 2-3 weak/mid |
| middle | few weak generators: P 2-3 weak, R 0-2 weak | P 2-3 weak *or* 1 strong; R 1-3 mostly strong | several strong enemies, no generators: R 4-5 strong/mid |
| bottom | **start** (a breather) | few weak enemies: R 2-3 weak | numerous weak enemies: one group + weak R to an HP budget, 8-16 units in all |

Owner rules: in the bottom-right half (below the start-exit diagonal) generators are almost
nonexistent (0 or 1 a room; tested); in the top-left half at most 4 regular enemies; the centre
balances, with fewer generators than enemies and stronger enemies. "Few weak" generators = 2-3,
"many" = 4-6.

- **Goblin Forest and Dragon Canyon** use the plan as is. The canyon keeps the forest's
  orientation because its sketch already put a producer-led group (the golem quarry: boulder
  cave + boulder monster) in the farY corner, which is now its midboss.
- **Undead Marsh and Magic Maze** use the same orientation (owner correction, 2026-10-22: regular
  enemies keep growing along x and generators along y on every floor). Their flip is only the
  tower's mirroring in x. Until then they were reflected across the start-exit diagonal.
- The tower mirrors every second floor after generating it, so the plan mirrors with its rooms.

Groups per special corner (each has at least two; tested). New ones marked *new*:

| Floor | midboss corner | "numerous weak enemies" corner |
|---|---|---|
| Goblin Forest | farY: orc hole (orc house, bow orc) *new*; orc shamans (2 orc mages) *new* | farX: goblin warrior band (4 warriors); archers and bats (3 archers, 2 bats) *new* |
| Undead Marsh | farY: lone necromancer (alone); haunted crypt (skeleton dwelling, 2 grey ghosts) *new* | farX: critter nest (cocoon, 3 quadranids); skeleton patrol (3 warriors, 1 thrower) *new* |
| Dragon Canyon | farY: golem quarry (boulder cave, boulder monster); dark cave (dark cave, dark golem) *new* | farX: dojo class (3 karate guys, 2 kung fu chickens) *new*; lizard pack (4 lizards) *new* |
| Magic Maze | farY: necromancy study (2 necromancers, dark mage); Scarlet chapel (2 Scarlet monks, Scarlet warrior) *new* | farX: alliance squad (2 bomb mages, 2 thunder monks) *new*; Scarlet patrol (2 Scarlet warriors, 2 archers) *new* |

### HP budget: the numerous weak corner (owner, 2026-10-22)

The "numerous weak enemies" corner holds about 8-16 weak enemies with about 800 + 400 * level
starting energy in all, where `FloorTheme.level` is the floor's number (Goblin Forest 1, Undead
Marsh 2, Dragon Canyon 3, Magic Maze 4, as in the map ids; a tower floor keeps its theme's level).
Its regulars are a budget draw (`NUMEROUS_WEAK` in `themes.ts`: `{ count: [8, 16], tiers: weak,
hpBudget: { base: 800, perLevel: 400 } }`): instead of drawing a count, units are drawn one by one
(tier, weight, faction and `maxPerRoom` as for any draw) until the room's group and the drawn units
together reach the budget, never fewer than 8 nor more than 16 units, group included
(`drawToBudget` in `floor.ts`; tested). The cell's groups (warrior band, critter nest, dojo class,
Scarlet patrol, ...) stay on top as before and count towards both.

- **Energies are an input.** The generator stays pure: `generateFloor`, `generateTower` and
  `generateMap` take an `EnergyOf` lookup (`energyLookup(defs)` over the resolved actor
  definitions, `actors.json` with `tuning.json` applied; it throws for a key without one), so a seed
  gives the same floor for a given actor data set, and retuning an enemy's energy can change the
  corner's units. `main.ts` loads the actors (with the map, and the other data in parallel) before
  generating; the render tool and the tests read `public/generated/actors.json`.
- **Observed** (500 seeds each, current tuning): the forest's, marsh's and maze's weak units are
  light (50-175 energy), so those corners usually stop at the 16-unit cap short of the budget
  (forest average 15.2 units, 956 HP against 1200; marsh 15.2 units, 1234 against 1600; maze 14.9
  units, 2137 against 2400); the canyon's (100-200) reach it (11.7 units, 2002 against 2000). Raising
  the cap or lowering the budget is a data change.
- **Supply and space.** The weak tiers have no `maxPerRoom` except the factionless bat (2), so
  every faction a corner group can set supplies 16 (no `maxPerRoom` changes were needed). The
  corner rooms keep at least 36 open tiles inside the unit margin (all themes, 500 seeds), enough
  for 16 units and the two corner potions; a shortfall would still be cut to the free tiles.
- **Wildcards** still apply (10 %): the corner may draw another normal cell's counts instead
  (keeping its group, so it can hold as few as the group's 4-5), and another room may draw the
  budget draw (counting its own group, usually none).

Dropped: the canyon's dragon roost (2 dragons) and the maze's portal ward (portal, shrouder,
thunder monk) no longer fit the "numerous weak enemies" corner; dragons now come as the canyon's
strong regulars, the portal as a weak producer.

### Tiers (for the owner to review)

| Floor | weak | mid | strong |
|---|---|---|---|
| Goblin Forest | goblin archer, warrior, bat; goblin hut | goblin mage; goblin mage hut, bat tree | sword orc, bow orc; orc mage (producer), orc house |
| Undead Marsh | skeleton warrior, thrower, quadranid, bat; skeleton dwelling, cocoon | skeleton archer, commando; grey ghost (producer), bat tree | skeleton giant (necromancers only in fixed groups) |
| Dragon Canyon | karate guy, kung fu chicken, lizard; dojo | plant, boulder monster, lizard soldier; boulder cave | hydra1, dragon, dark golem; dark cave |
| Magic Maze | bomb mage, thunder monk, Scarlet warrior, archer; grey ghost (producer), magic portal, skeleton dwelling | shrouder, dark mage; Scarlet monk (producer) | black orc, vulture guard; necromancer (producer) |

`maxPerRoom` changes to let the plan's counts through: forest orcs 2 (from 1), marsh commando
and giant 2, cocoon 2; canyon dojo and maze portals and skeleton dwellings unlimited; maze vulture
guard 2. The forest's orc house became a dwelling choice (strong), not only a boss unit.

## Owner tuning: marsh necromancers (2026-10-22)

Necromancers are midboss/boss tier in the Undead Marsh, so they no longer come from the random
enemy table there (`maxPerRoom` only ever limited the random draws; the rooms with 2 or 3 were the
fixed groups). The midboss room (farY then, farX since the room plans) holds one necromancer alone, and the exit room's boss is the
skeleton army (with the usual extra enemies), a necromancer pair, or a necromancer with a skeleton
giant. A group marked `alone` gets no other enemies (`UnitGroup.alone`). The Magic Maze keeps its
necromancers as before.

Owner decision (2026-10-22): the numerous weak corner has no unit limit, only the HP budget (the
room's free tiles still cap it). Over 300 seeds the corner averages about 18 units / 1140 HP in the
forest, 19 / 1540 in the marsh, 12 / 2000 in the canyon and 16 / 2260 in the maze; the few rooms
far under budget are wildcard rooms.

Owner tuning (2026-10-22): more weak enemies, more variety.
- Strong rooms get weak company: a cell's `extras` draw adds more regular enemies. The strong
  regulars room (middle-right in the forest's orientation) adds 2-3 weak ones (`WEAK_SPRINKLE`),
  the centre 1-2.
- Variety: outside boss rooms, each copy of a kind already in the room divides that kind's draw
  weight by one more (1, 1/2, 1/3, ...), so busy rooms mix kinds. Over 200 seeds the strong room
  averages about 7 units of 4-5 kinds (2-3 in the maze, whose factions are narrow), the centre
  5-6 units of about 4 kinds, and the numerous weak corner about 3 kinds.

Owner tuning (2026-10-22): necromancers should be a regular sight in the Magic Maze. Its two
generator rooms (top middle, middle left) draw their producers as `{ weak: 2, strong: 1 }`
(`WEAK_SOME_STRONG`) instead of weak only, and the necromancer (the maze's one strong producer,
undead, at most 2 a room) weighs 5 instead of 2, which also makes undead generator rooms likelier
(a room's faction is drawn by the weight of its choices). The other factions have no strong
producer and fall back to weak ones. Over 200 seeds: floors with at least one necromancer
158 -> 184, with two or more 108 -> 151, necromancers in all 319 -> 530; floors with one outside
the midboss and boss rooms 11 -> 115 (tested loosely: over a third). Ninjas were checked for the
undead faction: they are on the `ninja` team, which hates the undead and is hated by them, so
they stay out of it.

## Golden Fort (owner, 2026-10-22)

`randomly_generated/5-golden-fort`: level 5, listed after the maze, not part of the tower
(`TOWER_THEMES` holds the tower's four; `THEMES` adds the fort).

- **Look** (merlinOpen tilesets): the golden palace rows of merlinOpenActive, which no original map
  uses. Ground: the cream palace floor (passive 36) with an occasional gold floor tile (17, 1 in
  41). Walls, edge and interior, autotiled (`GOLD_WALLS`): a horizontal run is the banded wall face
  (25) ending in the column with the wall running off to its right (24) or left (26); vertical runs
  are plain columns (14) with a dome (4) where a column's top stands free; a lone wall tile is a
  column. Interior walls: 1-thick baffles (65 % of rooms, 1-2 walls, 50-70 % across) and sometimes
  a long wall (25 %), straight lines that read as ramparts and keep the rooms roomy. Obstacles:
  gold heaps (5, 6, 15, 16) and white/beige urns; stumps a lone gold column or dome; walkable gold
  coins and pebbles.
- **Enemies: everything.** The fort's tables are every tower floor's enemies and dwellings
  (`everyThemesChoices`; goblins and orcs use merlinOpenObjects' tiles 61-74, so the fort's object
  tiles add those), each at weight 1 with its own floor's tier and `maxPerRoom`, and its engine team
  as its faction (`TEAM_OF`, tested against the actor data).
- **Factions: alliances.** Teams that hate each other brawl at once, so a fully mixed room would
  empty itself before Merlin arrives. Instead each room draws an **alliance** of teams with no hate
  either way between them (`UnitTuning.alliances`; tested against `assets/teams`): greenskins and
  beasts (goblins, orcs, monsters, swamp, cave; weight 3), the dead and the red (undead, Scarlet,
  cave; 2), martial beasts (karate, monsters, swamp; 2), dojo and Scarlet (karate, Scarlet; 1), the
  magical alliance on its own (it hates every other enemy team; 1). Rooms still mix 2-4 teams of
  very different units, which is the owner's "very random", without instant brawls. A group (the
  boss) needs an alliance holding its faction and its units' factions (the hydra trainer's
  goblins: greenskins only). A test over every theme checks that no room holds two teams that hate
  each other.
- **Budget rooms.** Every room but the start is one `mixed` draw (producers and regular enemies
  from one table, all tiers equal) to an HP budget drawn per room in 1500-2000 (`HpBudget.spread`).
  Producers (dwellings and summoners) count `max(energy, 100) * 3` (`HpBudget.producers`): a goblin
  hut, portal, dojo or cocoon counts 300, a necromancer 300, a Scarlet monk 525, an orc mage 600, a
  boulder cave 1575. The budget is `capped`: a unit that would take the room past 2000 is not drawn,
  so the dark cave (3000) never comes and the big ones (black orc, vulture guard 800) only into
  rooms with room for them. No unit cap but the free tiles. Without the cap 17 % of rooms went over
  2500 (a dark cave on top of a full room).
- **Boss room**: one of every tower floor's bosses (faction: its own, or its boss unit's team), on
  the boss tile as everywhere, plus the budget draw (counting the group in) unless the group is
  `alone` (the marsh's necromancer pair and necromancer with giant). No midboss.
- **Corner potions** in the side corners as elsewhere; no wildcards.
- **Start room**: 10 potions (the usual four, weighted), 2 medikits and one spell scroll drawn from
  every spell at weight 1.
- **Measured** (200 seeds, 1600 budget rooms): 7.3 units a room on average (most 14), budget cost
  460-2000 (average 1800); 61 rooms under 1500, the `alone` boss rooms and rooms whose free tiles ran
  out. Seeds 1 and 2 (units / budget cost / starting energy per room, start room aside):
  seed 1: 6/1880/1680, 10/1735/1035, 7/1940/990 (boss), 12/1640/1155, 9/1935/885, 9/1985/935,
  6/1710/960, 5/1800/1550; seed 2: 10/1895/1195, 12/1640/1440, 7/1825/1375 (boss), 8/1805/805,
  7/1760/660, 5/1925/875, 4/1950/1675, 8/1690/1040.
- Data model additions (other floors unchanged, checked by hashing 30 generated floors of each):
  `HpBudget.spread`, `.producers`, `.capped`; `RoomPlanCell.mixed`; `UnitTuning.alliances`;
  `FloorTheme.wallAutotile`. `drawToBudget` tells its source how much the room may still take.

## Owner tuning (2026-10-23): canyon ground, sharp tiles

- **Dragon Canyon ground:** red sandstone, a remake tile the converter makes from original art
  (`tools/derived-tiles.ts`: merlinOpenPassive 25, the cracked grey stone, re-coloured to
  rgb(235, 140, 85) at brightness 1.12 into the empty slot 37). Picked from renders of sand, grey
  stone, pastel and four brightness levels; it keeps the canyon clearly apart from the marsh's mud.
- **Sharp tiles only:** the tilesets also carry low-resolution, 2x-upscaled variants meant for
  magic-drained areas (merlinOpenActive 74, 83, 92, 93, 102, 103, 112, 113; merlin4Active 45, 74-76,
  81-84), e.g. the boulders 112 and 113 beside the sharp 111. The floors no longer use them: the
  canyon's walls are boulder 111 and the crags, the forest lost its pine clump (merlin4 81), the
  marsh its grey flower (83). `src/gen/tile-resolution.test.ts` detects such tiles from the art and
  fails if a theme places one.

## Owner tuning (2026-10-24): mixed rooms, fewer walls, marsh generators

- **Mixed rooms:** each normal room (not the start, midboss or boss) rolls `mixedFactionChance`
  (0.15), separately from the wildcard roll, to draw from every faction at once, so rival teams share
  the room and brawl. The golden fort keeps its peaceful alliances (0).
- **Fewer walls:** the forest's patches and long walls (patches 3-6, size 2-7, long wall 35 %) and the
  canyon's baffles (1 thick, reach 50-75 %) are trimmed: interior wall share 16.5 % -> 14.5 % in the
  forest and 17.1 % -> 15.2 % in the canyon (100 seeds).
- **Marsh generators:** the owner made skeleton dwellings mid tier (and 75 health in tuning.json, from
  100) and bat trees weak; cocoons and bat trees lost their maxPerRoom caps (2 and 1, from the first
  floors) so the "many weak generators" room can still fill 4-6. New marsh bosses by the owner: a
  necromancer trio, and a necromancer with 12 skeleton archers.

