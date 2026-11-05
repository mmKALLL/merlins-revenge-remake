# Save and load (design, 2026-11-06)

Autosaves per map, built on the debug snapshot, plus a with-loading best score per map and an
Advanced settings section.

## The original (casts/master_objects/saveMaster.txt, gameMaster.txt, movieMaster.txt)

- **One slot.** One save per computer (`setPref(gGameSaveFile, ...)`), checked against
  `pSaveVersion`.
- **Saving.** Save game is a menu command at any time except during a cut scene
  (`gameMaster.isMenuItemShadowed`). It writes the current map (every object's `addSaveData`),
  `potionMaster`, `soundMaster` and `armyMaster`.
- **Loading.** Load game is a menu command. The game over cut scene ends in `goScreen(#gameScreen,
  #loadGame)` (movieMaster.txt:120-121), so "We must try again!" reloads the save.

## Owner decisions (2026-11-06)

- **Autosave only.** No save button. A setting, "Auto-save", sits in the regular settings and is
  on by default.
- **Kept after a clear.** The save stays when the map is cleared.
- **No roguelite saves.** The roguelite never saves or loads.
- **Opening a saved map** asks each time: Continue or New game.
- **A death** loads the autosave after the "You Got Wasted!" scene, as the original does. With no
  save, the map restarts as now.
- **Two bests per map.**
  - "With loading" is the best of every run. It starts as a copy of the existing bests.
  - "No loading" is the best of runs that never loaded a save. A no-loading run that improves its
    score overrides both.
  - The map list shows the with-loading bests by default, with a setting to switch.
- **Advanced settings.** A foldable section holding the seed in the URL, the map list's score
  type, Space targeting, random map layout, debug info, and the score and statistics resets.

## Design

1. **Saves.**
   - One autosave per map id, in localStorage under its own key (e.g. `mr-remake.save.<mapId>`).
     It is the sim snapshot (`src/debug/sim-snapshot.ts` `serializeSim` / `deserializeSim`), which
     already holds the whole dynamic state keyed by map id and seed.
   - A generated map's save keeps its seed, so loading rebuilds the same layout.
   - The save also carries a `loaded` flag for the run, used for scoring.
   - It is written on each room clear, the last one included (the map-complete tick).
   - With Auto-save off, nothing new is written; existing saves are still offered.
   - Roguelite floors (`markExit` maps and the roguelite map id) never write or offer a save.
2. **Opening.**
   - The map list marks maps that have a save.
   - Opening one asks "Continue" or "New game", in the same overlay style as the other menus,
     keyboard (WASD/arrows, Enter) and touch friendly.
   - New game drops the save, and so does the pause menu's Restart map. Otherwise a death before
     the first room clear would load an older run.
3. **Death.** On a normal map, after the game over sequence, the autosave is restored if there is
   one (the run then counts as loaded); otherwise the map restarts as now. Skipping the scene skips
   to the same result.
4. **Scores.**
   - `src/data/best-scores.ts` gains a second table, per world mode as now: "with loading" next to
     the existing one, which becomes "no loading".
   - First load migration: "with loading" starts as a copy of the existing bests.
   - A run that loaded a save (Continue, or a death's reload) updates "with loading" only. A run
     that never loaded updates both.
   - The map list shows the bests chosen in Advanced settings ("With loading" by default,
     "No loading").
   - Reset scores clears both tables.
5. **Advanced settings.**
   - A collapsible "Advanced" part of the settings panel. Its open state is remembered per viewer.
   - It holds: Seed in URL, Map list scores (new), Space targeting, Random maps, Debug info,
     Reset roguelite statistics, Reset scores.
   - Auto-save, the camera, the frame rate, the army display, the difficulty and the sound stay in
     the regular part.
6. **Stale saves.**
   - A save with a different `SNAPSHOT_VERSION` is dropped quietly.
   - A save taken with different tuning (`dataHash`) still loads.
   - A save naming an actor def the game no longer has is dropped with a short notice.
   - At most `MAX_SAVES` (20) saves are kept: writing a new map's save drops the least recently
     written one, and a failed write (storage full) also drops the oldest and retries once.
7. **Tests.**
   - A save round-trips the sim (save, load, the same state).
   - A death with a save loads it; with none it restarts.
   - Score routing: a loaded run never updates "no loading"; a no-loading run updates both.
   - The migration copies the old bests.
   - Roguelite floors never save.
   - The save cap drops the oldest.

## Not in this slice

The roguelite mid-run saves, several slots per map, and syncing saves between devices.
