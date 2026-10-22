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
| `prg_wizardmaster`, `prg_gmgmaster` | 72, 0 / 90, 0 | wizard and GMG displays in the top strip (not ported) |
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
  the health bar, in 8 px type.
