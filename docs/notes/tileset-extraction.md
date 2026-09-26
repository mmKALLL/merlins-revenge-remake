# Tileset extraction from the Director movies (spike, 2026-09-26)

Goal: get `tlk_merlin4{Passive,Active,Objects}` and `tlk_merlinOpen{Passive,Active,Objects}` (plus the older `tlk_merlin{Passive,Active,Objects}`) out of the Macromedia Director MX 2004 `.dir` files as PNG.

**Outcome: success.** All six target sheets (and the three older ones) were extracted from
`assets-mr-original/merlin_open_30_speedy_and _tvs/map_editor_open_40_adjustableDisplayScaleAndUpdatedTiles.dir`
using the RIFF/CASt/KEY_ parsers of drxtract plus a small custom 32-bit BITD decoder. Nothing in the archive was modified; no global installs.

## Where the PNGs are (scratchpad, session-specific -- copy them somewhere durable)

`/private/tmp/claude-501/-Users-esakoskinen-workspace-mmKALLL-merlins-revenge-remake/c3d19f27-8381-45cd-a67b-130c087e059a/scratchpad/extract/png_final/`

| Cast member | PNG size | Source depth | Quality |
|---|---|---|---|
| tlk_merlinOpenPassive | 351 x 447 | 32-bit | good |
| tlk_merlinOpenActive  | 351 x 735 | 32-bit | good |
| tlk_merlinOpenObjects | 351 x 735 | 32-bit | good |
| tlk_merlin4Passive    | 224 x 448 | 32-bit | good |
| tlk_merlin4Active     | 256 x 608 | 32-bit | good |
| tlk_merlin4Objects    | 256 x 448 | 16-bit | good (drxtract 16-bit decoder) |
| tlk_merlinPassive     | 224 x 416 | 8-bit, "rainbow" palette | garbled (wrong palette/decoder); optional, not fixed |
| tlk_merlinActive      | 256 x 544 | 16-bit | shapes right, colours wrong (drxtract 16-bit colour decode); optional, not fixed |
| tlk_merlinObjects     | 256 x 352 | 16-bit | same as above |

Also present in `png_mapeditor/` (same folder, one level up): every other `tlk_*` bitmap in the map editor (`tlk_battleLands*`, `tlk_rapunzel*`, `tlk_tilt*`, `tlk_menu`, `tlk_tools`, `tlk_commands`).

## Is the sheet 10 tiles per row at 32 px, as the key files claim?

Yes for the merlinOpen sheets, with a caveat about the odd sizes:

- Column/row edge analysis (mean colour discontinuity between adjacent pixel columns) shows strong edges at x = 32, 64, 96, 128, ... and y = 32, 64, ... on `tlk_merlinOpenPassive` (score at multiples of 32 is 3-4x the mean; at multiples of 35 it is below the mean). Tile pitch is 32 px.
- Sheets are 351 px wide = 10 full 32-px columns + a 31-px sliver; heights 447 / 735 = 13 / 22 full rows + a 31-px sliver. Lingo's `width/tileSize.x` is integer division, so `objTileSet.makeTiles` yields `pMapSize = point(10, 13)` for Passive and `point(10, 22)` for Active and Objects: **10 tiles per row**, consistent with the `-- 10 tiles per row` comments. The 31-px right/bottom slivers are never addressed. (Key entry counts of 261/228 exceed 220 tiles; the trailing entries are the blank ones noted in `engine-mechanics-walking-and-rooms.md`.)
- The `tlk_merlin4*` sheets are NOT 10 per row: 224 px = 7 columns, 256 px = 8 columns (32-px pitch confirmed the same way).

## Transparency

The 32-bit members carry an alpha plane but it is 0xFF everywhere (checked for all merlinOpen and merlin4 sheets), so the alpha channel is meaningless. Transparency in the original comes from the blit ink (`#ink: 36`, background transparent): the Objects/Active sheets have pure white `(255,255,255)` as the dominant colour (208k of 258k px on Objects) and all corners are white. A converter should treat pure white as transparent for Objects (and Active where applicable), not the alpha channel.

## What was tried, in order

### 1. drxtract (worked, with help) -- https://github.com/System25/drxtract

