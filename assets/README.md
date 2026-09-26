# assets

Original Merlin Open files, copied and reorganized by `tools/copy-assets.ts`.
Do not edit by hand. The archive they come from is not in this repository.

- `maps/` Lingo property-list map files; `mriv_small.txt` (5x1 rooms, MR4 tilesets) is the main test map
- `tile-keys/` per-tile collision symbols, 10 tiles per row, 32x32 px
- `tilesets/` tile sheets extracted from the Director cast with `tools/director-extract/`, 32 px tiles, tiles per row = width/32 (10 for merlinOpen, 7/8 for merlin4); white is transparent on Active/Objects
- `sprites/merlin/` 8-bit BMP frames, named `anm_<chr>_<anim>_<delayTicks>_<frame>.bmp`, white is transparent
- `keybindings/` original key code bindings (Mac virtual key codes)
