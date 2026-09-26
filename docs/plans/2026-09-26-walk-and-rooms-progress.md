# Walk-and-rooms: execution progress

Plan: `docs/plans/2026-09-26-walk-and-rooms-plan.md`. Branch: `walk-and-rooms`. Method: subagent-driven development (fresh implementer per task batch, then spec review, then code quality review).

## Status (2026-09-26)

| Task | Implemented | Spec review | Quality review |
|------|-------------|-------------|----------------|
| 1 Scaffold | 4fd4cee | pass | approve (minor notes below) |
| 2 Copy assets | 2dc1e7e | pass | approve |
| 3 Lingo plist parser | abce769 | pending | pending |
| 4 Map format | aaa84b6 | pending | pending |
| 5 Tile key parser | 342991f | pending | pending |
| 6-17 | not started | | |
| 18 tileset extraction spike | not started | | |

Next action: run spec review for Tasks 3-5 (lines 226-710 of the plan), then quality review, then implement Tasks 6-7 (BMP decoder, atlas, converter).

## Findings from implementers and reviewers

- `assets/maps/tvsDemo.txt` has one stray trailing `]`; the Lingo parser now tolerates stray trailing `]` only (test added). The original engine's `value()` tolerated it too.
- `assets/maps/mr4Demo.txt` does not parse: unbalanced brackets and garbage around byte 418400. Looks like a corrupted export. Either find another copy in the archive (`maps/new/mr4Demo.txt` exists, untested) or drop it from the copy list and the readme's map list.
- `assets/tile-keys/merlinOpenPassive.txt` has no symbols (all blank), so its parsed symbol list is empty. The placeholder tileset for the passive layer must size itself from the tile indices used in maps, not from the key. Task 7 needs a small adjustment: count tiles as max(key length, highest index referenced by any map layer using that tileset).
- Quality review minor items for `tools/copy-assets.ts`: anchor paths on the script location, give a clear error when the archive is missing, use `dirname`, sort `readdirSync` output. Fold into Task 7 when writing `convert-assets.ts`.
- TypeScript resolved to 7.0.2. Works so far; pin to 5.x if it misbehaves.
