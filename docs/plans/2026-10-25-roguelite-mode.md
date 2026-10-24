# Roguelite Mode Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** A roguelite run of 4 floors. Each floor is generated and loaded on its own, and Merlin's
state carries over from floor to floor. After each floor the player picks the next biome and a
reward. The run ends in a win or a death, with stats.

**Design:** `docs/plans/2026-10-25-roguelite-mode-design.md` (approved; read it first).

**Architecture:**
- **Sim:** a pure carry-over in `src/sim/carry-over.ts` builds the next floor's sim from the
  finished one.
- **Generator:** `src/gen/roguelite.ts` builds one floor with an opening at the top of its exit room.
- **Browser:** a run controller in `src/run/` sits next to the game loop in `src/main.ts`. It watches
  for the new `floorExit` sim event, pauses, shows the pick screen (a DOM menu panel), applies the
  reward and swaps in the next floor's sim.
- **Tilesets:** every roguelite floor draws from the tower tilesets (`inTowerTilesets`), so the
  Scene's tilesets never change between floors.

**Tech Stack:** TypeScript, Vite, PixiJS 8, Vitest, pnpm.

**Conventions (CLAUDE.md):**
- Shell prefix for every command: `export PATH="$HOME/.nvm/versions/node/v22.17.1/bin:$HOME/Library/pnpm:$PATH" && set -o pipefail &&`.
- Each slice is done when `pnpm test`, `pnpm tsc --noEmit` and `pnpm build` pass. Commit at the end
  of each task. Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Code: small named helpers, no magic numbers, no stale comments.
- Tests: only for rules that could silently regress; never pin tuning values.

---

## Slice 1: carry-over and floor flow

**Done (2026-10-24).** Tasks 1-6 implemented and checked in muted headless Chrome (floors 1-4 with
the record carried, the win, a death back to the title). Deviations from the steps below:
- `markExit` came with Task 1: `floorExit` fires only on a `markExit` map, and `completeMap` skips
  such maps, so a cleared floor never plays the original end.
- The exit test uses Merlin's collision rect against the end room's top (`roomRectPx(end).top`); the
  grid has no `mapTop`. The arsenal needs no `equip`: the player's attack is derived from
  `arsenal.current` (`playerStatsOf`), and his cooldown starts at 0 on the new floor.
- `rogueliteFloor` returns the `GeneratedFloor` (the tests need `floorIsConnected`);
  `rogueliteFloorMap(biome, runSeed, floor, energyOf)` in `roguelite-biomes.ts` gives the map.
  `ROGUELITE_MAP_ID` lives in `generated-maps.ts` with the other ids.
- `run.ts` adds `enterFloor` and `endRun`. The `quit` app action now also applies while playing
  (a roguelite death goes to the title).

### Task 1: the `floorExit` event

**Files:**
- Modify: `src/sim/state.ts` (the `SimEvent` union, about line 177)
- Modify: `src/sim/tick.ts` (`stepPlayerMove`, lines 168-200)
- Test: `src/sim/floor-exit.test.ts` (new)

**Step 1: Write the failing test.** Build a 1x2 map (rooms 18x9, like the `world()` helper in
`src/sim/volley.test.ts`) with `endRoom` the top room and no wall on the top row of that room's
`backgroundActive`.
- Place Merlin in the top room, near its top edge, and hold `move: {x: 0, y: -1}`.
- Within 60 ticks, expect an event `{ kind: 'floorExit' }`, emitted exactly once (`s.floorExited` true afterwards).
- In the bottom room (not the end room), moving off the top of the map emits nothing.
- Cover both world modes, `'rooms'` and `'continuous'` (the last argument of `createSim`).

**Step 2:** Run `pnpm exec vitest run src/sim/floor-exit.test.ts`. Expected: FAIL.

**Step 3: Implement.**
- Add `| { kind: 'floorExit' }` to `SimEvent`, and `floorExited: boolean` to `SimState` (`false` in
  `createSim`).
