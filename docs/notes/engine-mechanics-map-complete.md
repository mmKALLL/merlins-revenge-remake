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

## 4. Roguelite mode (remake)

A roguelite run (`?map=randomly_generated/tower-roguelite`; design in
`docs/plans/2026-10-25-roguelite-mode-design.md`) plays its floors one map at a time. The original
has no such mode; these are remake decisions.

- **markExit.** `MapDefinition.markExit` marks a roguelite floor. Its end room is the floor's exit:
  `completeMap` never runs on such a map, so clearing the end room or the whole floor plays no
  end_level sound and starts no end sequence. The mini-map shows the exit room in yellow.
- **floorExit.** The generator opens the exit room's top edge (`src/gen/roguelite.ts`). When Merlin,
  alive and with the exits open, presses against that edge (his collision rect within
  `EXIT_MARGIN_PX` of the map's top; outside the map is solid and a continuous world clamps to it),
  the sim sets `floorExited` and emits `{ kind: 'floorExit' }` once (`stepPlayerMove`).
- **Carry-over** (`src/sim/carry-over.ts`). The next floor's sim is a fresh `createSim` of its map
  with Merlin's record copied over: energy, the potions drunk (his potion upgrades), medikits
  (including a heal in progress), the arsenal and current weapon, the reserve army, the score's
  total and `runTicks` (the run's time; `tick` restarts per map, as its timers read it). Everything
  else starts fresh: rooms, graves, sleepers, the mini-map and the temporary invincibility. A voided
  score stays void.
- **Floor flow** (`src/run/run.ts`, `src/main.ts`). Each floor's map is built on the tower tilesets
  from the run seed and the floor number (`floorSeed`), so the page's tilesets never change.
  Leaving floor 4 wins the run; a death ends it (no restart of the floor). Both end on the run
  summary (below). Restart from the menu starts a new run on floor 1.
- **Rewards** (`src/run/rewards.ts`; `holdsScroll` in `src/sim/rewards.ts`). Rolled from the run seed and the floor
  (`floorSeed`, salted apart from the layout): a new spell by the floor's start-scroll weights
  (`startRewards.spellScrolls`) less the scrolls Merlin holds (by the scroll's `#character`, as
  `collectScroll` adds it), dropped when he holds them all; a full heal and a medikit; 4-5 potions
  (uniform) of 2 types drawn by the potion weights without repeats, the first type's count uniform
  over 1..n-1, so every split is equally likely. The pick screen shows its rewards before the biome
  is picked, so they draw from the next floor's biome options with their weights added up.
- **Rewards as pickups** (owner decision, 2026-10-25). A picked reward is not given to Merlin: it
  stands as ordinary pickups in the next floor's start room (`rewardPickups`, passed to
  `rogueliteFloor` as `FloorOptions.startPickups`), and he collects them as any pickup, with their
  sounds, writing and temporary invincibility. A spell is its scroll; the heal full energy as
  Merlin arrives (`arrivalHeals`, `withFullEnergy`) and a medikit (owner: a maxikit on the ground
  could be left for later, which leads to backtracking); potions each potion rolled. A roguelite floor's start room
  places none of the theme's start rewards (the 3 potions, medikit and scroll); the side corner
  rooms' potions stay. A pickup from another biome's pools takes its tower objects tile.
- **Pickup layout** (`startPickupTiles` in `src/gen/floor.ts`). The pickups fill the free unit
  tiles of the row 2 below Merlin (in front of him; the sign stands 2 above) from the middle
  outwards, left first, then the row between, within 2 tiles to either side (10 tiles, the kit's 8
  fit); past those, the free tiles nearest him. They never take his tile or the sign's (the board
  stands off every placement), and keep out of the doorways: an opening's band within 4 tiles of
  its edge (`inDoorway`; `DOORWAY_DEPTH`), taken only when nothing else is free. The whole band, as
  the sign keeps out of it, would leave too few tiles: a side and a top opening often cover
  Merlin's row and column. The layout draws nothing from the floor's random numbers, so the floor
  is the same whichever reward was picked.
