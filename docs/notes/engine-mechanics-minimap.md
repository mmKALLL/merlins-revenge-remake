# Engine mechanics: the mini-map

What Merlin Open's in-game mini-map shows, when, and where. Lingo paths are under the archive's
`casts/`; the MR4 globals are in the `GameInitGlobals` movie script inside
`merlin_engine_76_speed.dir` (found with `strings`), the defaults in `defaultGameGlobals`.

The mini-map is a grid of coloured cells, one per room, with no picture of the rooms: the colour
says what the room holds. It is not `objMap.displayRoomMap` (objMap.txt:288-314), which draws
the whole map shrunk by `pRoomMapScale` (default 1/8, objMap.txt:44); only the map editor's
tool palette calls that (objToolPalette.txt:45).

## 1. Who owns it

- `objMap.new` installs `modMiniMap` as a module (objMap.txt:48). `modMiniMap.init`
  (modMiniMap.txt:42-56) starts hidden (`pShowMiniMap = false`), puts itself on
  `gGameTextLayer` and registers with the map (`registerMiniMap`, objMap.txt:590-592).
- `objMap.init` calls `initMiniMapData` once the rooms exist (objMap.txt:107-109);
  `objMap.restoreFromSave` calls it again after moving to the saved room (objMap.txt:654-655).

## 2. Parameters (modMiniMap.addModParams, modMiniMap.txt:24-40)

| param | value | use |
|---|---|---|
| `#blendDistances` | `[60, 200]` | px from the sprite's loc to the nearer of mouse and player |
| `#blendLevels` | `[10, 90]` | sprite blend (percent) at those distances |
| `#border` | `rect(1,1,2,2)` | black margin: 1 px left and top, 2 px right and bottom |
| `#scale` | `2` | the sprite is stretched to twice the image size |
| `#statusImages` | members of castLib "gfx" | `#clr` miniClear, `#cur` miniCurrent, `#fre` miniFriendly, `#inf` miniInfested, `#spe` miniSpecial |

The cast members are not in the text export. The archive's `gfx/miniMap/` keeps their source
images (`miniClear.tif`, `miniCurr.tif`, `miniFriendly.bmp`, `miniInfest.tif`,
`miniSpecial.tif`), each 4x4 px:

- clear, infested, friendly, special: black top row and left column, which makes the grid lines
  between rooms; a light 2x2 centre; a darker right column and bottom row. Light / dark: clear
  `#00ff00` / `#009a00`, infested `#ff0000` / `#9a0000`, friendly `#3c3bff` / `#1e1e80`, special
  `#ffff00` / `#ff9a00`.
- current: solid `#ffff00`.

(`gfx/gfx/mr2_gfx/miniMap/` has an older set with a `miniBack.tif` the engine never uses.)

## 3. Room statuses

- `objRoom.getMiniMapStatus` (objRoom.txt:409-433): once the room has been activated
  (`pBeenActivated`) the status comes from its saved state (`getMiniMapStatusFromRoomState
  #miniMap`, :435-460, over the `actorType` of every saved object); before that from the objects
  layer (`objTileLayer.getMiniMapStatus` -> `objTileMap.getMiniMapStatus`, objTileLayer.txt:234-239,
  objTileMap.txt:82-113, over every actor key on it); a room without an objects layer is `#clr`. A
  `#clr` result also sets `pRoomCleared` (engine notes map-complete §1).
- Both take the highest status on `structMiniMapStatusProgression` `[#clr, #inf, #fre, #spe]`
  (structMaster.txt:570-574), starting at `#clr`. An actor's status is its data's
  `#miniMapStatus` (`actorMaster.getMiniMapStatusForSymbol`, actorMaster.txt:113-116); a status off
  the list (VOID) ranks 0 and never counts. So a friendly in the room outranks hostiles, and a
  special outranks both.
- In the archive's actor data (104 `act_*.txt` files set it, spelt `#miniMapStatus` or
  `#minimapStatus`): `act_actor` and `act_CPUCharacter` give `#inf` to everything that inherits
  them (19 files in all say `#inf`); `#clr` (46): the player, bullets, spells, music tiles,
  friendly goblins and other harmless actors; `#fre` (15): warriors, archers, monks, the in-game
  wizards and king; `#spe` (25): the spell scrolls and pickups (energyBlast, arcticBlast,
  armySummon, healBlast, merlinSword, gmg, ...) and the wizards berlin, ochre, ochreHydra,
  prestotolin, scarletWizard and ulin.
- The same rooms answer `#exitArrows` with `structExitArrowsStatusProgression` `[#clr, #inf]`
  (structMaster.txt:414-420) for the exit arrows and `getHostile` (objRoom.txt:342-358,
  objTileLayer.txt:224-231).

## 4. The cached map and what is drawn

- `initMiniMapData` (modMiniMap.txt:58-78) makes an `objDataMap` of the map's size and pokes every
  room's status into it. **Every room is shown from the start**; there is no fog and no
  visited-room tracking.
- `getMiniMapData` (:136-174), on every display, re-reads the four neighbours of the current room
  (left, right, up, down; outside the map skipped) and pokes `#cur` into the current room. Other
  rooms keep the status they had at the last refresh. Rooms are frozen while Merlin is elsewhere,
  so a cell only goes stale when Merlin reaches a room that is not next to the last one; the old
  room would stay `#cur`. Merlin's Revenge has no such move.
