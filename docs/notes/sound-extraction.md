# Sound extraction from the engine movie (spike, 2026-09-27)

Goal: every sound the engine plays (SFX + the music-tile tracks) as a playable file, named by cast member.

**Result: all 40 sound cast members are recovered and play.** That is 32 SFX and 8 music tracks. The 6 music-tile tracks are among them. Every sound name the gameplay data refers to was found, except `flap_wings`. It is only a default in an unused script and was never a cast member (see "Missing").

Source: `assets-mr-original/merlin_open_30_speedy_and _tvs/merlin_engine_76_speed.dir` (read-only; copied earlier to the scratchpad as `extract/engine.dir`). The map editor `.dir` and the `.dcr` do not contain any of the sound names (`strings` shows 0 hits), so only the engine `.dir` matters.

## Where the files are (scratchpad, session-specific; copy them somewhere durable)

`/private/tmp/claude-501/-Users-esakoskinen-workspace-mmKALLL-merlins-revenge-remake/c3d19f27-8381-45cd-a67b-130c087e059a/scratchpad/sound/out/` (3.7 MB)

- `<member>.wav`: PCM WAV, mono (32 files).
- `<member>.mp3`: the original MP3 bytes, unchanged (8 files).
- `<member>_orig_fmt17.wav`: the original IMA-ADPCM WAV bytes of the 3 ADPCM members, kept for reference. The PCM `<member>.wav` next to each is the file to use.

Scripts in `scratchpad/sound/`:

| Script | What it does |
|---|---|
| `walk.py` | RIFX/imap/mmap walker. Lists chunk counts and dumps chunks to `bin/<mmapIndex>.<FourCC>`, using drxtract's naming (`*` -> `_`). |
| `survey.py` | Lists CASt members with their type and KEY_ links to sound-related chunks. |
| `convert.py` | Converts every type-6 (sound) member to `out/`. |
| `vol.py` | Prints duration, rate, bits, RMS dBFS, peak and a roughness value (mean \|diff\| / mean \|x\|). Output is in `stats.txt`. |
| `ordercheck.py` | Compares roughness for big- vs little-endian readings (16-bit) and signed vs unsigned readings (8-bit). |
| `match_fankit.py` | Correlates each fan-kit WAV with each extracted WAV after resampling both to 8 kHz. |
| `members.txt` | Member id, name and chunk ids for the 40 sounds. |

Reproduce:

```
cd <scratchpad>/sound
ln -sf ../extract/engine.dir engine.dir
../extract/venv/bin/python walk.py engine.dir bin        # ~5 s, dumps CASt/KEY_/snd/sndH/sndS/ediM/STXT/...
../extract/venv/bin/python convert.py                    # writes out/ (uses macOS afconvert for ADPCM -> PCM)
../extract/venv/bin/python vol.py $(ls out/*.wav out/*.mp3 | grep -v orig_fmt)
../extract/venv/bin/python match_fankit.py <repo>/assets-mr-original/fanGameKit/sfx/mr2_sfx
```

## What worked

### 1. Own RIFX walker instead of drxtract's riffxtract

drxtract's `riffxtract` walks chunks one after another from the start of the file. It dies on a run of zero-size `____` blocks (`struct.error`, see `tileset-extraction.md`). Following the `imap` -> `mmap` table instead works:

- The file is `XFIR` (little-endian RIFX), `MV93`. `pami` is at offset 12, and its body is `count=1, mmapOffset=0x1cef030, version=1860`.
- The `pamm` header is `headerLen=24, entryLen=20, max=670207, used=464235`. Each entry is `fourCC(LE, reversed), len, offset, flags, unk, next`.
- 464,235 entries, of which 445,815 are `free` and 4,466 are `junk` (the file was never "saved and compacted", which is why the RIFX size field of 57,147,456 is smaller than the 59,711,388-byte file).
- **No live entry points past EOF**, and every dumped chunk's own header matches its mmap FourCC and length. The "entries past EOF" failure only happens with a sequential walk. Using the mmap needs no patch to drxtract.
- Live chunk counts: CASt 5836, BITD 3104, STXT 1308, Lscr 348, `snd ` 40, `sndH` 29, `sndS` 29, `ediM` 19, XMED 18, CAS* 8, KEY* 1, MCsL 1.

