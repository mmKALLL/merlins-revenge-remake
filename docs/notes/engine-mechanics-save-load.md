# Engine mechanics: save and load

Design: `docs/plans/2026-11-06-save-load-design.md` (the owner's decisions). Code:
`src/data/saves.ts` (the store), `src/data/autosave.ts` (when to save and what a death does),
`src/ui/continue-choice.ts`, `src/main.ts`.

## 1. The original (casts/master_objects/saveMaster.txt, gameMaster.txt, movieMaster.txt)

- **One slot.** One save per computer (`setPref(gGameSaveFile, ...)`), checked against
  `pSaveVersion`.
- **Saving.** Save game is a menu command at any time except during a cut scene
  (`gameMaster.isMenuItemShadowed`). It writes the current map (every object's `addSaveData`),
  `potionMaster`, `soundMaster` and `armyMaster`.
- **Loading.** Load game is a menu command. The game over cut scene ends in `goScreen(#gameScreen,
  #loadGame)` (movieMaster.txt:120-121), so "We must try again!" reloads the save.

## 2. Port

- **A save** is the debug sim snapshot (`src/debug/sim-snapshot.ts`, the whole dynamic state) in
  localStorage under `mr-remake.save.<mapId>`, with besides it: `loaded` (the run had loaded a save),
  `layoutSeed` (a generated map's layout, rebuilt from it on Continue), `difficulty` (Merlin's
  energy comes from it) and `music` (the track playing, as the original saved `soundMaster`). The
  index `mr-remake.saves` lists the saves by when they were written; at most `MAX_SAVES` (20) are
  kept, and a write that fails (storage full) drops the oldest other save and tries once more. A
  save is 10-30 kB in the rooms, up to about 120 kB in the open world.
- **When.** After every tick that clears a room: the exits opened (`exitsOpened`), or, in the open
  world (which opens no exits), a room with hostiles in it had its points banked. Not on the
  map-complete tick (owner, 2026-11-06): the save stays the previous room clear's, so Continue on a
  completed map picks up before its last fight. Not with Auto-save off, not on roguelite floors (`markExit` maps and the roguelite
  map id), and not while Merlin is dying (a save of his death would replay it on every load).
- **Opening a map with a save** (a page opened on it, a reload, Play on the title) asks Continue or
  New game. New game drops the save. Continue restores it as `mr.loadState` does; a save naming an
  actor the game no longer has is dropped, and the panel says so before the new game. A save of
  another `SNAPSHOT_VERSION`, or one that does not parse, is dropped quietly when read; one taken
  with other tuning (`dataHash`) still loads (console.info).
- **A death** on a normal map: after the "You Got Wasted!" scene (or its skip) the save loads;
  without one the map restarts as before (engine notes map-complete §2a).
- **Every new run drops the map's save** (`Game.restart`): Restart map, New game, and playing a
  completed map again. Otherwise a death before the first room clear would load the older run.
- **Scores** (engine notes hud §5): two tables per world mode. "No loading" (the bests from before
  saves existed, `mr-remake.bestScoresByMode`) takes only runs that never loaded a save; "with
  loading" (`mr-remake.bestScoresWithLoading`, first a copy of "no loading") takes every run. A run
  that loaded (Continue, or a death's reload) counts in "with loading" only. The map list shows the
  table chosen in Settings, Advanced, Map list scores ("With loading" by default) and tags maps that
  have a save.

## 3. Remake decisions (owner, 2026-11-06)

- Autosave only, no save button; Settings has Auto-save, on by default. With it off nothing new is
  written; existing saves are still offered.
- One save per map instead of one per computer; it stays when the map is cleared (Continue on a
  completed map plays its end again).
- The roguelite never saves or loads.
- The rarer settings (seed in the URL, map list scores, Space targeting, random maps, debug info,
  the resets) fold away under Advanced, whose open state is remembered.