- In `stepPlayerMove`, after the move, add a helper:
  ```ts
  /** Remake (roguelite): Merlin left the map's end room through its top edge. */
  function leftEndRoomUpward(s: SimState, p: ActorState): boolean {
    const end = s.grid.map.endRoom
    if (!end || s.floorExited || s.room.x !== end.x || s.room.y !== end.y) return false
    return p.pos.y < s.grid.mapTop + EXIT_MARGIN_PX
  }
  ```
  - Use the grid's real accessor for the map's top in px. Find it in `src/sim/world-grid.ts`; it is
    `(end.y - 1) * roomHeightPx` for rooms mode. Keep the name `mapTop` only if it exists.
  - In continuous mode the move is clamped to the map rect (tick.ts:188), so the check needs a margin
    (`EXIT_MARGIN_PX = 2`, a named constant).
- When true: set `s.floorExited = true` and push the event. Do not move the room.

**Step 4:** Run the test. Expected: PASS. Then run `pnpm test` and `pnpm tsc --noEmit`.

**Step 5:** Commit: "Sim: floorExit event when Merlin leaves the end room upward".

### Task 2: the exit room on the mini-map

**Files:**
- Modify: `src/sim/minimap.ts` (`miniMapCells`, about line 21)
- Modify: `src/mr-open/mr-minimap.ts` (`CELL_IMAGES`, about line 57)
- Test: `src/sim/minimap.test.ts` (extend, or create it)

**Step 1: Write the failing test.** A map whose `endRoom` is set (and a flag `markExit: true` on the
map definition) shows the end room as cell kind `'exit'` unless it is the current room.

**Step 3: Implement.**
- Add `markExit?: boolean` to `MapDefinition` (`src/mr-open/mr-map-format.ts`); the roguelite floor
  sets it. Original maps never mark an exit.
- Add the cell kind `'exit'`, drawn with the `'spe'` yellow bevel (`0xffff00` / `0xff9a00`).
- The current room's `'cur'` still wins.

**Step 5:** Commit: "Mini-map: the roguelite exit room in yellow".

### Task 3: a roguelite floor generator

**Files:**
- Create: `src/gen/roguelite.ts`
- Test: `src/gen/roguelite.test.ts`

**Step 1: Write the failing test.** For each of `TOWER_FLOORS` (from `src/gen/tower.ts`) and seeds
1..20, `rogueliteFloor(theme, seed, energyOf)`:
- returns a map whose exit room has an opening on its top edge: `backgroundActive` row 0 has
  walkable tiles in that room;
- has `markExit` true;
- passes `floorIsConnected`.

**Step 3: Implement.**
```ts
// Roguelite floors (docs/plans/2026-10-25-roguelite-mode-design.md): one generated floor of a theme on
// the tower tilesets, its exit room opened at the top so Merlin can leave the floor upward.
export function rogueliteFloorSteps(theme: FloorTheme, seed: number, energyOf: EnergyOf): Steps<MapDefinition>
```
- Build it like a tower floor: the same `floorSteps` with
  `boundaryOpenings: [{ room: exitRoom(theme.floorSize), edge: 'top', opening }]`. The opening comes
  from `randomOpening(rng, ROOM_SIZE.x, theme.edges.endOpening)`, as `stairOpenings` in tower.ts:103-111.
- Use `inTowerTilesets(theme)`.
- Set `markExit: true` on the resulting map.
- If `edge-check.ts` rejects border openings, pass the same allowance the tower uses.

**Step 5:** Commit: "Generator: roguelite floor with a top exit".

### Task 4: the map id and the biome table

**Files:**
- Create: `src/gen/roguelite-biomes.ts`
- Modify: `src/gen/generated-maps.ts` (add a KIND)
- Test: extend `src/gen/roguelite.test.ts`

**Step 1: Write the failing test.**
- `ROGUELITE_FLOORS` has 4 entries, each a list of 1 or more themes. For now it holds the existing
  themes only (slice 3 adds the new ones).