- `drawMap` (:111-134): an image of `mapSize * 4 + border` px (`image(w, h, 32, 0)`, filled
  black), and each room's status image copied (ink 0, copy) to
  `border.topLeft + (room - 1) * 4`. A 3x3 map is 15 x 15 px, 30 x 30 on screen.

## 5. When it is on screen

- `displayMiniMap` (:94-109) runs from `goNavMode` (:177-179); `miniMapOffScreen` (:185-199)
  from `leaveNavMode` (:181-183) and `finish` (:80-84). `gameMaster.goNavMode` /
  `leaveNavMode` (gameMaster.txt:134-137, 168-171) call them on the current map.
- `gNavMode = true` in MR4's `GameInitGlobals` (`false` in `defaultGameGlobals`). With it,
  `objRoom.attemptOpenExits` calls `gameMaster.goNavMode` whenever it finds no player enemy left
  (objRoom.txt:209-211): on room activation when the room is already clear, and from
  `gameMaster.teamDied` when the last enemy goes. The player's `#leaveRoom` leaves nav mode before
  `moveRoom` (objPlayerMerlinCharacter.txt:255-261), so the map disappears on every room change
  and comes back only if the new room is clear.
- So: **the mini-map shows while the current room is clear and hides while there is fighting.**
  `gameMaster.finishGame` finishes the map at map complete, and the mini-map with it.
- No key toggles it (the bindings in `data/bnd_*.txt` have none). Saves record `pShowMiniMap`
  (`addSaveData`, :86-92); `restoreFromSave` (:201-206) hides it, "will be asked back on if
  required".

## 6. Where and how it is drawn

- `setupSprite` (:224-243): the member's regPoint is its bottom-right corner, the sprite is
  stretched by `#scale`. `displayMiniMap` puts the sprite at `objRoom.getMiniMapLoc`
  (objRoom.txt:329-332), the room sprite's bottom-right corner. The map therefore sits inside the
  play area in its bottom-right corner, over the room (on `gGameTextLayer`), growing up and left.
- `update` (:245-247), every frame while shown (`g.updater.addPrg(..., #lo)`), sets the blend:
  `setBlendForMouseOrPlayer` (:208-222) takes `GeomPixelDist` (the larger of the x and y
  distances) from the mouse and from the player to the sprite's loc (the corner), keeps the
  smaller, and maps it with `VarMapRange` (`VarPercent` then `VarValRange`, both clamped) from
  `[60, 200]` onto `[10, 90]`. Merlin or the mouse within 60 px of the corner leaves the map at
  10 %; from 200 px away it is at 90 %, never fully opaque.

## 7. Port

- `src/mr-open/mr-minimap.ts`: the parameters (`MINI_MAP`), the status images as pixel data
  (`CELL_IMAGES`), the image layout (`miniMapImageSize`, `cellOrigin`), `pixelDistance`
  (GeomPixelDist), `mapRange` (VarMapRange) and `miniMapBlend`. The status progression was
  already in `mr-map-clear.ts`.
- `src/sim/minimap.ts`: `miniMapShown` (nav mode and the map not complete) and `miniMapCells`. No
  sim state is added: the cells are computed when drawn. In rooms mode that is the same picture
  as the engine's cache (rooms are frozen while Merlin is away, and every room change is to a
  neighbour). Current room `#cur`; a room spawned before (the port's `pBeenActivated`) from its
  stored units; any other room from the actor keys on its objects layer (keys without actor data
  are skipped, as in map-complete).
- `src/render/minimap.ts`: drawn in the play view's bottom-right corner, black background, the
  cells 1:1 in image px and the layer scaled by 2, blended from Merlin's and the mouse's positions
  in play-view px. The cells are redrawn only when a status changes.

### Remake decisions

- **Continuous world.** There is no current room. Each cell takes the status of the living units
  whose position is in that room at the moment (asleep or awake). A solid miniCurrent-yellow
  marker the size of the view (one cell, as the view is one room) slides over the cells at the
  camera's position, snapped to map image px, so it straddles rooms as the camera does. The map
  shows while nav mode is on, i.e. no awake hostile within `navModeClearRadius`.
- **Tall maps.** At scale 2 the 288 px view holds 34 rooms down (and 70 across), so the 3x12
  Sorcerer's Tower (30 x 102 px) and every archive map fit at the engine's size. A map that would
  not fit is drawn at the largest whole scale that fits, down to 1 (`fitScale`); beyond that it
  would spill past the view's top and be clipped. No scrolling.
- **N hides or shows the mini-map** (render-only; the original has no key). It is still bound to
  nav mode when shown.
- Generated maps work like any other map: every room of the grid gets a cell.
- **Roguelite exit room.** On a roguelite floor (`MapDefinition.markExit`) the end room's cell is
  `'exit'`, drawn with miniSpecial's yellow bevel whatever stands in it, so the way out is always
  visible. Merlin's own room still shows `#cur`. See engine-mechanics-map-complete.md §4.
- On touch devices in landscape the semi-transparent blast button lies over the same corner.
