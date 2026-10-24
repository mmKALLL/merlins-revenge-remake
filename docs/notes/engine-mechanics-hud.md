# Engine mechanics: the game screen HUD

Where Merlin Open puts the room, Merlin's health bar and the medikit and potion displays, and how
the health bar fills. Lingo paths are under the archive's `casts/`; line numbers count the
exported file's lines. The positions are not in the Lingo: they are the sprites ("marks") of the
score's `gameScreen` frame in `merlin_engine_76_speed.dir`, read with
`tools/director-extract/score_marks.py 240` (frame labels in the movie's VWLB chunk: `gameScreen`
is frame 240).

## 1. How marks become the HUD

- `screenMaster` (`master_objects/screenMaster.txt:90-126`) visits every labelled frame and
  stores each sprite's member, loc, size, ink, blend and colours as a mark (`getMarks`). Members
  named `dd_*` and `prg_*` are not drawn (`p[#dontDraw]`, `:22`).
- `objScreen.startObjects` (`script_objects/objScreen.txt:390-408`) starts an object for each
  `dd_<type>_` mark at its loc: `dd_map_to_play` makes the map (`objMapController.newObject` ->
  `objMap.pLocation`), which shows every room with its sprite's top-left there
  (`objMap.showRoom` -> `objRoom.onScreen`, `objMap.txt:701-703`, `objRoom.txt:565-577`).
- `objScreen.startPrgs` (`:411-425`) calls `g[<name>].start(loc, mark)` for each `prg_<name>`
  mark: `medikitMaster.start(loc)` gives `objMedikitDisplayer` its display loc
  (`medikitMaster.txt:26-34`), `potionMaster.start(loc, mark)` its display rect
  (`potionMaster.txt:59-68, 215-218`).
- The rest are drawn as they are (`objScreen.spritesOn`, `:339-377`).

## 2. The gameScreen marks (stage 640x320, the movie's DRCF stage rect)