- `isGeneratedMapId('randomly_generated/tower-roguelite')` is true.
- `generateMap` of that id gives floor 1 of one of `ROGUELITE_FLOORS[0]`.

**Step 3: Implement.**
- `export const ROGUELITE_FLOORS: readonly (readonly FloorTheme[])[] = [[GOBLIN_FOREST], [UNDEAD_MARSH], [DRAGON_CANYON], [MAGIC_MAZE]]`.
- `export const ROGUELITE_MAP_ID = 'randomly_generated/tower-roguelite'`.
- `export function firstBiome(runSeed: number): FloorTheme` picks a random biome from floor 1's
  options, seeded by `GenRandom`.
- Add the KIND `{ id: ROGUELITE_MAP_ID, mapSize: floor 1's size, steps: (seed, energyOf) => rogueliteFloorSteps(firstBiome(seed), floorSeed(seed, 0), energyOf) }`.
- `floorSeed(runSeed, floor)` derives each floor's seed (hash, as the tower derives its floor seeds).
- Check that `tools/convert-assets.ts` lists the new id in the map index (`pnpm assets:convert`, then
  grep `public/generated`).

**Step 5:** Commit: "Roguelite map id and biome table".

### Task 5: carry-over

**Files:**
- Create: `src/sim/carry-over.ts`
- Test: `src/sim/carry-over.test.ts`

**Step 1: Write the failing test.** Take a finished sim `prev` with the following changes:
- 2 potions drunk (`pickups.potionsDrunk`), 1 medikit in stock;
- an extra weapon (`addWeapon`), current;
- a reserve army entry;
- player energy 120;
- `score.total` 5000;
- tick 900.

`carryOver(prev, next)`, where `next` is a fresh `createSim` of another map, then has:
- equal `pickups.potionsDrunk`, medikit stock, `arsenal`, `army`;
- player energy 120;
- `score.total` 5000 plus whatever `next` itself scored at its start (the start room pays 0);
- `runTicks` of 900 (see below);
- nothing per-map from `prev`: `next`'s actors, rooms and grid are unchanged.

**Step 3: Implement.**
```ts
// Roguelite (docs/plans/2026-10-25-roguelite-mode-design.md, Architecture): what Merlin keeps from one
// floor to the next. Everything else belongs to the floor's map and starts fresh.
export function carryOver(prev: SimState, next: SimState): SimState
```
- Copy `pickups` with `invinceTicks: 0`, `arsenal`, `army` and `score: { ...next.score, total: prev.score.total + next.score.total }`.
- Copy the player's `energy` onto `next`'s player actor.
- Run time: add `runTicks: number` to `SimState` (0 in `createSim`, +1 each `stepSim`), and here set
  `runTicks: prev.runTicks`. Do not reuse `tick`: per-map timers read it.
- Check `equip`/arsenal invariants: the player's current weapon `attack` and `cooldown` must match
  `arsenal.current`. Reuse the helper `stepWeaponChoice` uses (`equip` in `src/sim/tick-weapons.ts`)
  to equip `arsenal.current` on the new player.

**Step 4:** Run the test. Expected: PASS.

**Step 5:** Commit: "Sim: carryOver from one floor to the next".

### Task 6: the run controller and the next floor

**Files:**
- Create: `src/run/run.ts` (pure run state: seed, floor index, biomes chosen, status)
- Modify: `src/main.ts` (`startGame`: the floor swap; the `Game` interface: `nextFloor`)
- Test: `src/run/run.test.ts`

**Step 1: Write the failing test.**
`nextFloorPlan(run)` gives the next floor's index, its biome options (from `ROGUELITE_FLOORS`) and
its seed. After floor 4 (index 3) it reports `'won'`.

**Step 3: Implement.**
- `src/run/run.ts`:
  ```ts
  export interface RunState { seed: number; floor: number; biomes: string[]; status: 'playing' | 'won' | 'dead' }
  export function startRun(seed: number): RunState
  export function nextFloorPlan(run: RunState): { floor: number; options: FloorTheme[]; seed: number } | 'won'
  ```
