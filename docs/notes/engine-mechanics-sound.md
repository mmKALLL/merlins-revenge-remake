# Engine mechanics: sound and music (Merlin's Revenge original Lingo source)

Source root (abbreviated `casts/` below): `assets-mr-original/merlin_open_30_speedy_and _tvs/casts/`.
Conventions follow `engine-mechanics-walking-and-rooms.md`. The audio files themselves are described in `sound-extraction.md`.

## 1. Where sounds live

- All sounds are members of the cast library **`sfx`** (`soundMaster.init`: `pSFXCast = "sfx"`, `master_objects/soundMaster.txt:31`). There are 40 members, all Director `#sound` (not `#swa`). Every lookup is by name: `member(name, "sfx")` (`soundMaster.txt:182`, `:215`).
- Sound names are plain strings in actor data (`casts/data/act_*.txt`), in Lingo literals, in cut-scene scripts (`playSound <name> [vol]` / `playMusic <name> [vol]`) and in score text members named `dd_playSound_*` / `dd_playMusic_*`.
- `#none` means "no sound": `modSoundFX.playSound` skips it (`script_objects/modSoundFX.txt:17-21`).

## 2. soundMaster (`master_objects/soundMaster.txt`)

### Channels

- Director has 8 sound channels. **Channel 1 is reserved for music** (`pMusicChannel = 1`, `:27`; comment in `general_functions/soundEmptyChan().txt:4`).
- SFX use channels 2-8.

### Volume

- Director `sound(n).volume` runs from 0 to 255.
- The default is `pDefaultVolume = 150` (`:22`). It applies when the volume passed is `void` or `#none` (`calcVolumeDefault`, `:122-127`).
- A reasonable Web Audio mapping is `gain = vol / 255`.

### `playSound(mem, vol)` (`:176-208`)

1. Looks up `member(mem, "sfx")`.
2. If sound is active (`pActive`), resolves the volume and picks a channel:
   - `pNextChan` (2) when channel 2 is free;
   - otherwise the first free channel from 2 to 8 (`SoundEmptyChan`, `soundEmptyChan().txt:15-31`);
   - otherwise channel 0, and **the sound is dropped**. The code that would have overridden the oldest sound is commented out (`:193-197`).
3. Plays with `puppetsound chan, mem` and sets `sound(chan).volume = vol`, one shot.

Two details matter here:

- `VarChangeInRange(pNextChan,1,8,1)` (`:204`) throws away its return value. Lingo integers are passed by value, so `pNextChan` stays 2 forever. In practice the allocator is "first free channel from 2 to 8, else drop". The result is **at most 7 simultaneous SFX**, with new sounds dropped while all 7 are busy. Identical sounds are not merged or limited.
- `pSoundList` (`:53-87`), `pMixMaster` (`:89-92`), `checkadded`/`newframe` (max 4 sounds per frame, `:246-259`) and the `#swa` preload (`:44-50`) are set up but never used for playback. `checkadded` has no callers.

### `playMusic(name, vol)` (`:142-173`)

1. If `name = "stopMusic"`, it calls `stopMusic`, which stops channel 1 (`:145-148`, `:238-240`).
2. `checkRestartMusic` (`:129-140`): if `name` is the last music played **and channel 1 is still busy**, it returns and nothing restarts. The same track is never restarted while it is playing. A different track replaces the current one at once, with no crossfade.
3. Plays with `puppetsound 1, member`, sets the volume (default 150; cut scenes pass 255 by default, see section 4) and records `pLastMusic`.

**Music does not loop.** `puppetsound` plays the member once, and nothing in the Lingo sets looping, re-queues the track or polls for the end. The CASt info flags are identical (0x10) on all 40 members, SFX and music alike. Since the SFX obviously do not loop, the music members carry no loop flag either. So each track plays once (42 s to 205 s) and then there is silence until something calls `playMusic` again. Section 3 explains why re-entering a room with a music tile restarts the track once it has finished. For a remake, a loop is a deliberate design choice, not faithful behaviour.

### Sound on/off

- `toggle(which)` (`:261-270`) sets `pActive`. It is called from the in-game menu as `#soundOff` -> `toggle(false)` and `#soundOn` -> `toggle(true)` (`master_objects/gameMaster.txt:207-213`).
- `pActive` is saved and restored with the game (`soundMaster.txt:99-101`, `:224-226`; `saveMaster.txt:50`, `:87-90`).
- `disable` (`:291-294`) forces sound off permanently.
- With `pActive = 0`, `playSound` does nothing.
- **Sound off does not stop sounds that are already playing.** `toggle` does not call `stopAllSound`.
- `playMusic` does not check `pActive`. It only skips the volume defaulting, so with sound off music still starts, with `volume = void` (whatever Director makes of that; probably an error or 0). A remake should make "sound off" mute music too.
- `stopAllSound` (`:232-236`) stops channels 1-8. It is called from `soundMaster.stop` (`:228-230`).

