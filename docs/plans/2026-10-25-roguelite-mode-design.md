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
    shows what it holds: the biome's name and enemies, the spell itself, the exact potions.
  - Play continues on the new floor as soon as both choices are made. There is no way back to the
    previous floor.
- **Run end.**
  - Death ends the run; there is no restart of the floor. Moving up from floor 4's exit room wins it.
  - Both endings show a run summary: floors reached, score, time and the spells collected. The stats
    follow, with New run and Main menu buttons.

## Rewards

| Reward | Contents | Preview |
|---|---|---|
| Spell | a random spell Merlin does not hold, drawn from the floor's start-scroll pool (half original spells, half volleys, the biome's themed ones weighted up) | the scroll, its name and writing |
| Heal | full energy and one medikit | "Full heal + medikit" |
| Potions | 4-5 potions split between 2 random types, every split equally likely | the exact potions |

The rolls are deterministic from the run seed. **Placed as pickups** (owner decision, 2026-10-25):
the picked reward, and on floor 1 the whole starting kit, stands as ordinary pickups in the next
floor's start room, in a row in front of Merlin (off his tile, the sign and the doorways), and he
collects them himself: a spell as its scroll, the heal as a maxikit and a medikit, the potions one
by one. Roguelite floors place none of the usual start-room pickups (3 potions, a medikit and a
scroll); the side corner rooms' potions stay. A wizard ally in place of a spell is a later idea. Any
other reward type goes to the owner first.

## Biomes

| Floor | Biome A (existing) | Biome B (new) |
|---|---|---|
| 1 | Goblin Forest | Deep Forest |
| 2 | Undead Marsh | Hydra Marsh |
| 3 | Dragon Canyon | Golem Mountain |
| 4 | Magic Maze | Golden Palace (the Golden Fort floor, adapted) |

A new biome is data: a `FloorTheme` on an existing tileset with its own enemy list, room plan,
dwellings, bosses and themed spells. Enemies may appear in several biomes where they fit, since
theme and variety matter more than exclusivity. The drafts below are for the owner to review.

- **Deep Forest** (forest tiles, denser woods, darker decorations).
  - Weak: goblin warriors, bats, goblin archers.
  - Mid: goblin heroes, goblin mages, plants, fang bunnies.
  - Strong: tree-dwelling producers (bat trees, goblin mage huts), ninjas.
  - Bosses: a fang bunny warren, a goblin hero war band.
- **Hydra Marsh** (marsh tiles, more water).
  - Weak: lizards, bats, cocoons.
  - Mid: lizard soldiers, plants, quadranids.
  - Strong: hydras 1-3.
  - Bosses: a hydra nest, a lizard war party.
- **Golem Mountain** (canyon tiles, more rock).
  - Weak: boulder monsters.
  - Mid: dark golems, lava golems, ice rocks, vulture guards.
  - Strong: double dark golems, four-armed golems.
  - Dwellings: boulder caves and dark caves.
  - Bosses: a golem forge, a vulture eyrie.
- **Golden Palace** (golden palace tiles). The Golden Fort's mixed peaceful alliances become hostile
  palace guards, sized to the floor-4 budget.

## Arrival

- **Location sign.** The place's name stands on a sign in the entry room, on a tile that blocks no
  exit or path.
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