- `src/main.ts`:
  - In `startGame`, when `mapId === ROGUELITE_MAP_ID`, hold a `RunState`.
  - In the frame loop next to the `mapComplete` and `restartRequested` checks (lines 344-346): if
    `sim.events` has `floorExit`, call `advanceFloor(theme)`. In this slice, without the pick screen,
    use the next floor's first option.
  - `advanceFloor` builds the map with `rogueliteFloorSteps` (run the steps with `runStepsAsync`, as
    `buildGeneratedMapWithSeedInUrl` does, showing the loading screen). Then:
    `world = worldOf(map)`, `scene.invalidateTiles()`, `sim = carryOver(sim, createSim(world.grid, ..., world.startPos, worldModeFor(cfg.cameraMode)))`,
    `audio.handle(sim.events)`.
  - After floor 4: `run.status = 'won'`. Start the existing end sequence for now (`startEndSequence()`).
  - **Death in roguelite:** `sim.restartRequested` ends the run (`run.status = 'dead'`) instead of
    calling `restart()`. Until slice 5 there is no summary, so go back to the title with
    `dispatch({ kind: 'quit' })`.
  - Do not write the seed into the URL per floor; the run seed stays.
- In `startGame`, the `Map.endRoom` check for `mapComplete` must not end a roguelite floor. Check
  `gameComplete` in tick.ts: a roguelite floor never completes the map, since `markExit` maps skip it.

**Step 4: Manual check.** Run `pnpm dev`, open `http://localhost:3371/?map=randomly_generated/tower-roguelite`,
clear a path (K kills the enemies on screen) and walk up out of the exit room. Floor 2 should load with
the same spells, potions and score. Take a muted headless screenshot (`--mute-audio`) of floor 2.

**Step 5:** Commit: "Roguelite: floors one at a time with carry-over". Merge slice 1 into main when
it is green.

---

## Slice 2: the pick screen and the rewards

### Task 7: reward rolls (pure)

**Files:** create `src/run/rewards.ts`; test `src/run/rewards.test.ts`.

- `rollRewards(seed, floor, arsenal, scrollPool): RewardOption[]` returns
  `[{kind:'spell', key}, {kind:'heal'}, {kind:'potions', potions: string[]}]`.
  - The spell is drawn from the floor theme's `startRewards.spellScrolls` weights, minus the weapons
    already held. If all are held, offer potions twice? No: drop to 2 options.
  - The potions are 4-5 of 2 distinct types from `POTION_WEIGHTS`' keys, every split equally likely
    (e.g. 5 potions: 1+4, 2+3, 3+2, 4+1).
- `startingKit(seed, scrollPool): RewardOption[]` gives a spell, a heal and exactly 5 potions of 2
  types.
- Tests: the spell is never held; the potion count is 4-5 with exactly 2 types; the kit has exactly 5
  potions; the rolls are deterministic per seed.

### Task 8: applying a reward (sim)

**Files:** create `src/sim/rewards.ts`; test `src/sim/rewards.test.ts`.

- `applyReward(s, option): SimState`, built on the existing pickup functions:
  - **spell:** `addWeapon` with `defs[key].attack` (as collecting a scroll does; see
    `src/sim/tick-pickup.ts`), plus `startingArmy` if the scroll has one.
  - **heal:** full energy and `medikits.stock + 1` (as collecting a medikit: reuse its helper).
  - **potions:** `drinkPotion` per potion. The bonus energy follows the pickup rules.
- Tests: each kind changes exactly what it should.

### Task 9: the pick screen (UI)

**Files:**
- create `src/ui/floor-pick.ts`;
- modify `src/ui/app-state.ts` (a new screen / panel `'floorPick'`, with the sim paused);
- modify `index.html` styles;
- modify `src/main.ts`.