```
SP=/private/tmp/claude-501/-Users-esakoskinen-workspace-mmKALLL-merlins-revenge-remake/c3d19f27-8381-45cd-a67b-130c087e059a/scratchpad/extract
cd $SP && git clone https://github.com/System25/drxtract.git
python3 -m venv venv && ./venv/bin/pip install ./drxtract pillow numpy
cp ".../map_editor_open_40_adjustableDisplayScaleAndUpdatedTiles.dir" mapeditor.dir
mkdir out_mapeditor && ./venv/bin/drxtract pc mapeditor.dir out_mapeditor   # byte order 'pc' (file magic is XFIR = little-endian RIFX, MV93)
```

- `riffxtract` (stage 1 of the pipeline) succeeded: 648 chunks dumped to `out_mapeditor/bin/` as `<index>.<FourCC>` files (272 CASt, 43 BITD, 118 Lscr, ...).
- `casxtract` (stage 2) crashed with `IndexError` in `parse_cast_file` (script index lookup into the Lctx table; the movie has 7 casts / 7 `CAS_` chunks and drxtract assumes one). `vwscxtract` also crashed (`KeyError: 48`, unknown score frame size). Neither matters for bitmaps.
- Workaround: `extract_tlk2.py` (in the scratchpad) drives drxtract's library functions directly: `drxtract.cast.parse_cast_file_data` on every `*.CASt` chunk (gives name, width, height, depth, palette), `drxtract.key.parse_key_file_data('<', KEY_)` to map cast index -> BITD chunk index, then decodes.
- Bug found in drxtract's bitmap header parser (`drxtract/cast/image.py`): it reads the D5+ header's `flags2` byte and `bitsPerPixel` byte as a single big-endian int16. For the merlinOpen members `flags2 = 0x20`, so depth came out as 0x2020 = 8224 and `bitd2bmp` refused ("Bad BPP value"). Fix in the script: `depth = depth & 0xff` when depth > 32. (Also, the first int16 of that header is the row pitch with flag bits in the top nibble: `0x857c & 0xfff = 1404 = 351*4`, confirming 32 bpp x 351 px.)
- drxtract's 24/32-bit decoder discards the alpha plane, so the script decodes 32-bit BITD itself: PackBits RLE (`v >= 0x80` -> repeat next byte `257-v` times, else copy `v+1` literal bytes) into `pitch*height` bytes, each row being four planes of `width` bytes in order A, R, G, B. Colours verified visually (grass green, lava red, stone grey). 8- and 16-bit members go through drxtract's `bitd2bmp` and Pillow.

### 2. The engine movie (`merlin_engine_76_speed.dir`) -- not needed, and drxtract fails on it

`riffxtract pc engine.dir out_engine` parsed the header (RIFX declares 57,147,456 bytes; file is 59,711,388) and the memory map, then hit `struct.error` after a run of `____` chunks of size 0 -- mmap entries pointing past the end of the file. It wrote 0 chunks. Not investigated further because the map editor movie already contains all target members (the engine's tilesets are the same cast members; the `casts/` folder next to the movies holds only Lingo text, not `.cst` files).

### 3. ProjectorRays / ScummVM -- not attempted

Step 1 succeeded, so these were skipped.

## Reproduce

```
cd $SP
./venv/bin/riffxtract pc mapeditor.dir out_mapeditor          # ~10 s
./venv/bin/python extract_tlk2.py out_mapeditor/bin png_mapeditor [names...]
```

Chunk/member indices for reference (map editor): merlinOpenPassive CASt 5968 / BITD 5868; merlinOpenActive 5881 / 5887; merlinOpenObjects 5634 / 5673; merlin4Passive 5837 / 6015; merlin4Active 5897 / 6019; merlin4Objects 5727 / 6024.

## Open items

- Old `tlk_merlin{Passive,Active,Objects}` colours are wrong (8-bit palette lookup / 16-bit RGB555 byte order in drxtract). Only relevant if those older sheets are ever needed.
- The PNGs live in the session scratchpad; decide where in the repo (or outside it, given licensing) they should be stored and wire `tools/convert-assets.ts` to use them instead of the placeholder sheet (white -> transparent for Objects).
