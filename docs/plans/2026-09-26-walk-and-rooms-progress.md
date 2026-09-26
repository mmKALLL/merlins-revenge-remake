# Walk-and-rooms: execution progress

Plan: `docs/plans/2026-09-26-walk-and-rooms-plan.md`. Branch: `walk-and-rooms`. Method: subagent-driven development (fresh implementer per task batch, then spec review, then code quality review).

## Status (2026-09-26, evening)

All plan tasks 1-17 are implemented, reviewed and committed; review follow-ups landed in dc10245, 92af0f7, ea8e783, b1e5114. Browser check done by the user on mriv_small: tiles, movement, sliding, room cuts and follow camera all work. Sprite scale corrected to native 16 px and the collision box to 14x14 (b8eb288). Dev server on port 3371 (3fbab32).

In progress: final whole-branch review; Task 18 tileset extraction spike (notes will land in docs/notes/tileset-extraction.md); engine digest for the combat slice (docs/notes/engine-mechanics-combat.md).

Next: merge walk-and-rooms into main, then brainstorm and plan the combat slice (goblin warrior/archer, energy blast, reeling) from the KanbanFlow cards and the combat digest.

## Findings from implementers and reviewers

- `assets/maps/tvsDemo.txt` has one stray trailing `]`; the Lingo parser now tolerates stray trailing `]` only (test added). The original engine's `value()` tolerated it too.
- `assets/maps/mr4Demo.txt` does not parse: unbalanced brackets and garbage around byte 418400. Looks like a corrupted export. Either find another copy in the archive (`maps/new/mr4Demo.txt` exists, untested) or drop it from the copy list and the readme's map list.
- `assets/tile-keys/merlinOpenPassive.txt` has no symbols (all blank), so its parsed symbol list is empty. The placeholder tileset for the passive layer must size itself from the tile indices used in maps, not from the key. Task 7 needs a small adjustment: count tiles as max(key length, highest index referenced by any map layer using that tileset).
- Quality review minor items for `tools/copy-assets.ts`: anchor paths on the script location, give a clear error when the archive is missing, use `dirname`, sort `readdirSync` output. Fold into Task 7 when writing `convert-assets.ts`.
- TypeScript resolved to 7.0.2. Works so far; pin to 5.x if it misbehaves.
- Design items deliberately not built in this slice: the debug overlay's collision-rect toggle, and a URL parameter for the viewport size (it is configured in code in main.ts).
- In room camera mode, for the frames right after a room change (alpha < 1) Merlin is drawn from the new room's origin at an interpolated position and is briefly outside the mask; invisible in practice.