### 2. Member name -> chunks via CASt + KEY_ (drxtract library)

`drxtract.cast.parse_cast_file_data` gives names, and `drxtract.key.parse_key_file_data('<', KEY_)` gives owner -> chunk links, as in the tileset spike. There are 40 CASt members of type 6 (sound). All 40 are listed in one `CAS*` chunk of exactly 40 entries, owned by cast library 5. `MCsL` lists the casts in order as `Internal, gfx, temp, data, sfx, main, master_objects, script_objects, general_functions`, so cast 5 is **`sfx`**, the cast `soundMaster` reads from (`pSFXCast = "sfx"`).

Every sound member has an empty `snd ` chunk (0 bytes) plus one of these:

- **`sndH` + `sndS` (29 members)**: raw PCM. `sndH` is 100 bytes = 25 big-endian uint32. Useful fields: `[1]` byte length (= len(sndS)), `[9]` frame count, `[11]` sample rate, `[12]` byte rate, `[17]` bits per sample, `[18]` block align, `[19]` channels (always 1), `[20]` bytes per sample. The last 4 words are constant (a GUID-like tag). `sndS` holds **16-bit signed big-endian** or **8-bit unsigned** mono samples. `convert.py` byte-swaps the 16-bit data to little-endian and writes a WAV header.
- **`ediM` (11 members)**: a complete embedded file.
  - 3 are RIFF WAVE with format tag 0x11 (IMA ADPCM, 22050 Hz): `boulder_die`, `goblin_hut_die_02`, `wizard_hit`. `afconvert -f WAVE -d LEI16` turns them into PCM.
  - 8 are MP3: MPEG-2 Layer III, 22050 Hz, mono, 32 kbps. Some start with an ID3v2.4 tag and some with a bare `FFF2` frame sync. These are all the music tracks, and the files are kept as-is.

There are no `swa`/Shockwave Audio members, even though `soundMaster.init` checks for `#swa` when preloading. The `XMED` chunks belong to text members (type 15), not to sounds.

### 3. Checks that the decoding is right

- `afinfo` reads every output file (e.g. `spell_release.wav`: WAVE, 1 ch, 22050 Hz, Int16, 1.00 s; `baroque_rock_v1.mp3`: MPG3, 22050 Hz, 32 kbps, 42.55 s).
- **Fan-kit cross-check (strongest evidence).** 11 fan-kit WAVs correlate at **1.000** with the extracted engine sounds. That means the samples are identical, so the byte order and sample format are right.
- **Byte order.** Big-endian gives much smoother signals than little-endian for almost every 16-bit member (e.g. dragon_hit BE 0.02 vs LE 1.32).
- **8-bit sign.** 8-bit data has a mean of about 127, so it is unsigned.
- **Not silence.** Every file has an RMS between -2 and -33 dBFS and a peak of 0.17 to 1.0, so none is silent. The high-roughness ones (`orc_fire`, `tree_die`, `vulture_hit`, `vulture_fire`, `fangBunny*_fire`) are genuinely noisy SFX. `orc_fire` and both `fangBunny*_fire` sounds are confirmed by the fan-kit match.

## Extracted files (40)

"Used by" gives the key and actor files in `casts/data/` (abbreviated) or the Lingo that plays the sound.

### Music (8, MP3 MPEG-2 L3 32 kbps mono 22050 Hz)

| File | Duration s | RMS dBFS | Used by |
|---|---|---|---|
| `baroque_rock_v1.mp3` | 42.55 | -14.2 | `act_musicBaroqueRock` |
| `baroque_rock_techno_v1.mp3` | 48.59 | -15.9 | `act_musicBaroqueRockTechno` |
| `electronic_merlin_v1_02.mp3` | 205.35 | -17.3 | `act_musicElectronicMerlin`; in-game scene `rescueKing.txt:95` |
| `last_stand_v4.mp3` | 129.20 | -21.2 | `act_musicLastStand` |
| `woods_of_evil_v1.mp3` | 57.55 | -18.4 | `act_musicWoodsOfEvil` |
| `the_ultimate_song_thing_v1.mp3` | 44.67 | -14.5 | score member `dd_playMusic_titleMusic` (text = this name); presumably the title screen |
| `final_stand_2_v1.mp3` | 54.75 | -14.9 | score member `dd_playMusic_creditsMusic`; presumably the credits |
| `merl2319_v1.mp3` | 55.59 | -13.7 | cut scene `cut_scenes/mr3Complete.txt:96` (`playMusic merl2319_v1`) |