## 3. Music tiles (`act_music*`)

### Data

`casts/data/act_music.txt` defines the base actor: `#objType: #objMusic, #inherit: #game, #character: #mapMusic, #minimapStatus: #clr`. `act_game` gives `#createOnSolid: true, #team: #game`. Each tile actor then sets only `#musicName`:

| Actor | `#musicName` | merlinOpenObjects tile (row, col) | merlin4Objects tile (row, col) |
|---|---|---|---|
| `act_musicOff` | `"stopMusic"` | 18, 5 | 11, 1 |
| `act_musicLastStand` | `"last_stand_v4"` | 18, 6 | 10, 5 |
| `act_musicWoodsOfEvil` | `"woods_of_evil_v1"` | 18, 7 | 10, 6 |
| `act_musicBaroqueRock` | `"baroque_rock_v1"` | 18, 8 | 10, 7 |
| `act_musicBaroqueRockTechno` | `"baroque_rock_techno_v1"` | 18, 9 | 10, 8 |
| `act_musicElectronicMerlin` | `"electronic_merlin_v1_02"` | 18, 10 | not present |

Row and column are 1-based positions in `data/tlk_merlinOpenObjects_key.txt` (10 per row) and `data/tlk_merlin4Objects_key.txt` (8 per row).

### Behaviour

`objMusic` (`script_objects/objMusic.txt`) is an `objGameObject` with an anim set. Its `start` calls `g.soundMaster.playMusic(pMusicName)` (`:25-28`). **Nothing happens on collision; there is no collect.** The music changes **when the room containing the tile is activated**, as follows:

1. **First entry into the room.** `objRoom.activate` (`script_objects/objRoom.txt:110-131`) calls `activateActors` because `pBeenActivated = false`. That goes to `objTileLayer.activateActors` (`objTileLayer.txt:160-187`), then `actorMaster.newActor` -> `startActor`, which calls `obj.start()` because `startActor` defaults to true (`actorMaster.txt:29`, `:250-252`). At that point `playMusic` runs.
2. **Later entries.** On leaving, `objRoom.saveState` (`objRoom.txt:723-746`) records every object whose `recordInRoomState` is true. That is the `objGameObject` default (`objGameObject.txt:68`), and the music actors do not override it. On re-entry, `restoreState` (`objRoom.txt:655-697`) re-creates them through `actorMaster.newActor`, so `start()` runs again and `playMusic` is called again.
   - Because of `checkRestartMusic`, the track does **not** restart if it is still playing.
   - If the track has ended (it does not loop), or a different track took over in the meantime, it starts again from the beginning.
3. Rooms without a music actor leave channel 1 alone. The current track keeps playing across rooms until it ends or another music or `musicOff` room is entered.
4. `musicOff` stops channel 1 on activation. `pLastMusic` is not cleared, but since the channel is no longer busy, the next `playMusic` for the same name plays normally.

Save/load goes through the same `restoreState` / `restoreRoomObjects` paths, so the active room's music actor starts again when a save is loaded.

## 4. Other music and sound triggers outside gameplay

- **Score text members**:
  - `objScreen` creates a controller for each mark sprite whose member name starts with `dd_playMusic` / `dd_playSound_` (`script_objects/objScreen.txt:36`; `controllerMaster.txt:12`).
  - `objPlayMusicController.newObject` reads the member text (the member name, with line breaks stripped), creates an `objPlayMusic` and calls `playMusic` right away (`objPlayMusicController.txt:16-29`; `objPlayMusic.txt:29-31`). `objPlaySoundController` does the same for SFX (`objPlaySoundController.txt:16-29`).
  - The members found are `dd_playMusic_titleMusic` = `the_ultimate_song_thing_v1`, `dd_playMusic_creditsMusic` = `final_stand_2_v1` and `dd_playMusic_stopMusic` = `stopMusic`. Which screen each sits on is inferred from the names; the score was not parsed.
- **Cut scenes**:
  - `objScript` parses `playMusic <name> [vol]` and `playSound <name> [vol]` lines (`objScript.txt:173-177`, `:213-231`). The volume defaults to **255** (`structMaster.structPlaySoundArgs`, `structMaster.txt:608-616`).
  - `objScriptPerformer.playMusic` / `playSound` pass these to soundMaster (`objScriptPerformer.txt:301-309`).
  - Uses: `cut_scenes/mr3Complete.txt:96` `playMusic merl2319_v1`; `mr3IntroFull.txt:277` and `mr3IntroPart4.txt:45` `playSound collect_powerup_01 255`; the in-game scene `rescueKing.txt:95` `playMusic electronic_merlin_v1_02`.
