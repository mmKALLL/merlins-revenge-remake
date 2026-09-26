# Merlin's Revenge Remake

TypeScript port of the open-sourced Merlin Open engine.

## Run

    pnpm install
    pnpm assets:copy      # needs the original archive in assets-mr-original/ (not in git)
    pnpm assets:convert
    pnpm dev              # serves on http://localhost:3371/

Query parameters: `?map=mriv_small|sam|tvsDemo|combat_test` (default `mriv_small`, 5x1 rooms, MR4 tilesets), `?camera=room|follow`, `?debug=0`, `?seed=<n>` (the sim's random seed; a restart after death picks a new one).

Controls: arrow keys/WASD move; hold Space or the left mouse button to charge the energy blast and release it at the mouse; E fires at the nearest enemy, F 16 px short of it. The bar at the bottom left is Merlin's energy; the map restarts when he dies.

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
