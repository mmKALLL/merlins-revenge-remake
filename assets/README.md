# assets

Original Merlin Open files, copied and reorganized by `tools/copy-assets.ts`.
Do not edit by hand. The archive they come from is not in this repository.

- `maps/` Lingo property-list map files; `mriv_small.txt` (5x1 rooms, MR4 tilesets) is the main test map; `combat_test.txt` is a hand-made 2x1 test map for the combat slice (not from the archive; regenerate with `node tools/make-combat-test-map.mjs`)
- `tile-keys/` per-tile collision symbols, 10 tiles per row, 32x32 px
- `tilesets/` tile sheets extracted from the Director cast with `tools/director-extract/`, 32 px tiles, tiles per row = width/32 (10 for merlinOpen, 7/8 for merlin4); white is transparent on Active/Objects
- `actors/` actor definitions (`act_<name>.txt` in the original), Lingo property lists resolved parent -> child
- `teams/` team definitions (`tem_<name>.txt` in the original): hate groups and priorities
- `sprites/mer/` (Merlin; folders are named after the actor `name`), `sprites/goblinWarrior/`, `sprites/gar/` (goblin archer), `sprites/gobarrow/` (goblin arrow), `sprites/spell/` 8-bit BMP frames, named `anm_<chr>_<anim>_<delayTicks>_<frame>.bmp`, white is transparent; the goblin grave (`goblin_grave.bmp`, one cast member) is copied as the grave frame of both goblinWarrior and gar
- `keybindings/` original key code bindings (Mac virtual key codes)
- `tuning.json` remake-side overlay applied by `tools/convert-assets.ts` on top of the resolved actor files (`{ actorKey: { field: value, attack: { field: value } } }`); not from the archive, edit by hand. It gives the player `weapon: energyBlast` because the original grants the blast through a scroll pickup and pickups are not ported yet