`act_musicOff` uses `#musicName: "stopMusic"`, which is a command and not a member. The score member `dd_playMusic_stopMusic` also contains the text `stopMusic`.

### SFX (32, WAV PCM mono)

| File | Duration s | Source format -> output | RMS dBFS | Used by |
|---|---|---|---|---|
| `blackOrc_die.wav` | 0.59 | sndS 16-bit 44100 | -6.1 | dieSound: blackOrc |
| `blackOrc_fire.wav` | 0.51 | sndS 16-bit 22050 | -10.9 | sound: blackAxe |
| `boulder_die.wav` | 0.92 | ediM IMA-ADPCM 22050 -> 16-bit | -15.7 | dieSound: 13 golems, caves and dwellings |
| `boulder_fire.wav` | 0.67 | sndS 8-bit 22050 | -10.7 | sound: boulderMonster, iceRock, summonBoulder |
| `collect_powerup_01.wav` | 0.24 | sndS 16-bit 44100 | -17.9 | collectSound: 21 spell and item pickups; cut scenes at vol 255 |
| `collect_powerup_02.wav` | 0.87 | sndS 16-bit 44100 | -24.9 | collectSound: powerUp |
| `darkGolem_fire.wav` | 0.48 | sndS 16-bit 22050 | -10.6 | sound: 6 golems; explodeSound: cracks |
| `dragon_fire.wav` | 0.37 | sndS 16-bit **3000 Hz** | -16.3 | sound: fireLizard, flameThrower, lizard, undeadDragon |
| `dragon_hit.wav` | 1.09 | sndS 16-bit 11025 | -4.3 | takeHitSound: 6 dragons and lizards, babyOstrich |
| `end_level.wav` | 3.01 | sndS 16-bit 44100 | -14.2 | `gGameCompleteSound` (set in the `GameInitGlobals` movie script, CASt 274) |
| `end_screen.wav` | 0.91 | sndS 16-bit 44100 | -20.7 | `objRoom.pRoomClearedSound` (room cleared) |
| `fangBunnyBaby_fire.wav` | 1.53 | sndS 16-bit 11025 | -15.8 | sound: fangBunnyBaby |
| `fangBunny_fire.wav` | 0.50 | sndS 16-bit 22050 | -16.2 | sound: fangBunny |
| `goblin_fire.wav` | 0.33 | sndS 8-bit 22050 | -19.3 | sound: archerBow, garTower, goblinBow, scArcherBow, skeletonBow |
| `goblin_hut_die_02.wav` | 0.78 | ediM IMA-ADPCM 22050 -> 16-bit | -17.0 | dieSound: 7 huts, dojo, tvBox |
| `greyGhost_die.wav` | 0.78 | sndS 16-bit 22050 | -9.2 | dieSound: greyGhost |
| `heal_spell_explode.wav` | 0.36 | sndS 16-bit 44100 | -2.4 | explodeSound: healBlast |
| `heal_spell_release.wav` | 0.40 | sndS 16-bit 44100 | -2.7 | releaseSound: healBlast |
| `hydra1_fire.wav` | 0.55 | sndS 16-bit 22050 | -32.8 | sound: hydra1, powerOstrich |
| `hydra2_fire.wav` | 0.17 | sndS 16-bit 22050 | -8.6 | sound: hydra2, hydra3 |
| `level_up.wav` | 1.04 | sndS 16-bit 44100 | -18.8 | `modExperience.levelUp` (vol 100) |
| `orc_fire.wav` | 0.12 | sndS 16-bit 22050 | -16.7 | sound: crossBow |
| `quadranid_fire.wav` | 0.68 | sndS 16-bit 11025 | -18.2 | sound: quadranid, babyOstrich, evilTv, skelitonHead, skelitonTorsoTank |
| `skeleton_fire.wav` | 0.43 | sndS 16-bit 44100 | -27.3 | sound: 17 melee weapons (swords, mace, hammer, pitchfork, ...) |
| `spell_charge.wav` | 0.14 | sndS 16-bit 22050 | -7.5 | **unreferenced** in the exported Lingo and data |
| `spell_explode.wav` | 1.47 | sndS 16-bit 22050 | -9.8 | explodeSound: 20 spells, bombs and summons |
| `spell_release.wav` | 1.00 | sndS 16-bit 22050 | -21.2 | releaseSound: 15 spells; explodeSound: energyBeam |
| `tree_die.wav` | 1.66 | sndS 8-bit 8000 | -23.1 | dieSound: batTree |
| `vulture_fire.wav` | 0.71 | sndS 16-bit 22050 | -11.6 | sound: vultureGuard |
| `vulture_hit.wav` | 0.48 | sndS 8-bit 8000 | -8.1 | takeHitSound: vultureGuard (vol 15) |
| `wizard_hit.wav` | 0.88 | ediM IMA-ADPCM 22050 -> 16-bit | -23.1 | takeHitSound: player |
| `wizard_punch.wav` | 0.31 | sndS 16-bit 11025 | -16.8 | sound: player's melee and 16 other punchers (monk, kongFuChicken, ...) |

