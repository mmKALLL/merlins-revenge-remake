# Roguelite mode: design

Approved by the owner on 2026-10-25, from the board card "Add a proper roguelite mode" (n1rpRo74).
The mode is selected from the main menu ("Roguelite") or with `?map=randomly_generated/tower-roguelite`.
The Sorcerer's Tower (one stacked map) stays as it is.

## Run flow

- **Floors one at a time.** Each floor is its own generated map, built when Merlin reaches it. There
  are 4 floors, each with 2 biomes to choose from (see Biomes).
- **Run start.** Floor 1's biome is picked at random from its two. Merlin starts with a starting kit
  that holds all three reward types:
  - a new random spell;
  - a full heal and one medikit;
  - **5 potions** of 2 random types (fixed at 5 so runs stay fair).
- **Floor end.**
  - The floor's exit room shows yellow on the mini-map, as the entrances do now. Moving up out of it
    ends the floor.
  - The game pauses on a pick screen. The player picks the **next floor's biome** (one of 2) and a
    **reward** (one of 3) on the same screen, by keyboard, touch or click.
  - The choices become selectable 0.8 s after the screen opens, to prevent misclicks. Every option
    shows what it holds: the biome's name and a row of its enemies' icons, the spell itself, the
    exact potions.
  - Play continues on the new floor as soon as both choices are made. There is no way back to the
    previous floor.
- **Run end.**
  - Death ends the run; there is no restart of the floor. Moving up from floor 4's exit room wins it.
  - Both endings show a run summary: floors reached, score, time and the spells collected. The stats
    follow, with New run and Main menu buttons.

## Rewards

| Reward | Contents | Preview |
|---|---|---|
| Spell | a random spell Merlin does not hold, drawn from the floor's start-scroll pool (every original spell at weight 2, every volley at 1; owner, 2026-10-26) | the scroll, its name and writing |
| Heal | full energy and one medikit | "Full heal + medikit" |
| Potions | 4-5 potions split between 2 random types, every split equally likely | the exact potions |

The rolls are deterministic from the run seed. **Placed as pickups** (owner decision, 2026-10-25):
the picked reward, and on floor 1 the whole starting kit, stands as ordinary pickups in the next
floor's start room, in a row in front of Merlin (off his tile, the sign and the doorways), and he
collects them himself: a spell as its scroll, the heal as full energy on arriving plus a medikit
pickup (so no pickup is worth leaving behind for later; owner, 2026-10-25), the potions one by one. Roguelite floors place none of the usual start-room pickups (3 potions, a medikit and a
scroll); the side corner rooms' potions stay. A wizard ally in place of a spell is a later idea. Any
other reward type goes to the owner first.

