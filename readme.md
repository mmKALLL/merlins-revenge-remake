# Merlin's Revenge Remake

TypeScript port of the open-sourced Merlin Open engine.

## Run

    pnpm install
    pnpm assets:copy      # needs the original archive's extracted top level directory in assets-mr-original/merlin_open_30_speedy_and_tvs (not included in the git repo)
    pnpm assets:convert
    pnpm dev              # serves on http://localhost:3371/

Query parameters:

- `?map=<id>`: the map, by its path under `assets/maps/` without `.txt` (`works/sam`, `tvsDemo`; the `/` may be written `%2F`). Default `not_fully_tested/mriv_small` (5x1 rooms, MR4 tilesets). Use `?map=combat_test` for combat: a 2x1 test map with a goblin warrior and archer in room 1 and a cluster of goblins in room 2. Regenerate it with `node tools/make-combat-test-map.mjs`, then `pnpm assets:convert`.
- `?camera=room|follow`: hard cut per room (default, the original room-by-room play) or a camera that follows Merlin through a continuous world. In the continuous world (a remake feature) the whole map is one room: every room's enemies and dwellings appear at the start, there are no exits to clear and no room-cleared jingle, and Merlin walks freely up to the map edge. Enemies farther than 6 tiles from Merlin sleep (they stand still, do not attack, produce or heal, but can be hit); they wake within 6 tiles or when hit, and fall asleep again beyond 8 tiles. One hit from beyond 8 tiles keeps them awake for at least 6 s. Nav mode (fast walking) is on while no awake enemy is within 8 tiles. Room music tiles still play when Merlin walks into their room. The distances and times are the player's `wakeDistance`, `sleepDistance`, `hitWakeTicks` and `navModeClearRadius` in `assets/tuning.json`.
- `?seed=<n>`: the sim's random seed (default: the current time); a restart after death picks a new one.
- `?debug=0`: hides the debug text next to the energy bar.

Controls:

- WASD or the arrow keys move.
- Hold E or the left mouse button to charge the energy blast; releasing fires it at the mouse.
- Hold Space to charge and fire at the nearest enemy. Press F to toggle Space to a push-back shot that lands 20 px short of the nearest enemy; the current mode shows below the game.
- The bar at the bottom left is Merlin's health; the map restarts when he runs out.
- The buttons below the game set the pixel size: 1x-4x screen pixels per game pixel (default 2x, scaled further by browser zoom) or "fit", the largest whole multiple that fits the window. The choice is remembered.
- Next to them, **Music** and **Effects** turn music and sound effects on or off (Effects off also cuts the sounds already playing; Music back on restarts the current room's track), and **Vol** sets the master volume (default 70). All three are remembered. Browsers keep audio silent until the first key press or click on the page.
- Music follows the original's room music tiles (`musicLastStand`, `musicOff`, ...): entering a room with one starts or stops that track, other rooms keep the current one. The track loops (the original played it once). None of the converted maps places a music tile yet.
- The map browser next to them shows one folder of `assets/maps/` at a time, opening in the current map's folder: "(go back)" goes up, `works/` style entries open a subfolder, and a map (`name (WxH)`, size in rooms) reloads the page with that `?map=`, keeping the other parameters. Maps that fail to parse are not listed; maps using the MR3 `merlin*` tilesets show placeholder art.
- The star (☆/★) at the end of each map row marks that map as a favourite without loading it (the current map's row has one too). The Favourites list beside the browser shows them as `id (WxH)`, sorted by id, with the current map highlighted; clicking one loads it like the browser does. Favourites are remembered; ones no longer in the map index are hidden.

### Tuning

`assets/tuning.json` is overlaid on the original actor data by `pnpm assets:convert` (see `assets/README.md`). For example, to let the goblin archer shoot from further away:

    {
      "player": { "weapon": "energyBlast" },
      "goblinArcher": { "attack": { "reach": 160 } }
    }

Run `pnpm assets:convert` and reload. The shipped file only grants Merlin the energy blast.

## Check

    pnpm test             # vitest
    pnpm build            # tsc --noEmit && vite build

## Layout

- `src/mr-open/` code ported directly from the Lingo source, one file per original object
- `src/sim/` fixed 30 Hz simulation in world coordinates
- `src/render/` PixiJS renderer, camera, zoom
- `src/input/` keyboard and mouse
- `src/audio/` Web Audio playback of the sim's sound and music events
- `src/data/` loaders for the converted assets
- `tools/` asset copy and conversion
- `docs/` design and engine notes
