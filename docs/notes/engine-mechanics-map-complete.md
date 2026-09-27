# Engine mechanics: map complete and cut scenes

How Merlin Open decides a map is finished and what it plays then. Lingo paths are under the
archive's `casts/`; the MR4 globals are in the `GameInitGlobals` movie script inside
`merlin_engine_76_speed.dir` (found with `strings`), the defaults in `defaultGameGlobals`.

## 1. Detecting a completed map

- **Room cleared.** `objRoom.attemptOpenExits` (objRoom.txt:187-222) runs on every room activation
  and from `gameMaster.teamDied` (gameMaster.txt:302-330, one update after a team's last member
  finishes). If `teamMaster.isPlayerEnemiesDead()` it opens the exits, sets `pRoomCleared` (sticky,
  never reset) and plays `pRoomClearedSound` ("end_screen") **unless `pMap.isMapClear()`**, "as
  there will probably be a game complete sound to play instead". It then calls
  `pMap.checkMapCleared()`.
- **Whole map clear.** `objMap.isMapClear` (objMap.txt:510-522) is true when every room's
  `pRoomCleared` is set. `checkMapCleared` (:248-252) then raises `gameMaster.gameEvent(#mapClear)`.
- **Rooms never visited.** At map init `modMiniMap.initMiniMapData` asks every room for its minimap
  status, and `objRoom.getMiniMapStatus` (objRoom.txt:409-433) sets `pRoomCleared` when the status is
  `#clr`: "rooms that start clear are recognised as such". The status is the highest, on
  `structMiniMapStatusProgression` `[#clr, #inf, #fre, #spe]`, of the `#miniMapStatus` of every actor
  key on the room's objects layer (`objTileMap.getMiniMapStatus`). `act_actor` defaults to `#inf`;
  bullets, music tiles, the player and the friendly goblins are `#clr`; warriors, archers, monks
  and the in-game king are `#fre`; scrolls are `#spe`. So an unvisited room with a hostile, a
  friendly or a scroll is not cleared until Merlin enters it and `attemptOpenExits` finds no
  hostile. A key without a status is skipped (getPos of VOID is 0).
