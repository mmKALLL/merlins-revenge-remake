# Merlin's Revenge Remake

TypeScript port of the open-sourced Merlin Open engine.

## Run

    pnpm install
    pnpm assets:copy      # needs the original archive's extracted top level directory in assets-mr-original/merlin_open_30_speedy_and_tvs (not included in the git repo)
    pnpm assets:convert
    pnpm dev              # serves on http://localhost:3371/

Query parameters:

- `?map=<id>`: the map, by its path under `assets/maps/` without `.txt` (`works/sam`, `tvsDemo`; the `/` may be written `%2F`). Default `not_fully_tested/mriv_small` (5x1 rooms, MR4 tilesets). Use `?map=combat_test` for combat: a 2x1 test map with a goblin warrior and archer in room 1 and a cluster of goblins in room 2. Regenerate it with `node tools/make-combat-test-map.mjs`, then `pnpm assets:convert`.
- `?camera=room|follow`: hard cut per room (default, the original room-by-room play) or a camera that follows Merlin through a continuous world. In the continuous world (a remake feature) the whole map is one room: every room's enemies and dwellings appear at the start, there are no exits to clear and no room-cleared jingle, and Merlin walks freely up to the map edge. Enemies farther than 6 tiles from Merlin sleep (they stand still, do not attack, produce or heal, but can be hit); they wake within 6 tiles or when hit, and fall asleep again beyond 8 tiles. These ranges are a quarter shorter up and down than sideways (ellipses). One hit from beyond 8 tiles keeps them awake for at least 6 s. Sleeping enemies on screen or up to 8 tiles off it now and then take a short stroll near their spawn point (still asleep; walking into wake range wakes them). Nav mode (fast walking) is on while no awake enemy is within 8 tiles. Space's shots only aim at enemies on screen; with none on screen they fly straight ahead. Room music tiles still play when Merlin walks into their room. The distances and times are the player's `wakeDistance`, `sleepDistance`, `hitWakeTicks`, `navModeClearRadius` and `activationVerticalScale` in `assets/tuning.json`.
- `?seed=<n>`: the sim's random seed (default: the current time); a restart after death picks a new one.
- `?debug=0`: hides the debug text next to the energy bar.

Controls:

