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

- Old `tlk_merlin{Passive,Active,Objects}` colours are wrong (8-bit palette lookup / 16-bit RGB555 byte order in drxtract). Resolved 2026-09-27: all of them are 32-bit members misread by drxtract (see the last update).
- The PNGs live in the session scratchpad; decide where in the repo (or outside it, given licensing) they should be stored and wire `tools/convert-assets.ts` to use them instead of the placeholder sheet (white -> transparent for Objects).


## Update 2026-09-26: merlin4Objects

The 16-bit decode of `tlk_merlin4Objects` was wrong (stretched 2-4x vertically, streaked, yellow tint). The archive's `mini_projects/correctMR4Objects/tlk_merlin4Objects.png` is a clean 256x448 RGBA export of the same sheet with a white background, so `tools/copy-assets.ts` now copies that file over `assets/tilesets/merlin4Objects.png`. The older `merlinActive/Passive/Objects` sheets remained placeholders (fixed 2026-09-27, below).

## Update 2026-09-27: MR3 sheets recovered, the "8/16-bit" members were 32-bit

`tlk_merlinPassive`, `tlk_merlinActive`, `tlk_merlinObjects` (the MR3 sheets, used by 25 maps:
most of `works/`, all of `wont_work/`, `not_fully_tested/merlindemoviii`, ...) are now in
`assets/tilesets/merlin{Passive,Active,Objects}.png` with correct colours.

What was wrong: not the 16-bit decoder or a palette. The D5+ bitmap CASt specific data is
`pitch u16 (flag bits on top) | rect 4 x i16 | 8 bytes | regY | regX | flags2 u8 | bitsPerPixel u8 |
clutCastLib i16 | clutId i16`. drxtract reads `flags2` + `bitsPerPixel` as one signed int16. For
these members `flags2 = 0x80`, so the value (0x8020) is negative, the depth override is skipped
and drxtract keeps its guess from the pitch's high byte (0x83 -> 8 bit, 0x84 -> 16 bit). The
spike's `depth & 0xff` fix only caught the positive case (`flags2 = 0x20`). The real depth byte
is 0x20 = 32 for every `tlk_*` member, and the pitch (`& 0x3fff`) is width x 4 (896 for the
224-px sheets, 1024 for the 256-px ones). The "rainbow" palette was likewise a misread; the
CLUT fields are -1 / -101 (system palette), irrelevant for 32-bit.

How it was confirmed: decoding `tlk_merlin4Objects` (map editor CASt 5727 / BITD 6024) with the
existing 32-bit decoder (PackBits, per-row planes A, R, G, B) gives an image pixel-identical to
the archive's clean `correctMR4Objects/tlk_merlin4Objects.png` (0 differing pixels). The same
decoder on the MR3 members (CASt 62 / BITD 5991, 60 / 5995, 4555 / 5999) gives clean sheets:
224x416 Passive (7 per row, 91 tiles), 256x544 Active (8 per row, 136), 256x352 Objects (8 per
row, 88). The highest tile index used by any of the 25 maps fits each sheet. The alpha plane is
0xFF everywhere, so white-keying stays in `tools/convert-assets.ts`.

`tools/director-extract/extract_tlk.py` now reads pitch and depth from the CASt bytes
(`bitmap_header`) instead of drxtract's value, and re-running it reproduces every sheet in
`assets/tilesets/` exactly (RGB compared). The engine movie's copies were not needed; its CASt
headers for these members carry the same pitch/depth bytes (only the registration points differ).

## Update 2026-09-27: sprite palettes and raw 32-bit bitmaps (`dump_bitmaps.py`)

Two more misreads in the engine-movie sprite dump, both fixed in `tools/director-extract/dump_bitmaps.py`:

- **8-bit palette.** drxtract takes the palette from the `clutCastLib` field (always -1, which its
  "stored id - 1" rule turns into -2 = Rainbow). The palette is the next field, `clutId`. The
  MR3-era 8-bit members (`anm_mageOrc_{stand,walk_02_01,charge,release}`) use clutId -101 = System - Win,
  the same built-in palette every 32-bit member names; the movie still holds their imported GIFs
  as `ediM` chunks, and the System - Win decode matches them (green orc, like the 32-bit frames).
  No runtime tint is involved: characters keep `color` black / `bgColor` white (`spriteMaster`),
  and `colourTransform`/`setSpriteColour` are only used by cut scenes, menus and `objSpell`.
  Members with a palette *member* (clutId > 0, a `CLUT` chunk in the same cast): `anm_iceRock_*`
  (member 3111, the blue ice palette) and the unused `anm_scw_*` (3501, 3521).
- **Raw 32-bit BITD.** When the BITD length is exactly pitch x height the data is uncompressed,
  and then the pixels are interleaved A, R, G, B, not four planes per row as in the RLE case.
  Affected (all tiny bullets): `shuriken_fly_03_01`, `batBullet_*`, `fangBunnyBabyBullet_*`,
  `needle_land_*`, `smokePin_land_02_03/04`, the unused `energyBeam_*` (1x1 members are unaffected).

Re-dumping every `anm_*` member changed exactly those 28 files in `assets/sprites/`; the other
2085 frames are byte-identical in RGBA. `anm_blackPotion_stand_03_01` (16-bit) is still skipped.
The owner's reference bundle (`cast_bitmaps/`) was made with the old script, so it carries the
same errors for these members plus `anm_scw_*` and `anm_energyBeam_*`.