- **End room.** `gameMaster.teamDied`: if the exits opened and `objMap.isEndRoom()` (the current room
  is the map's `#endRoom`, objMap.txt:499-508), `gameEvent(#mapClear)` too, whatever the other rooms
  hold. Only two archive maps set `#endRoom` (`some_bugs/merliniii`, `not_fully_tested/mriiilongii`);
  the rest say `#endRoom: #none`. Room activation never takes this path.
- **gameEvent.** `gGameCompleteEvent = #mapClear` (defaultGameGlobals), so `gameEvent(#mapClear)`
  calls `gameMaster.gameComplete` (gameMaster.txt:81-99): `finishGame` (every actor, the enemy energy
  bar and the map finished), `movieMaster.gameComplete`, and `soundMaster.playSound(gGameCompleteSound)`
  with `gGameCompleteSound = "end_level"` (MR4; the default is `#none`). `objPowerUp` `#superHairConditioner`
  (Rapunzel) calls gameComplete directly.
- A map with nothing hostile anywhere therefore completes as its start room activates: in the
  archive only `new_map` and `wont_work/merlinart` do.

### Port (src/sim/map-complete.ts, src/mr-open/mr-map-clear.ts)

- `RoomState.clear` is `pRoomCleared` and is now sticky. A visited room other than the current one
  counts as cleared when `clear` is set or it holds no hostile (the second case only arises after the
  remake's world-mode switch). An unvisited room uses the minimap rule; keys the port has no actor
  data for are skipped.
- The tick that opens the exits (`settleRoom` -> `onExitsOpened`) plays end_screen only when the map
  is not clear, then completes the map when it is clear or the room is the end room. Room entry
  (`withExitsEvaluated`) checks the whole map only. The sim emits `{ kind: 'mapComplete' }` and the
  end_level sound once and sets `mapComplete`.
- `finishGame` is not ported literally: actors stay for the fade-out, but CPU AI, sleeper wanders,
  spell casters and dwelling production stop. `main.ts` stops stepping the sim while the end
  sequence runs.
- **Continuous world (remake).** No rooms to clear: the map is complete once no hostile unit is left
  on the whole map (checked after every tick and at the start).

## 2. The end sequence

`movieMaster.gameComplete` -> `goScreen(#animScreenEnd, #gameComplete)` with a `#fade` transition;
`goScreenAction` then calls `cutSceneMaster.playCutScene(gGameCompleteScript)`, and
`cutSceneFinished` for that script goes to `#creditsScreen`. `gGameCompleteScript =
#cut_scene_to_play_at_end`. The loader fills the `scr_cut_scene_to_play_at_end` member from the
archive's `cut_scene_to_play_at_end/` folder when it holds a file; that folder is empty, so the
built-in member plays (identical to `cut_scenes/mr4Complete.txt`):

    setStage / m at 300 / showTitle Map Cleared! / backgroundColourTo rgb(220,220,220) / lightsUp /
    m: Woo hoo! / wait 20 / backgroundColourTo rgb(0,0,0) / lightsDown

### Cut scene script format (objScript.txt)

- Lines after `characters` up to `lines`: `#character - name`. Lines after `lines`: blank lines
  skipped; `name: text` speaks; `name command args` is a player command; anything else is a stage
  command for `cutSceneMaster`. Arguments go through Lingo `value()`. Commands are symbols, so case
  does not matter (`At`). Text before `characters` (a member's info line) is ignored.
- Valid characters (`docs/valid_cutscene_characters.txt`): `#berlin #goblinRunner #king #merlin
  #ochre #ochreHydra #scarletWizard #tv #ulin`; props `#blackScroll #blueScroll #gmgBullets
  #horriblePotion #treesRocks #treesRocksBW #whiteScroll`. Players are real actors
  (`actorMaster.newActor` in the wings at point(-100,-100)) put into `modThespian`.

### Timing (objScriptPerformer, modThespian, cutSceneMaster, objCutSceneTitle, modFader)

- Lines run back to back through `lineFinished`. Waiting lines: speech (`50 + 1.4 * chars` frames
  shown, then 12 frames blank), `wait n` (objTimer, n frames), `lightsUp`/`lightsDown` (every player's
  blend fades 0<->100 at 2 per frame, `startSlowFadeIn/Out`; the script waits for all of them).
- `backgroundColourTo` fades the stage rect's colour at speed 2 (VarColRange over 0-100 %) and goes on
  at once; `setStage` puts every player in the wings, invisible, and the background black.
- `showTitle` fades the title text to black (speed 4), sets it, reveals it in rgb(204,204,0) (speed 4),
  holds it 150 frames, then fades it back to black.
- objTransformer skips its first frame, so a 0-100 fade at speed 2 takes 51 frames.
- With `pAutoTurn` every other player turns to face the speaker. Speech in a cut scene is Verdana 10
  bold white, 300 px wide, centred on the speaker and bottom-aligned 4 px above the stage rect.

### Port (src/cutscene/, src/render/cutscene-overlay.ts)

`script.ts` parses scripts (converted to JSON by `pnpm assets:convert`), `performer.ts` plays them
frame by frame, `end-sequence.ts` chains a 15-frame fade of the game screen, the cut scene and a
prompt (Enter or click replays the map; the map browser stays usable). Assumptions: the fade length,
the stage rect (x 32-608, y 112-288 on the 640x320 screen) and the title position/size, since the
`animScreenEnd` score layout is not extracted. `#merlin` is drawn with the player's stand frame.

## 3. What a full cut scene system still needs (Cutscenes backlog)

- **Walking and exits**: `walkTo`, `walkToPlayer`, `enterStage*`, `exitStage*` use modMoveToLoc at
  the character's walk speed with the walk strip; the port jumps to the destination (or the wings).
  `walkScroll*` scrolls the scenery (`#treesRocks` props) under walking players.
- **Teleport** (`teleportInAt`, `teleportOut`, modTeleport with modStretcher) and `goWastedMode`
  (the wasted cut scene).
- **Props**: `produceProp`, `dropProp`, `putAwayProp`, `propAt` (modProp; the TV, scrolls, potion).
- **More characters**: sprites and actor data for `#ulin #berlin #king #ochre #ochreHydra
  #scarletWizard #tv #goblinRunner` (only Merlin has an atlas now; others are skipped when drawn).
- **backgroundColourRandomFlash**, `goMode`, speech variables (`#key <action>` shows the bound key).
- **The stage layout** of `animScreenEnd`/`animScreenIntro`/`animScreenGameOver` from the Director
  score (stage rect, title member font and position), and the `#fade` screen transition length.
- **Other scripts**: the intro (`gIntroScript`, `cut_scene_to_play`), game over
  (`gGameOverScript = #cut_scene_to_play_when_wasted`, then reload), in-game scripts
  (`scr_stones*`, played on the map with speech bubbles above heads: `#ingame` speech mode), the
  credits screen after the end scene, and skipping (`scriptCancelled`).