- WASD or the arrow keys move.
- Hold E or the left mouse button to charge the energy blast; releasing fires it at the mouse.
- Hold Space to charge and fire at the nearest enemy. Press F to toggle Space to a push-back shot that lands 20 px short of the nearest enemy; the current mode shows below the game.
- Press C to switch between the room camera and the follow camera (with it, between the room-by-room world and the continuous world) without restarting the map; enemies keep their energy and positions. The `camera` URL parameter follows, so a reload keeps the choice, and the current camera shows below the game.
- The bar at the bottom left is Merlin's health; the map restarts when he runs out.
- Debug cheats, as in the original: K kills every enemy and dwelling on screen (the current room in the room camera; within 10 tiles of Merlin in the follow camera, the player's `killAllCheatRadius`); they die as usual, with graves, sounds and the exits opening. M heals Merlin to full energy.
- In the room camera, once a room is cleared its open exits are lined with arrows along the room edge, as in the original: green when the room beyond has no enemies left (or never had any), red when it still has some (a room not yet visited counts the enemies placed in it). Map edges and walls get none. The continuous world has no exits and no arrows.
- The map is complete, as in the original, once every room is cleared: visited rooms by killing their enemies, unvisited ones count only if nothing hostile, friendly or special (scrolls) is placed in them (so a map with no enemies at all completes at once, e.g. `new_map`). Clearing a map's `#endRoom`, where one is set, also completes it. In the continuous world the map is complete when no enemy is left anywhere. The last room plays the `end_level` jingle instead of the room-cleared one, the game fades out and the original's end cut scene plays ("Map Cleared!", Merlin: "Woo hoo!"); then press Enter or click to play the map again, or pick another map in the browser. Engine details: `docs/notes/engine-mechanics-map-complete.md`.
- The buttons below the game set the pixel size: 1x-4x screen pixels per game pixel (default 2x, scaled further by browser zoom), "fit", the largest whole multiple that fits the window, or "scale", which fills the window at any multiple. The choice is remembered.
- Next to them, **Music** and **Effects** turn music and sound effects on or off (Effects off also cuts the sounds already playing; Music back on restarts the current room's track), and **Vol** sets the master volume (default 70). All three are remembered. Browsers keep audio silent until the first key press or click on the page.
- Music follows the original's room music tiles (`musicLastStand`, `musicOff`, ...): entering a room with one starts or stops that track, other rooms keep the current one. The track loops (the original played it once). The test maps `combat_test` and `not_fully_tested/mriv_small` have music tiles.
- The map browser next to them shows one folder of `assets/maps/` at a time, opening in the current map's folder: "(go back)" goes up, `works/` style entries open a subfolder, and a map (`name (WxH)`, size in rooms) reloads the page with that `?map=`, keeping the other parameters. Maps that fail to parse are not listed.
- The star (☆/★) at the end of each map row marks that map as a favourite without loading it (the current map's row has one too). The Favourites list beside the browser shows them as `id (WxH)`, sorted by id, with the current map highlighted; clicking one loads it like the browser does. Favourites are remembered; ones no longer in the map index are hidden.

### Tuning

`assets/tuning.json` is overlaid on the original actor data by `pnpm assets:convert` (see `assets/README.md`). For example, to let the goblin archer shoot from further away:

    {
      "player": { "weapon": "energyBlast" },
      "goblinArcher": { "attack": { "reach": 160 } }
    }

Run `pnpm assets:convert` and reload. The shipped file only grants Merlin the energy blast.

## Reporting bugs

When something goes wrong in the game, open the browser console (F12) and run

    mr.exportState()

It returns a JSON snapshot of that moment and copies it to the clipboard (if the browser refuses because DevTools has the focus, run `copy(mr.exportState())` or copy the returned text). Paste it into the bug report. It holds the map id, the seed, the tick, the world mode, the current room, exits and nav mode, the random number state, every actor, the rooms (stored actors, graves, cleared flags) and the inputs of the last 300 ticks leading up to it. The map and the actor data are not included: they come from the map id and the converted assets, and a hash of the actor and team data (`dataHash`) shows whether the snapshot was taken with other tuning.

    mr.loadState(json)

rebuilds that moment in the running page (the JSON as a string or pasted as an object). A snapshot of another map reloads the page with its `?map=` (and the camera of its world mode) and loads it there. A warning in the console means the data hash differs, so the moment may play out differently.

To turn a report into a regression test, save the paste under `src/debug/fixtures/` and build the sim from it with `simFromSnapshot` (`src/debug/snapshot-test-data.ts`), which uses the same converted data as the page; `src/debug/snapshot-fixture.test.ts` is an example. The inputs in the snapshot are context only (they are not replayed); the test steps the sim with its own inputs. Bump `SNAPSHOT_VERSION` in `src/debug/sim-snapshot.ts` when the state shape changes.

## Check

    pnpm test             # vitest
    pnpm build            # tsc --noEmit && vite build

## Layout

- `src/mr-open/` code ported directly from the Lingo source, one file per original object
- `src/sim/` fixed 30 Hz simulation in world coordinates
- `src/render/` PixiJS renderer, camera, zoom
- `src/input/` keyboard and mouse
- `src/cutscene/` cut scene scripts: parser, frame-by-frame player, the map-complete end sequence
- `src/audio/` Web Audio playback of the sim's sound and music events
- `src/data/` loaders for the converted assets
- `src/debug/` state snapshots for bug reports (`mr.exportState()`, `mr.loadState()`)
- `tools/` asset copy and conversion
- `docs/` design and engine notes