Owner (2026-10-26): no biome favours its own spells any more. Every original spell (the energy blast
and the reserved weapons included) weighs 2 and every volley 1, so of a floor's pick the original
spells take about 42 %, the sword and energy punch about 9 % and the volleys about 49 % (floor 1: 39,
10 and 51 %, since East Woods' tiles have no arctic blast or energy beam). A sword or energy punch
reward comes with 4 faster-movement potions (`walkSpeed`), laid out beside its scroll and shown on
its card.

## Biomes

| Floor | Biome A (existing) | Biome B (new) |
|---|---|---|
| 1 | Goblin Forest: "East Woods" | Deep Forest: "Woods of Mourning" |
| 2 | Undead Marsh: "Dead Woods" | Hydra Marsh: "West Jungle" |
| 3 | Dragon Canyon: "Caves of Fire" | Golem Mountain: "Remorseless Mountains" |
| 4 | Magic Maze: "Scarlet's Storeroom" (Scarlet's floor) | Golden Palace: "Golden Palace" (Ochre's floor, on the Golden Fort's tiles) |

The player sees each biome by the name on its original location sign (in quotes; owner rule
2026-10-25: in-game locations always use the game files' signs). The theme names before the colon
are the working names these docs and the code (theme and map ids) use.

A new biome is data: a `FloorTheme` on an existing tileset with its own enemy list, room plan,
dwellings and bosses. Enemies may appear in several biomes where they fit, since
theme and variety matter more than exclusivity. The owner approved the drafts as drafted; this is
what was built (slice 3, `src/gen/themes.ts`). Each uses the tower floors' room plan (a midboss
corner of generators, a "numerous weak" corner) on the merlinOpen tiles, its floor's level for the
HP budgets, and shows its 4 most common enemies on its pick card (owner, 2026-10-26: each at
its own size, the large ones shrunk to fit; never scaled up).

**The last floor is 4x4 rooms** (owner, 2026-10-26; the roguelite's only, `asLastFloor` in
`src/gen/roguelite-biomes.ts`: the tower keeps its floors 3 wide). Its plan stretches the 3x3 one:
the corners stay, the start-exit diagonal takes the centre cell, the rooms either side repeat their
half's cells. Its side corners hold two medikits each in place of the potions.

- **Deep Forest** (floor 1; dark grass, pines and green trees with many eyed "haunted" trees,
  ferns and reeds; denser thickets and tree lines; music Woods of Evil).
  - Weak: goblin warriors, goblin archers (half their first weights, owner 2026-10-25), lizards,
    quadranids, druids (1 a room; healers with no attack), bugs (5 a room; energy 4, they swarm);
    shuriken ninjas.
  - Mid: goblin heroes, goblin mages (twice their first weight), plants, fang bunny babies (2 a
    room), fang bunnies (1 a room).
  - Strong: ninjas (2 a room). Dwellings: goblin huts (weak); cocoons, goblin mage huts and the
    ninjas' mysterious clouds (strong, 1 a room).
  - Midboss: a ninja hideout (a cloud, a ninja, a shuriken ninja) or a critter nest. Weak corner:
    goblin raiders or a fang bunny litter.
  - Brawls: the woods against the ninjas.
  - Bosses: a fang bunny warren (the portal and a fang bunny), a goblin hero war band (3 heroes,
    3 warriors, a mage).
- **Hydra Marsh** (floor 2; swamp ground with puddles everywhere, reed lines, swamp trees, ferns
  and wet blue rocks; music Last Stand). One faction (`jungle`): its teams leave each other alone.
  - Weak: lizards, bats. Dwellings: bat trees.
  - Brawls only (owner, 2026-10-25): shuriken ninjas (weak), ninjas (mid), sword ninjas (strong),
    no mysterious clouds; they fight the jungle's units.
  - Mid: lizard soldiers (weight 3; egg throwers whose eggs hatch bugs), plants.
  - Strong: hydras (2 a room), hydra 2s (1 a room), power ostriches (1 a room; 500 energy, egg
    throwers whose eggs hatch laser-firing baby ostriches); the hydra 3 leads the nest.
  - Midboss: egg throwers (a power ostrich, 2 lizard soldiers) or a bat roost. Weak corner: a
    lizard pack or a plant bed.
  - Owner (2026-10-28): no quadranids or cocoons (the cocoons only hatch quadranids), so floor 2's
    biomes have distinct enemies: the quadranids are the Dead Woods' critters. With the cocoons
    gone the bat trees are the jungle's only dwelling, so the producer draws are all bat trees
    (about 10 a floor, from 4.6).
  - Bosses: a hydra nest (hydra 3, hydra, 2 plants), a lizard war party (3 soldiers, 3 lizards).
- **Golem Mountain** (floor 3; grey stone ground, boulders, crags, dark and blue rocks and ice;
  more and bigger rock patches, long walls and baffles; music Baroque Rock Techno).
  - Weak: boulder monsters, ice rocks (moved from mid: 350 energy, a boulder monster's match).
  - Mid: dark golems, vulture guards, lava golems (2 a room each).
  - Strong: double dark golems, four-armed golems (1 a room each).
  - Dwellings: boulder caves (weak), dark caves (strong, 1 a room).
  - The lava golems are Scarlet's team, who brawl with the monsters' golems, so they hold rooms of
    their own (with ice rocks, who leave both alone). Brawls: golems vs lava, rarer than elsewhere
    (about 7 % of normal rooms), since the lava side has no weak units.
  - Midboss: a golem quarry or fire and ice (2 lava golems, 2 ice rocks). Weak corner: boulder
    rollers or an ice field.
  - Bosses: a golem forge (four-armed golem, dark cave, 2 boulder monsters), a vulture eyrie
    (3 vultures, 2 boulder monsters).
- **Golden Palace** (floor 4, Ochre's floor; owner, 2026-10-26; the Golden Fort's tiles and room
  shapes; music Electronic Merlin). Two factions that hate each other, each holding rooms of its
  own (brawls pit them against each other); Ochre (team blackSorcerer) hates neither:
  - Ochre's elemental mages (the magical alliance): bomb mages (weak), thunder monks (mid), magic
    portals (weak).
  - The orc horde: sword orcs and bow orcs (weak, about the first floor's goblin numbers), orc mages
    (weak summoners, weight 3: they shine), frosty monks (mid; team ice, who hate the magical
    alliance and leave the orcs alone), black orcs (strong, 2 a room), orc houses (mid, 1 a room).
  - Midboss: orc shamans (3 orc mages, an orc house) or an elemental circle (2 portals, a bomb mage,
    a thunder monk). Weak corner: orc raiders, frost monks or a mage squad.
  - Bosses, both led by Ochre: Ochre's elementals (2 bomb mages, 2 thunder monks, a portal) or
    Ochre's warband (3 orc mages, 2 sword orcs, a frosty monk).

Biome A of floor 4, the Magic Maze, became **Scarlet's Storeroom** (owner, 2026-10-26; sign tiles
134-136; it is the tower's top floor too). Scarlet's army and the undead casters leave each other
alone, so they are one faction (her court); the magical alliance's shrouders hate them and hold
rooms of their own:
  - Court: necromancers (mid summoners, weight 6; the generator rooms draw weak and mid producers
    alike), dark mages (strong, weight 3, 3 a room), grey ghosts and skeleton dwellings (weak), and
    Scarlet's army in small numbers: warriors and archers (weak, 2 a room each), monks and lava
    golems (strong, 1 a room).
  - Alliance: shrouders (weak, weight 4), a few bomb mages and thunder monks, magic portals.
  - Midboss (alone): a dark sorcerer's court, Scarlet's guard (2 monks, a warrior, a lava golem) or
    a shrouder coven. Weak corner: a shrouder patrol, or a Scarlet patrol alone (2 warriors, an
    archer, a lava golem).
  - Bosses, both led by Scarlet: her court (3 necromancers, 2 dark mages) or her store guard
    (2 warriors, an archer, a lava golem). The giant black orcs and vultures left the maze; Ochre's
    elementals moved to the Golden Palace.

Dead Woods' quadranids are mid enemies (owner, 2026-10-26: mid on floor 2, as West Jungle's were; weight
2); the cocoons stay weak, and the critter nest corner (a cocoon, 4 quadranids) is left alone, since
the critters have no weak regulars to fill the corner's weak draws.

The tower floors used as biome A gained rivals for their brawl rooms (owner, 2026-10-25; brawl-only
units, never in a room of one faction): East Woods gets skeleton warriors and skeleton archers
against its goblins, orcs and bats (no skeleton dwellings or summoners); Caves of Fire gets shuriken
ninjas (weak), ninjas and sword ninjas (mid), no mysterious clouds. Brawl rooms are described in
`2026-09-28-random-floor-design.md` (Owner decision 2026-10-25).

Every unit of the drafts runs in the sim (checked: each one moves, fires or releases units). Left out:
the fire lizard and fire dragon (the lizard's and the dragon's sprites, untinted) and the lava dark
golem (the lava golem's twin, with no objects tile).

## Arrival

- **Location sign.** The biome's original painted sign (from the game's tiles; its text is the
  biome's name) stands in the entry room, where it blocks no exit or path.
- **Safe arrival.** No enemy within 3 tiles (counting steps across and down) of where Merlin appears.
  The generator moves such units, or does not place them there.

## Statistics

- Kept in localStorage: wins and runs (the win ratio), how often each floor was the furthest reached,
  and the current and best win streak.
- An abandoned run resets the streak and counts nowhere else. Abandoned means a new run started, or the
  page left, while a run was in progress.
- Shown on the run summary and on the main menu's Roguelite entry.

## Architecture

- **Carry-over.** A pure function in `src/sim` takes the finished floor's state and builds a new sim
  for the next floor's map. It copies Merlin's record across: energy and maximum, potion upgrades,
  arsenal and current weapon, medikits, the reserve army, the run's score and its time. Each floor
  starts otherwise clean: no graves, sleepers, room states or mini-map from the last one. The same
  record is the core of the later save and load.
- **Run controller.** On the browser side, it holds the run seed, the floor number, the biome
  choices, the pending pick screen and the stats. The sim reports "left the exit room upward" as an
  event; the controller pauses the game, shows the pick screen, generates the chosen floor with the
  reward's pickups in its start room and swaps the sim.
- **Generation.** Each floor's map comes from the existing floor generator with the chosen theme and
  a seed derived from the run seed and the floor number. The sign and the safe arrival are generator
  steps.
- **UI.** The pick screen is a DOM overlay like the menus (keyboard, touch, click; selectable after
  0.8 s). The run summary and the stats panel use the same style.

## Build order (slices, each merged when green)

1. Carry-over and floor flow: the exit room marked on the mini-map, the floor end event, a new floor
   built from a fixed biome order, the run start and end.
2. The pick screen and the rewards (with the starting kit).
3. The four new biomes (after the owner reviews the drafts above).
4. The location sign and safe arrival.
5. The run summary, the statistics and the main menu entry.

## Tests

- The carry-over: what is kept and what is reset.
- The reward rolls: the spell is never one already held; the potion splits; the kit always holds 5 potions.
- Safe arrival: no enemy within 3 tiles.
- The statistics rules: an abandoned run resets the streak only.

Owner tweak (2026-10-25): Woods of Mourning has no bats (they could not be seen on its dark ground):
lizards and quadranids are weak units instead, a cocoon replaces the bat tree, and the bat roost
midboss is a critter nest (a cocoon and 3 quadranids).
Woods of Mourning's ground is the sea-green grass (merlinOpenPassive 28) instead of the dark grass
(22), so its enemies stand out (owner, 2026-10-25).

Loadout (owner, 2026-10-25): a roguelite run starts with only the punch; the energy blast is a scroll in
the reward pools (an original spell's weight, 2, `ENERGY_BLAST` in `src/run/rewards.ts`), and the starting kit's spell is
always an attack (not the heal blast). The sword and energy punch (and the golden machine gun once
ported) are never start-room scrolls: a floor's end may offer one Merlin lacks in place of the new
spell, at weight 2 per biome (`RESERVED_WEAPONS`), the melee two with 4 speed potions.

West Jungle has druids too (weak, at most 1 a room, and one in the hydra nest boss room): they heal
the jungle's monsters and hydras (owner, 2026-10-25).
Caves of Fire has a rare druid (weak, weight 0.3, at most 1 a room) beside its dragons and golems.

West Jungle has a fang bunny portal beside its bat trees (weak dwelling, at most 2 a room: about 4.3
portals and 6.8 bat trees a floor); Golden Palace's orc horde has TV boxes (evil TVs, weak, at most
1 a room, about 1.1 a floor) (owner, 2026-10-28).
