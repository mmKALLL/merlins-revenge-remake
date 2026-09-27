# director-extract

`extract_tlk.py` pulls the `tlk_*` tileset bitmaps out of a Macromedia Director MX 2004
`.dir` movie. The PNGs in `assets/tilesets/` were produced with it from the original
map editor movie (`map_editor_open_40_adjustableDisplayScaleAndUpdatedTiles.dir`, not in
this repository). Full spike notes: `docs/notes/tileset-extraction.md`.

## Setup

Needs a Python venv with [drxtract](https://github.com/System25/drxtract) and Pillow:

```
python3 -m venv venv
git clone https://github.com/System25/drxtract.git
./venv/bin/pip install ./drxtract pillow
```

## Run

drxtract's `riffxtract` stage is run first to split the movie into chunks; the script
then reads the `bin/` chunk folder it produces. Byte order is `pc` (the file magic is
`XFIR`, a little-endian RIFX).

```
./venv/bin/riffxtract pc mapeditor.dir out_mapeditor
./venv/bin/python extract_tlk.py out_mapeditor/bin png_out [tlk_name ...]
```

Only the `riffxtract` stage of the full `drxtract` pipeline is used; `casxtract` and
`vwscxtract` crash on this movie (it has several casts), which does not matter for
bitmaps.

## drxtract quirks the script works around

- `drxtract/cast/image.py` reads the D5+ bitmap header's `flags2` byte and
  `bitsPerPixel` byte as a single big-endian int16, so a 32-bit member with
  `flags2 = 0x20` reports depth 0x2020. The script masks with `& 0xff` when depth > 32.
- drxtract's 24/32-bit decoder discards the alpha plane, so the script decodes 32-bit
  BITD chunks itself (PackBits RLE, each row four planes A, R, G, B of `width` bytes).
  The alpha plane turned out to be 0xFF everywhere anyway; transparency in the original
  comes from the blit ink (pure white is transparent for the Active and Objects layers),
  which `tools/convert-assets.ts` applies.

- The script reads the pitch and bits per pixel from the CASt specific data itself
  (`bitmap_header`). drxtract reads the `flags2` + `bitsPerPixel` bytes as one signed int16;
  when `flags2 = 0x80` that value is negative and drxtract falls back to guessing the depth
  from the pitch's high byte (8 or 16 bit). Every `tlk_*` member is in fact 32-bit; the
  "8-bit rainbow" `tlk_merlinPassive` and the "16-bit" `tlk_merlinActive`/`Objects`/
  `tlk_merlin4Objects` were 32-bit data run through the wrong decoder.

## Engine movie: sounds, music and enemy bitmaps (2026-09-27)

`assets/sounds/*.wav` (32 effects, PCM), `assets/music/*.mp3` (8 tracks, original MP3 data) and
`assets/extracted/bitmaps/` (90 enemy/hut/spell frames with `regpoints.tsv`) were extracted from
`merlin_engine_76_speed.dir` with the scripts in this folder. `walk.py` follows the file's own chunk
index (drxtract's sequential walk fails on this file); `convert.py` writes the sounds, including
IMA-ADPCM members decoded to PCM; `dump_bitmaps.py` writes the bitmaps. Details and the full file
list: `docs/notes/sound-extraction.md`. How the engine plays them: `docs/notes/engine-mechanics-sound.md`.