## Fan-kit WAVs (`assets-mr-original/fanGameKit/sfx/mr2_sfx/`)

These 11 fan-kit files are bit-identical to engine members (correlation 1.000):

| Fan-kit file | Engine member |
|---|---|
| `BO_DIE.WAV` | `blackOrc_die` |
| `BlackOrcFire02.wav` | `blackOrc_fire` |
| `D_HIT.WAV` | `dragon_hit` |
| `DragonFire.wav` | `dragon_fire` (also 3000 Hz in the kit) |
| `FB_FIRE.WAV` | `fangBunny_fire` |
| `FangBunnyBabyFire.wav` | `fangBunnyBaby_fire` |
| `GG_DIE.WAV` | `greyGhost_die` |
| `H1_FIRE.WAV` | `hydra1_fire` |
| `H2_FIRE.WAV` | `hydra2_fire` |
| `OrcFire.wav` | `orc_fire` |
| `QuadranidFire.wav` | `quadranid_fire` |

All other correlations were at most 0.21, so they count as no match. These 14 fan-kit files match no engine member, so they are MR2-only sounds that this engine does not use: `BlackOrcFire01`, `D_DIE`, `FBP_DIE`, `GG_HIT`, `GOB_HIT`, `LS_DIE`, `LizardBabyDie`, `LizardBabyFire`, `N_DIE`, `O_DIE`, `PM_DIE`, `Q_HIT`, `SumoFire`, `laserSpellFire`. `GOB_HIT` matches nothing in particular: the engine's goblins use `goblin_fire` for attacks and have no takeHitSound.

These engine sounds exist only in the `.dir`: all 8 music tracks and `boulder_die`, `boulder_fire`, `collect_powerup_01/02`, `darkGolem_fire`, `end_level`, `end_screen`, `goblin_fire`, `goblin_hut_die_02`, `heal_spell_explode/release`, `level_up`, `skeleton_fire`, `spell_charge`, `spell_explode`, `spell_release`, `tree_die`, `vulture_fire`, `vulture_hit`, `wizard_hit`, `wizard_punch`.

## Missing / oddities

- **`flap_wings`**: this is the default `#flapSound` in `script_objects/objFlyingEnemyCharacter.txt:13`, but no `sfx` member has that name, and no `act_*` file uses `#objType: #objFlyingEnemyCharacter`. It is dead code, so nothing is lost. If it were triggered, `member("flap_wings","sfx")` would not resolve.
- **Other sound hooks that no data file sets**: `#jumpSound`, `#extraLifeSound`, `#growHairSound` and `#hitByHairSound` exist in the code, but every data file leaves them at `#none`.
- **Unreferenced members**: `spell_charge` is not referenced anywhere in the exported Lingo, data or cut scenes. It only appears in the binary as the member name.
- **`dragon_fire` is 3000 Hz** in the original, and in the fan kit too. That is not a decode error.
- **Where the unnamed music plays**: `dd_playMusic_titleMusic` and `dd_playMusic_creditsMusic` are placed as score "mark" sprites. Which frame each one sits on was inferred from the names only; the score (VWSC) was not parsed.
- **MP3 priming and padding**: no gapless metadata was checked. The originals are one-shot (see `engine-mechanics-sound.md`), so looping gaps only matter if the remake decides to loop them.

