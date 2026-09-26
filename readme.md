# Merlin's Revenge Remake

TypeScript port of the open-sourced Merlin Open engine.

## Run

    pnpm install
    pnpm assets:copy      # needs the original archive in assets-mr-original/ (not in git)
    pnpm assets:convert
    pnpm dev              # serves on http://localhost:3371/

Query parameters:

- `?map=mriv_small|sam|tvsDemo|combat_test`: the map (default `mriv_small`, 5x1 rooms, MR4 tilesets). Use `?map=combat_test` for combat: a 2x1 test map with a goblin warrior and archer in room 1 and a cluster of goblins in room 2. Regenerate it with `node tools/make-combat-test-map.mjs`, then `pnpm assets:convert`.
- `?camera=room|follow`: hard cut per room (default) or a camera that follows Merlin.
- `?seed=<n>`: the sim's random seed (default: the current time); a restart after death picks a new one.
- `?debug=0`: hides the debug text next to the energy bar.

Controls:

- WASD or the arrow keys move.
- Hold Space or the left mouse button to charge the energy blast; releasing fires it at the mouse.
- Hold E to charge and fire at the nearest enemy, F to fire 16 px short of it.
- The bar at the bottom left is Merlin's energy; the map restarts when he dies.
- The buttons below the game set the pixel size: 1x-4x screen pixels per game pixel (default 2x, scaled further by browser zoom) or "fit", the largest whole multiple that fits the window. The choice is remembered.

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
- `src/data/` loaders for the converted assets
- `tools/` asset copy and conversion
- `docs/` design and engine notes
