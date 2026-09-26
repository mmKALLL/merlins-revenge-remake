# Walk-and-rooms: execution progress

Plan: `docs/plans/2026-09-26-walk-and-rooms-plan.md`. Branch: `walk-and-rooms`. Method: subagent-driven development (fresh implementer per task batch, then spec review, then code quality review).

## Status (2026-09-26, later)

| Task | Implemented | Spec review | Quality review |
|------|-------------|-------------|----------------|
| 1-2 Scaffold, copy assets | 4fd4cee, 2dc1e7e | pass | approve |
| 3-5 Parsers | abce769, aaa84b6, 342991f, hardened in dc10245 | pass | approve, follow-ups done |
| 6-7 BMP, atlas, converter | 04eaddf, 9c5e376, follow-ups 92af0f7 | pass | approve, follow-ups done |
| 8-11 Movement, grid, collision, exits | 0455f66..1347b76 | pass | approve, follow-ups in progress |
| 12-13 Sim tick, input | 5799570, 42961da | pass | in progress |
| 14-16 Loaders, renderer, main | 3baab97, 5efd634, e61bb73 | followed plan + adjustments | in progress |
| 17 Readme and notes | d2b553e | | |
| 18 Tileset extraction spike | not started | | |
| Extra: mriv_small map + all tile keys | 793ba6b | | |

Headless run of the simulation on mriv_small (real data) behaves as expected: 2 px/tick, walk cycle, cut to room 2 at x=576.

Open gate: in-browser verification by a human (Task 16 step 2 checklist) has NOT been done yet.

## Findings from implementers and reviewers

- `assets/maps/tvsDemo.txt` has one stray trailing `]`; the Lingo parser now tolerates stray trailing `]` only (test added). The original engine's `value()` tolerated it too.
- `assets/maps/mr4Demo.txt` does not parse: unbalanced brackets and garbage around byte 418400. Looks like a corrupted export. Either find another copy in the archive (`maps/new/mr4Demo.txt` exists, untested) or drop it from the copy list and the readme's map list.
- `assets/tile-keys/merlinOpenPassive.txt` has no symbols (all blank), so its parsed symbol list is empty. The placeholder tileset for the passive layer must size itself from the tile indices used in maps, not from the key. Task 7 needs a small adjustment: count tiles as max(key length, highest index referenced by any map layer using that tileset).
- Quality review minor items for `tools/copy-assets.ts`: anchor paths on the script location, give a clear error when the archive is missing, use `dirname`, sort `readdirSync` output. Fold into Task 7 when writing `convert-assets.ts`.
- TypeScript resolved to 7.0.2. Works so far; pin to 5.x if it misbehaves.
