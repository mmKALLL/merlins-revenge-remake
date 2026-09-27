# Merlin's Revenge remake: working notes for Claude

A TypeScript port of the open-sourced Merlin Open Director engine (Merlin's Revenge 3/4), made as
a gift for the original author. Fidelity to the original engine comes first; tuning comes after,
through data. Long-term goals: recreate the original faithfully, then build a roguelike on the port
(sketch in `docs/design/the-sorcerers-tower.md`, not being followed yet).

## Where things are

- `src/mr-open/` pure ports of Lingo objects, one file per object, each citing its Lingo source.
- `src/sim/` fixed 30 Hz pure, deterministic simulation (seeded RNG). `state.ts` holds the state
  types; `tick.ts` orchestrates; the sim never touches DOM, PixiJS or audio.
- `src/render/`, `src/audio/`, `src/input/`, `src/data/`, `src/main.ts`: browser side.
- `assets/`: copies of original files (maps, tile keys, actors, teams, sprites, tilesets, sounds,
  music) plus `tuning.json` (balance overrides) and `map-patches/` (test content on top of maps).
  `assets/extracted/` holds staged material not yet wired in.
- `tools/`: `copy-assets.ts` (the only code allowed to read `assets-mr-original/`),
  `convert-assets.ts` (assets -> `public/generated/`), `director-extract/` (Director cast extraction).
- `docs/notes/engine-mechanics-*.md`: how the original engine behaves, with Lingo line references.
  Read the relevant one before porting behaviour. `docs/plans/`: designs, plans, progress.

The original archive `assets-mr-original/` is git-ignored and only exists on the owner's machine.
Everything the build needs is copied into `assets/`. Cloud sessions can ask the owner for the
reference bundle (`mr-open-reference.zip`: the Lingo under `casts/`, all data files, every `anm_*`
cast member as PNG with `regpoints.tsv`); do not commit it wholesale.

## Rules

- Follow the original engine. Where the owner asks for a change, make it tunable data (an
  `ActorDef` field with an engine default in `src/mr-open/mr-actor-data.ts`, overridden in
  `assets/tuning.json`) and record it as a remake decision in the engine notes.
- New enemy types should be data-only where possible; add behaviour code only for new mechanics.
- Runtime asset URLs go through `import.meta.env.BASE_URL` (Vite `base: './'`). Dev server: port 3371.
- Keep code clean and readable: small named helpers, no magic numbers, no stale comments.
- Tests: only for ported engine behaviour or rules that could silently regress. Do not pin tuning
  values; loosen or delete tests that keep breaking on tweaks.
- Work on a branch; when a slice is done and `pnpm test`, `pnpm tsc --noEmit` and `pnpm build`
  pass, fast-forward merge into `main` unless the owner has uncommitted local changes.
- Commit messages end with a `Co-Authored-By:` trailer naming the Claude model.
- Replies to the owner: about two short paragraphs, outcome first; details go into docs.
- Feedback cards on the KanbanFlow board (owner's machine only, token in `.env`): cyan, in the
  Player feedback column, named "Es - ..."; finished cards go to Review.

## Commands

    pnpm install
    pnpm assets:convert   # assets/ -> public/generated/ (assets:copy needs the local archive)
    pnpm test && pnpm tsc --noEmit && pnpm build
    pnpm dev              # http://localhost:3371/?map=combat_test (map ids are paths under assets/maps: ?map=works/sam)