- **Game complete**: `gameMaster.gameComplete` plays `gGameCompleteSound` (`gameMaster.txt:90-92`). The movie script `GameInitGlobals` (CASt 274 in the `.dir`; not in the text export) sets `gGameCompleteSound = "end_level"`.

## 5. Gameplay SFX triggers

All of these go through `modSoundFX.playSound(name, vol)` (`modSoundFX.txt:17-21`) -> `soundMaster.playSound`. `objGameObject` and `objRoom` both add `modSoundFX` (`objGameObject.txt:79`, `objRoom.txt:43`). An omitted volume means 150.

| Event | Where | Sound property | Volume |
|---|---|---|---|
| Melee attack performed | `objAiAttack.txt:303-306` | `attack.sound` | `attack.volume`, default 150 (`structMaster.txt:222`) |
| Ranged attack or beam performed | `objAiAttack.txt:308-314` | `attack.sound` | `attack.volume` |
| Spell released | `objSpell.playReleaseSound` (`objSpell.txt:219-226`), called from `releaseNormal` (`:247`) | `attack.releaseSound` | `VarMapRange(charge, chargeVolumeMap.charge, .vol)`, default `[1,100] -> [10,255]` (`structMaster.txt:161`) |
| Spell explodes | `objSpell.goMode(#explode)` (`objSpell.txt:146-155`) | `attack.explodeSound` | same charge -> volume map |
| Non-spell exploder (mines, bombs, fire) | `modExploder.explode` (`modExploder.txt:41-42`) | `#explodeSound` | `#explodeVolume`, default 50 (`:23`); e.g. `act_fire` 10 |
| Exploding bullet | `objExplodingBullet.txt:50-55` | `#explodeSound` | 150 |
| Takes a hit (energy loss) | `modEnergy.txt:206` | `#takeHitSound` | `#takeHitVolume`, default `#none` -> 150; e.g. lizards 50, vultureGuard 15 |
| Player takes a hit (collision) | `objPlayerCharacter.txt:163` | `pTakeHitSound` (`wizard_hit`) | 150 |
| Character dies | `objCharacter.goMode(#die)` `:201-202`; `#stretchDeathStarted` `:234-235` | `#dieSound` | `#dieVolume`, default 100 (`objCharacter.txt:33`); blackOrc 50 |
| Dwelling or building destroyed | `objDwelling.goMode(#dead)` `:78-80` | `#dieSound` | 150 |
| Power-up collected | `objPowerUp.collected` `:54-57`; `objPowerUpWriting.txt:42` | `#collectSound` | 150 |
| Level up (with a star) | `modExperience.levelUp` `:209-210` | `"level_up"` | 100 |
| Room cleared (not the last room) | `objRoom.txt:200-206` | `pRoomClearedSound = "end_screen"` (`:64`) | 150; skipped when `pMap.isMapClear()` so it does not clash with the game-complete sound |
| Game complete | `gameMaster.txt:90-92` | `"end_level"` | 150 |
| Jump, extra life, grow hair, hit by hair, wing flap | `objCharacter.txt:212`, `modExtraLives.txt:78`, `objHairCharacter.txt:188`, `objCPUCharacter.txt:206`, `objFlyingEnemyCharacter.txt:34` | various | unused (data leaves them `#none`; `flap_wings` has no member) |

The actor-to-sound mapping (e.g. which weapons use `skeleton_fire`) is listed in `sound-extraction.md`. Actor data inherits through `#inherit` and `ListsMerge` as described in `engine-mechanics-combat.md` section 1. The attack struct defaults (`#sound`, `#releaseSound`, `#explodeSound` = `#none`, `#volume` = 150) come from `structMaster.structAttack` (`structMaster.txt:177`, `:204`, `:210`, `:222`).

## 6. Remake checklist

- One music bus with a single track at a time. Switching tracks is an immediate stop-and-start with no crossfade. The same track is not restarted while it plays. "stopMusic" stops the bus. The trigger is room activation (first entry and every re-entry), not collision.
- Decide on looping. The original does not loop, so the music simply ends; looping is likely nicer but is a deviation.
- An SFX pool of 7 voices. When all are busy, drop the new sound; do not steal a voice.
- Default gain 150/255. Pass per-event volumes through as `vol/255`.
- Spell release and explode volume scale linearly with charge 1-100 -> 10-255.
- Sound off: block new SFX. Faithfully it also leaves playing sounds alone and does not stop music; muting everything is the sensible choice.
