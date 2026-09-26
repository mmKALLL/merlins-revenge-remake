# assets

Original Merlin Open files, copied and reorganized by `tools/copy-assets.ts`.
Do not edit by hand. The archive they come from is not in this repository.

- `maps/` Lingo property-list map files; `mriv_small.txt` (5x1 rooms, MR4 tilesets) is the main test map; `combat_test.txt` is a hand-made 2x1 test map for the combat slice (not from the archive; regenerate with `node tools/make-combat-test-map.mjs`)
- `tile-keys/` per-tile collision symbols, 10 tiles per row, 32x32 px
- `map-patches/<map>.json` places extra objects-layer symbols on top of a copied original map at conversion time (e.g. goblins in `mriv_small`'s first rooms for testing); the map copy itself stays identical to the original
- `tilesets/` tile sheets extracted from the Director cast with `tools/director-extract/`, 32 px tiles, tiles per row = width/32 (10 for merlinOpen, 7/8 for merlin4); white is transparent on Active/Objects
- `actors/` actor definitions (`act_<name>.txt` in the original), Lingo property lists resolved parent -> child
- `teams/` team definitions (`tem_<name>.txt` in the original): hate groups and priorities
- `sprites/mer/` (Merlin; folders are named after the actor `name`), `sprites/goblinWarrior/`, `sprites/gar/` (goblin archer), `sprites/gobarrow/` (goblin arrow), `sprites/spell/` 8-bit BMP frames, named `anm_<chr>_<anim>_<delayTicks>_<frame>.bmp`, white is transparent; the goblin grave (`goblin_grave.bmp`, one cast member) is copied as the grave frame of both goblinWarrior and gar
- `keybindings/` original key code bindings (Mac virtual key codes)
- `tuning.json` remake-side overlay applied by `tools/convert-assets.ts` on top of the resolved actor files; not from the archive, edit by hand. The shape is `{ actorKey: { field: value, ..., attack: { field: value, ... } } }`, keyed by actor file key (`goblinArcher` for `act_goblinArcher.txt`) with field names as in the Lingo data. Everything except `attack` is deep-merged into the actor's resolved properties before its starting weapon is looked up, so an overlay can change `weapon`; `attack` is then merged on top of the installed attack (the weapon's, or the natural one). Values must have the original types (a point is `{ "x": 1, "y": 2 }`); a wrong type fails the conversion naming the actor and field. The shipped file gives the player `weapon: energyBlast` because the original grants the blast through a scroll pickup and pickups are not ported yet. Example: `"goblinArcher": { "attack": { "reach": 160 } }` makes the archer shoot from 160 px instead of 100.