- The panel has two groups: "Next floor" (2 biome cards: name and a short enemy line) and "Reward" (3
  cards with previews: the spell's scroll art and name, "Full heal + medikit", the potion icons).
- Keyboard: arrows or 1-5. Touch and click: tap a card.
- Cards are disabled for `PICK_LOCK_MS = 800` after the panel opens.
- Once both groups have a pick, the panel closes and calls `advanceFloor(biome)` with
  `applyReward(option)` on the new floor's sim, after the carry-over.
- At run start, apply the full starting kit without a screen (design: the kit is given, not picked),
  on a random floor-1 biome.
- Manual check with a headless screenshot at desktop and phone sizes (muted).

---

## Slice 3: the four new biomes

### Task 10: Deep Forest, Hydra Marsh, Golem Mountain, Golden Palace

**Files:** modify `src/gen/themes.ts` (new `FloorTheme`s), `src/gen/roguelite-biomes.ts` (two per floor).

- Build each biome from the drafts in the design doc, copying the shape of its sibling theme (the
  same `floorSize`, the tower tilesets, a room plan).
- Golden Palace comes from `GOLDEN_FORT`, with hostile teams and the floor-4 budget.
- Set themed spells per biome from the enemies that fire each projectile (see the pools rule in
  `docs/notes/engine-mechanics-spells.md`, Spell pools).
- Tests: every biome generates connected floors over 20 seeds, and its enemies exist in the defs (the
  existing theme tests in `src/gen/floor.test.ts` iterate over `THEMES`; add the new ones there).
- Ask the owner to review the enemy lists before merging.

---

## Slice 4: the location sign and safe arrival

### Task 11: safe arrival

**Files:** modify `src/gen/floor.ts` (placement); test `src/gen/floor.test.ts`.

- `SAFE_ARRIVAL_TILES = 3`: no unit placement within taxicab distance 3 of the start tile on
  roguelite floors (an option on `FloorOptions`, set by `rogueliteFloorSteps`).
- Test over 50 seeds per biome.

### Task 12: location sign

**Files:**
- `src/gen/roguelite.ts` (the sign's placement);
- a sign object: check `merlinOpenObjects` for a sign or post tile. If there is none, the sign is a
  render-side label stored on the map (`MapDefinition.locationSign: { room, tile, text }`), drawn by
  a small `src/render/location-sign.ts`.
- Its placement is a floor tile in the start room that is not on any exit's path (not in an opening's
  column or row band) and not the start tile.
- Test: the sign never sits in an opening band or on the start tile.

---

## Slice 5: run summary, statistics and the main menu entry

### Task 13: statistics (pure, with storage)

**Files:** create `src/data/roguelite-stats.ts`; test `src/data/roguelite-stats.test.ts`.

```ts
export interface RogueliteStats { runs: number; wins: number; floorsReached: number[]; streak: number; bestStreak: number; inProgress: boolean }
```
- `startRun(stats)`: if `inProgress`, the previous run was abandoned, so `streak = 0`. Then set
  `inProgress = true`.
- `endRun(stats, floorsReached, won)`: `runs++`, `floorsReached[floor]++`, `wins++` and `streak++` on
  a win (`bestStreak` follows), `streak = 0` on a death. Then `inProgress = false`.
- localStorage key `mr-remake.rogueliteStats`, read and written with try/catch (as `best-scores.ts`).
- Tests: abandon resets the streak only; a death counts and resets the streak; a win counts and
  extends it.

### Task 14: run summary and the menu entry

**Files:**
- create `src/ui/run-summary.ts`;
- modify `src/ui/title-screen.ts` (a "Roguelite" button that starts `ROGUELITE_MAP_ID` and shows the
  stats);
- modify `src/main.ts` (death or win goes to the summary).

- The summary shows the floors reached, the score, the time (`runTicks / TICKS_PER_SECOND`) and the
  spells collected, then the stats, with New run and Main menu buttons.
- Update `docs/plans/open-items.md` and the board card (n1rpRo74, to Review), and add a "Roguelite
  mode" section to the engine notes (remake decisions).