| member | rect (left, top, w x h) | what |
|---|---|---|
| `dd_map_to_play` | 32, 16 | the room's top-left: the play view is 576x288 at (32, 16)-(608, 304) |
| `prg_medikitmaster` | 32, 0 | medikit display, from the top-left of the strip above the room |
| `prg_potionmaster` | 470, 0, 138 x 16 | potions drunk, right-aligned to x 608 (the room's right edge) above the room |
| `prg_armyMaster` | 608, 16, 32 x 288 | the right margin (army display, not ported) |
| `prg_wizardmaster`, `prg_gmgmaster` | 72, 0 / 90, 0 | wizard and GMG displays in the top strip (not ported; the remake draws Merlin's current weapon icon at the wizard mark, `engine-mechanics-spells.md`) |
| `health_grey_locz151` | 32, 306, 68 x 13 | the word "health" (8-bit grey, ink copy) |
| `health_bar_surround` | 104, 305, 100 x 14 | the health bar's frame (ink 36, background transparent) |
| `help_locz151` | left margin, top | the help button (not ported) |

So the stage has a 16 px strip above the room (medikit at the left, potions at the right), a 16 px
strip below it (Merlin's health) and 32 px margins at the sides.

## 3. Merlin's health bar

- `objPlayerMerlinCharacter.init` (`objPlayerMerlinCharacter.txt:60-69`) makes an
  `objMulticolourEnergyBar` on the `health_bar_surround` sprite (`getSpriteWithMember`), with max
  and current energy Merlin's starting energy; `#maxEnergyChanged` sets the max to
  `getMaxEnergy()` (`:143-145`), `energyChanged` passes every change on (`:105-107`).
- `objEnergyBar` (`objEnergyBar.txt`): the bar is the 1x1 `dot` member stretched, `#horizontal`
  and `#left` aligned by default (`:17-32, 62-77`). `updateBarOnSurround` (`:123-140`) sets its
  rect to the surround's inflated by `-#barBorder` (2), so 96 x 10 at (106, 307), one locZ above
  the surround. `updateEnergy` (`:142-158`): `VarPercent(energy, [0, max])` (clamped 0-100), then
  `VarValRange(percent, [0, 96])` as the sprite's width: the bar fills from the left. The
  surround's white inside is transparent (ink 36), so the unfilled part shows the black stage.
- `objMulticolourEnergyBar` (`objMulticolourEnergyBar.txt:14, 25-47`): `#colourRange` red
  `rgb(255,0,0)`, yellow `rgb(255,255,0)`, green `rgb(0,200,0)` for 0 %, 50 %, 100 %. `colRange =
  VarFloor(percent / 50) + 1`, `colPercent = (VarFloor(percent) mod 50) * 2`; at `colRange` 3 (full
  energy) the bar is green, else `VarColRange(colPercent, colour[colRange], colour[colRange + 1])`.
  So red to yellow below half, yellow to green above, changing in whole-percent steps; just below
  full it is a yellowish green, full energy the plain green. The colour is the bar sprite's
  `color`. No segments.

## 4. Medikit and potions displays

The layouts are in engine-mechanics-potions.md §6; their places are the marks above: the medikit
icon's top-left at (32, 0) (`objSpriteMember.displayImageAtLoc` uses `#topLeft`,
`objSpriteMember.txt:73-81`), then its bar and counter to the right; the potions from (608, 0)
leftwards. Both draw on `gGlobalDisplayLayer`, in the strip above the room, not over it.

## Port

- `src/mr-open/mr-hud.ts`: the marks (`GAME_SCREEN`), `energyBarRect`, `energyPercent`,
  `energyBarLength` and `multicolourBarColour` (VarFloor, VarColRange).
- The remake's logical screen is the original stage (640 x 320) and its play view offset is the
  `dd_map_to_play` mark (32, 16). It was (32, 0) before, with a 32 px strip below the room.
- `src/render/player-health-bar.ts`: the label and surround members (`assets/hud/`, dumped from
  the cast with `dump_bitmaps.py health_`) at their marks, the bar inside. `src/render/pickups.ts`:
  the medikit and potions at their marks.
- **Remake:** the debug readout (Settings, Debug info) sits in the strip below the room, right of
  the health bar, in 8 px type: `fps tick room actors cam` and `pos energy mode exits`, kept short
  (no velocity or music track) so it ends well left of the score (§5) even with a five-digit total.

## 5. Scoring (remake feature, owner request)

The original has no score. The remake's rules (`src/sim/score.ts`, `SimState.score`):

- Every room with something to clear is worth up to 9999 points, counting down linearly to 0 over
  200 seconds (6000 ticks): `floor(9999 * (6000 - ticks) / 6000)`. The countdown counts the ticks
  Merlin spends in the room while it is not clear, from his first entry (the start room at map
  start). A tick counts for the room he was in at its start, if that room was not clear then, so the
  tick the exits open on still counts. Leaving a room uncleared pauses its countdown (rooms mode only
  lets Merlin out of a cleared room, so in rooms mode this happens only through a mode switch, which
  voids the run anyway); coming back resumes it.
- When the room is clear (`RoomState.clear`: its exits have opened, `objRoom.attemptOpenExits`),
  its points left are banked into the map's total and its countdown stops.
- **A room that is clear on Merlin's first entry pays nothing** (owner decision), the start room
  too: a room with no hostile in it is clear as it activates (the engine counts it as cleared,
  pRoomCleared), but there was nothing to win. Precisely: a room scores only if it was not clear on
  the tick Merlin first entered it (it is listed in `score.rooms` from its first countdown tick; a
  room found clear before it is listed is banked as `clearOnEntry` with 0 points). Rooms never
  visited pay nothing, even those the minimap counts as clear.
- The count lives in the sim state (ticks per room), not wall-clock time, so replays and snapshots
  (`src/debug/sim-snapshot.ts`, field `score`) agree; a snapshot from before scoring loads with no
  score (`VOID_SCORE`).
- **Open world** (the continuous world: `?camera=follow`, C, Settings camera): a run that starts in
  it is scored the same way, by the map's rooms. Merlin's room is `s.room` (the room his position is
  in); a room counts down while he is in its area and it is not clear, where clear means no hostile
  unit (`exitsOpenFor`) stands in the room's area, since the continuous world keeps no
  `RoomState.clear`. So a room also banks if its last hostiles walk out of it (chasing Merlin into
  the next room, say); its later visitors do not unbank it.
- **A world mode switch during a run voids it** (`switchWorldMode`, either direction: C or Settings
  camera): `score.valid` goes false until the next run (Restart, a death, Play), and no best is
  recorded. The next run starts in the camera's mode and is scored again.
- Best scores (`src/data/best-scores.ts`): localStorage `mr-remake.bestScoresByMode`,
  `{ rooms, continuous }`, each a table of map id to points; a run is recorded under the world mode
  it was played in (`sim.worldMode`, unchanged during a valid run). The first release's
  `mr-remake.bestScores` (one table) is read as the room camera's bests while the new key is absent,
  and stays behind untouched. The total is checked after every tick, so a run counts as it banks
  rooms: a run ended by a death still sets the best if it is higher, and the restart begins at 0. A
  generated map keeps one best per mode for its id (`randomly_generated/...`), whatever the layout's
  seed. Blocked storage keeps the bests for the page only.
- HUD (`src/render/score-hud.ts`): monospace 11 px text (PIXEL_TEXT) in the 16 px strip below the
  play view, at its right end. The current room's points (green, the health bar's rgb(0,200,0),
  `+1234`) keep a slot as wide as `+9999` that ends at the play view's right edge (x 608, where
  potionMaster right-aligns the potions in the strip above); the total (white) ends 8 px left of the
  slot, so it stays put while the room counts down. The room points hide once the room is banked.
  Right of 608 is only the 32 px margin, too narrow for `+9999` at a readable size, hence the total
  on the left. A voided run shows a grey em dash `—` in the total's place and no room points.
- Map selector (`src/ui/map-browser.ts`): each map row and favourite shows its best at the row's
  end in green, for the world mode of the player's current camera (`cfg.cameraMode`, which C and
  Settings camera keep current); the Maps panel redraws the lists each time it opens, so a camera
  change in Settings shows on the next opening.