- **Starting kit.** A run's first floor (a random floor-1 biome) starts with a spell, the heal and
  exactly 5 potions of 2 types from that biome's pools, with no pick, laid out as pickups the same
  way. The kit comes from the run seed alone (`startingKitPickups`; Merlin starts a run holding no
  scroll's spell), so the map id `randomly_generated/tower-roguelite` builds floor 1 with it in
  `generateMap`; Restart starts a new run with its kit.
- **Pick screen** (`src/ui/floor-pick.ts`, the `picking` app screen). Leaving a floor's exit pauses
  the sim on one panel: the next floor's biome (a lone biome is shown chosen) and a reward. The
  cards take no pick for `PICK_LOCK_MS` (800 ms, `pickUnlocked`) and are dimmed until then; the
  number keys, arrows or Tab and Enter, a tap or a click pick, and the floor is built as soon as
  both picks are made. The in-game menu cannot open while picking (Esc and the menu button do
  nothing), so the pick is never lost. Cards show the scroll's and potions' own `stand` and
  `writing` frames (their in-game names: Max Blast, Quick Blast, Faster Charge, Speed Up). A biome
  card shows its name over a row of 3-4 enemy icons (`FloorTheme.showcase`): each unit's first
  `stand` frame (else `altStand`, `walk`) at the whole scale nearest 48 px, shrunk by the page to
  one row; the card's label names them.
- **Biomes** (`ROGUELITE_FLOORS` in `src/gen/roguelite-biomes.ts`). Each floor offers its tower
  floor and one of the run's own biomes (`ROGUELITE_THEMES` in `src/gen/themes.ts`, no generated
  map ids of their own): Goblin Forest or Deep Forest, Undead Marsh or Hydra Marsh, Dragon Canyon
  or Golem Mountain, Magic Maze or Golden Palace. The new biomes are merlinOpen themes with the
  tower floors' room plan (`biomePlan`), their own enemies, groups, bosses and themed spells; the
  final lists are in the design doc's Biomes section. Factions keep teams that hate each other
  apart: Deep Forest's ninjas and Golem Mountain's lava golems (team scarlet) hold rooms of their
  own, and the Golden Palace's guards keep to Scarlet's, the dojo's, the ninjas' or the mages'
  rooms (the usual 15 % of normal rooms mix them).
- **Safe arrival** (owner rule; `FloorOptions.safeArrivalTiles`, `SAFE_ARRIVAL_TILES = 3` in
  `src/gen/roguelite.ts`). On a roguelite floor no unit or dwelling stands within 3 tiles (taxicab)
  of Merlin's start tile. The generator lays out the start room first so the other rooms know his
  tile, and leaves the tiles that near out of their unit tiles. The layout already keeps them apart
  (the start room places no units, units keep 2 tiles off room edges and Merlin starts near the
  room's centre: 6 tiles at the least over 200 seeds per biome), so the option is a guard for new
  biomes and room sizes rather than a change to today's floors.
- **Location sign** (owner rule 2026-10-25: in-game locations always use the game files' signs;
  `FloorTheme.locationSign`, `src/gen/location-sign.ts`). Every roguelite floor's start room stands
  its biome's original painted sign, the tiles of merlinOpenActive's sign rows (14-20, keyed `solid`;
  merlin4Active has none), resolved into the tower's active tileset by `towerSignTiles` (merlinOpen's
  part, offset 0, also for the merlin4-based Goblin Forest). Each biome's user-facing name is the
  sign's text: Goblin Forest "East Woods" (169-170), Deep Forest "Woods of Mourning" (154-156),
  Undead Marsh "Dead Woods" (159-160), Hydra Marsh "West Jungle" (187-188), Dragon Canyon "Caves of
  Fire" (177-178), Golem Mountain "Remorseless Mountains" (161-163), Magic Maze "Black Fortress"
  (164-166), Golden Palace "Golden Palace" (184-186). Theme ids and map ids keep the old names (the
  run's bests are keyed by them); the Golden Fort (not a roguelite biome) has no sign and keeps its
  name. A sign is 2 or 3 tiles wide and solid, so it stands on open or decorated tiles 1 tile off the
  room's edges, in no opening's column or row band, under no placement (the start pickups are laid
  out first), nearest 2 rows above Merlin, and only where every other tile of the room stays
  reachable from him; `MapDefinition.locationSign` records where. A start room with no such spot
  fails the floor attempt (a retry from the next seed, as for an unconnected floor).
- **Run end** (`src/ui/run-summary.ts`, the `summary` app screen). A death shows the summary at
  once. The win plays what a completed map plays: the jingle (`MAP_COMPLETE_EVENTS`: the
  `mapComplete` event, which silences the music, and gGameCompleteSound), the fade and the end cut
  scene; the summary then replaces the original's "Map complete, press Enter" prompt (the screen
  stays black under it). Normal maps keep the original end. The summary lists the floors reached,
  the score (the run's carried total, with the map's best in that world mode; none when the camera
  was switched), the time (`runTicks` as m:ss, `runTimeText`), the spells collected (the scrolls
  of the weapons Merlin holds beyond his starting ones, `collectedScrolls`, drawn as on the pick
  screen) and the biomes visited by their sign names, then the statistics. New run and Main menu
  take no press for `PICK_LOCK_MS` after it opens (dimmed until then), so a key held from play
  skips nothing; no menu or Esc leaves it. New run always draws a fresh seed (whatever the Random
  maps setting); Main menu goes to the title. The best score keeps recording per tick for the
  roguelite map id, so a run's total counts as before.
- **Statistics** (`src/data/roguelite-stats.ts`, localStorage `mr-remake.rogueliteStats`): runs,
  wins (the win ratio), the furthest floor of each finished run, the current and best win streak.
  A run's start sets `inProgress`; its end (counted as the win starts its end sequence, so a quit
  during it keeps the win) counts the run on its floor, a win extends the streak and a death
  resets it. A run left unfinished (Restart, Quit to title, a reload or the page closed) is found
  at the next run's start: it resets the streak and counts nowhere else. Blocked storage keeps the
  statistics for the page only. They show on the summary (a line and a bar chart per floor) and
  under the title screen's Roguelite button, which starts a run of
  `randomly_generated/tower-roguelite` in a fresh page (a fresh seed).