## Dead ends / not needed

- Patching drxtract's `riffxtract` was not needed: the mmap walk avoids the failing sequential walk.
- `.dcr` (Afterburner-compressed): not attempted, because the `.dir` already has every member.
- ProjectorRays / ScummVM: not needed.

## Extra: enemy and building bitmaps from the engine `.dir` (same session)

The engine `.dir` could be walked, so its sprites can be dumped the same way. `walk.py` now also dumps `BITD`, `CLUT` and `ALFA` chunks. `dump_bitmaps.py [prefix ...]` writes `scratchpad/sound/bitmaps/<name>.png` plus `bitmaps/regpoints.tsv` (name, cast, member#, w, h, bpp, regX, regY). A 3x contact sheet of all of them is in `scratchpad/sound/bitmaps_contact.png`.

- **90 members dumped**, all from the `gfx` cast:
  - `anm_bowOrc_*` 21
  - `anm_swordOrc_*` 27
  - `anm_orcHouse_*` 3
  - `anm_goblinHut_*` 5
  - `anm_goblinMageHut_*` 5
  - `anm_goblinMage_*` 27
  - `anm_spell_*` 2
- **Goblin mage spell.** `act_goblinMage` has `#weapon: #energyBlast`, an `#animType: #magic` attack (`#bullet: #energyBlastBullet`, but there is no `act_energyBlastBullet`). Magic attacks are drawn by `objSpell` (`act_spell`, `#character: #spell`). Its sprites are `anm_spell_charge_03_01` and `anm_spell_fireBullets_03_01`: 1-bit, 63x63 black discs with the reg point at the centre. The engine tints them with `attack.chargeColour` (`objSpell.txt:282`; energyBlast `rgb(255,200,0)`) and scales them with the charge. So the "bullet" is a tinted, scaled disc, not a drawn sprite.
- **Member names.** Only members listed in a `CAS*` table (`member_index.txt`) are used. The file also holds stale CASt copies from a movie that was never compacted, e.g. 4 CASt chunks named `act_energyBlast` of which only one is live. `anm_goblinHut_grave_01_02` exists twice (members 852 and 853); the second is saved as `anm_goblinHut_grave_01_02__member853.png`. There is no `anm_goblinHut_grave_01_01`.
- **Frame naming.** The suffix `_DD_NN` looks like a per-frame duration (`DD`) followed by the frame index (`NN`), e.g. `anm_bowOrc_weaponRanged_02_01 ... _04_09 ... _02_10`. This was inferred from the pattern and not checked against `animStripMaster`.
- **Do they look right?** Yes. Viewed at 3x, they show:
  - green armoured orcs with a bow, and with a sword and shield, including walk cycles and attack swings;
  - straw huts, including the built-up stages;
  - a stone orc house and rubble graves;
  - a small green hooded goblin mage.

  All but the spell discs are 32-bit, decoded with the tileset spike's A,R,G,B-plane RLE decoder. The background is pure white, so treat white as transparent (ink 36, as with the tilesets). The alpha plane is 255 everywhere except `anm_goblinMageHut_stand_03_01`, whose alpha is 0..255.
- **Sizes.** Goblin mage frames are 16x16 with the reg point at (8,8). Orcs are about 25-44 x 27-44. Huts are 20x20 with reg (10,10). The orc house is 40x40 with reg (20,20).
- **Registration points.** They come from the bitmap-specific CASt data: after `infoLen`, a 28-byte block of `pitch|flags (u16), rect top,left,bottom,right (4 x i16), 8 bytes of other fields, regY (i16), regX (i16), flags (u8), bpp (u8), clutCastLib (i16), clutId (i16)`. The regY-before-regX order follows ScummVM's reader. Most sprites have their reg point at about the horizontal centre and vertical centre. Exceptions: the `swordOrc_weaponMelee` swings (e.g. 44x37 with reg (28,20)) and the orc-house graves (reg (20,-2)). Per the walking-and-rooms note, the sprite `loc` is the reg point.
