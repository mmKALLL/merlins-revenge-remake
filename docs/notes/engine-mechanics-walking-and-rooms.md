# Engine mechanics: walking and rooms (Merlin's Revenge original Lingo source)

Source root (abbreviated `casts/` below):
`assets-mr-original/merlin_open_30_speedy_and _tvs/casts/`
Maps: `assets-mr-original/merlin_open_30_speedy_and _tvs/maps/works/*.txt`, `.../map_to_play/tvsDemo.txt`.

Scope: map/room loading, tile layers, tile collision, player walking, room transitions. File references are `file:line`.

## 1. Map file format

Top-level structure (`map_to_play/tvsDemo.txt`, first bytes):

```
[#map: [#mapSize: point(4, 1), #roomSize: point(18, 9), #startRoom: point(1, 1), #endRoom: #none,
 #refreshRoomMapImage: 1, #roomMapScale: 0.0625, #roomEditScale: 1, #roomPlayScale: 1,
 #layerDefinitions: [[#name: #backgroundPassive, #tileSet: #merlinOpenPassive, #displayScale: 1],
                     [#name: #backgroundActive,  #tileSet: #merlinOpenActive,  #displayScale: 1],
                     [#name: #objects,           #tileSet: #merlinOpenObjects, #displayScale: 1]],
 #rooms: [[#num: 1, #layers: [[#name: #backgroundPassive, #map: [[12, 12, ...18 entries...], ...9 rows...]], ...
```

The file is parsed by `g.XMLMaster.interpretXML(params.definitionTxt)` and the result's `.map` property becomes `pDefinition` (`script_objects/objMap.txt:59-61`). It is literally a Lingo property list (`value()`-able).

- `mapSize` = point(columns, rows) of rooms in the map. `roomSize` = point(columns, rows) of tiles per room (`objMap.txt:73`: `pRoomSize = pDefinition.roomSize`). `startRoom` = point(col,row) room the map starts in (`objMap.txt:74`, used in `onScreen`: `me.gotoRoom(pStartRoom)` `objMap.txt:559-560`). `endRoom` is only used by `isEndRoom` (`objMap.txt:499`).
- `layerDefinitions` is a list of `[#name, #tileSet, #displayScale]`; `objMap.initTileSetsFromDefinition` (`objMap.txt:201-208`) creates one `objTileSetKey` per layer via `g.collectionsMaster.getObj(#objTileSetKey, nTileSetName)`, keyed by layer name. The three layers in the merlinOpen maps are `#backgroundPassive`, `#backgroundActive`, `#objects`.
- **Room num to (x,y)**: `objMap` itself is an `objDataMap` initialised with `params.map = #incremental` and `params.mapSize = pDefinition.mapSize` (`objMap.txt:95-97`), i.e. the map grid cell (x,y) holds the integer `(y-1)*mapSize.x + x` (`objDataMap.createIncremental`, `objDataMap.txt:59`, and `calcEntryNum`: `entryNum = (theLoc[2] -1) * pMapSize[1] + theLoc[1]` `objDataMap.txt:86-90`). Rooms are appended to `pRooms` in file order (`objMap.initRoom`, `objMap.txt:188-199`) and looked up as `pRooms[roomNum]` where `roomNum = me.peek(theLoc)` (`gotoRoom`, `objMap.txt:491-497`; `getRoomInDirection`, `objMap.txt:415-424`). So room `num` N (which must equal its 1-based position in `#rooms`) sits at column `((N-1) mod mapSize.x)+1`, row `((N-1) / mapSize.x)+1` -- row-major, left to right, top to bottom. If fewer rooms than `mapSize.x*mapSize.y` are present, blank rooms are appended (`objMap.txt:168-186`).
- **Map arrays are `[row][col]`** (outer list = rows / y, inner = columns / x). `objDataMap.peek`: `mx = theLoc[1]; my = theLoc[2]; return pMap[my][mx]` (`objDataMap.txt:108-117`), and `poke` writes `pMap[my][mx]` (`objDataMap.txt:181`). Consistent with tvsDemo: each `#map` has 9 inner lists of 18 entries for `roomSize point(18, 9)`. All tile coordinates are 1-based (`checkValidLoc`: `GeomInside(theLoc, rect(1,1,pMapSize[1], pMapSize[2]))`, `objDataMap.txt:46-48`).
- **Tile index 0 = empty/nothing**. `objTileSetKey.getTileSymbolByNum`: `if tileNum = 0 then tileSymbol = #none` (`objTileSetKey.txt`). When rendering, `objTileMap.tileImage` calls `pTileSet.getTileNo(nImageNum)` and only blits `if ilk(nImage) = #image` (`objTileMap.txt:200-213`); `getTileNo(0)` -> `pTiles.peekEntryNo(0)` yields an invalid loc and returns the `#errorOutsideMap` symbol, so nothing is drawn (transparent). Blank map default entry is 0 (`objDataMap.txt:15`: `i[#blankEntry] = 0`).
- **Tile index to tileset position**: 1-based, row-major over the sheet. `objTileSet.makeTiles` slices `allTilesImage` into an `objDataMap` of `point(width/tileSize.x, height/tileSize.y)` tiles (`objTileSet.txt:191-223`: `xStart = xNum * tileSize[1]; yStart = yNum * tileSize[2]`, poked at `point(xNum+1, yNum+1)`), and `getTileNo(i)` -> `pTiles.peekEntryNo(i)` where `col = ((theNum-1) mod pMapSize[1]) +1; row = ((theNum-1) / pMapSize[1]) +1` (`objDataMap.txt:119-131`). With the merlinOpen sheets this is **10 tiles per row** (key file comments: `-- 10 tiles per row`), so index i -> col `((i-1) mod 10)+1`, row `((i-1)/10)+1`; pixel origin `((col-1)*32, (row-1)*32)`.
- Room rendering: `objRoom.getImageSize` = `point(tileSize[1] * roomSize[1] * pDefaultScale, tileSize[2] * roomSize[2] * pDefaultScale)` (`objRoom.txt:365-368`); `objTileMap.tileImage` blits each tile at `(xNum * tileScaleSize, yNum * tileScaleSize)` with `copyPixelsParams = [#useFastQuads: true, #ink:36]` (ink 36 = transparent/matte... see Open questions) (`objTileMap.txt:13`, `188-215`). Each layer is drawn as a separate sprite (see section 8).

## 2. Tile keys

Key files are Director text/field members named `<tilesetMember>_key` in the `data` cast (`objTileSetKey.interpretDefinition`: `defTxt = member(pMember.name & "_key", castLibrary).text`). Exported here as `casts/data/tlk_merlinOpen{Passive,Active,Objects}_key.txt`.

Format (`objTileSetKey.interpretDefinition`, `script_objects/objTileSetKey.txt`):
- Line `tileSize | point(32,32)` sets `pDefinition.tileSize` (value after `| `). Default in `structTileSetDefinition` is `point(16,16)` (`master_objects/structMaster.txt:906-911`) but all three merlinOpen keys declare `tileSize | point(32,32)`.
- Lines whose first word is `--` are comments and are skipped (no key slot consumed). Comments in the files document the layout: `-- 10 tiles per row` / `-- 10 cols per row`, `-- >> row 1 golden palace` ... `-- >> row 23 frigid caves` (Active), `-- row 1` ... `-- row 21` (Objects).
- Every other line (including blank lines) consumes one slot: `pDefinition.theKey[tileNo] = value(nLine); tileNo = tileNo + 1`. So key entry k corresponds to tile index k in the tileset image (1-based, row-major, 10 per row). A blank line yields `VOID` (value("")), which behaves like "no special meaning" (not `#solid`).
- `getTileSymbolByNum(0)` returns `#none`; `getTileNum(sym)` returns the first tile index for a symbol.

Meaning of symbols:
- `#none`: walkable / empty. `objCollisionMap.checkCollisions` skips tiles whose type is `#none` (`objCollisionMap.txt:175-195`), and `modCollisionDetection.getActiveTileTypeAtLoc` treats `#none` as "empty space inside the playArea" vs `#outsidePlayArea` (`modCollisionDetection.txt`, handler `getActiveTileTypeAtLoc`).
- `#solid`: fully blocking tile. `objCollisionTile.initCollisionEdge`: `solid = false; if pTileType = #solid then solid = true` for all four edges (`objCollisionTile.txt:46-97`). Also `objCollisionMap` uses `i.blankEntry = #solid` for its 2-tile-thick outer border (`objCollisionMap.txt:23-30`, `i[#borderThickness] = 2`).
- Also recognised by `initCollisionEdge` (one-sided/platformer types, from the same engine's side-scrolling heritage): `#wallLeft` (left edge solid), `#platform` (top edge solid; also special-cased in `mergeEdges` and `calcOverlapPlatform`), `#wallRight` (right edge solid), `#ceiling` (bottom edge solid). **None of these appear in the merlinOpen keys** (Passive: all blank; Active: only `#none` x34 and `#solid` x187 plus blanks; Objects: `#none` x55 plus actor symbols).
- In the `#objects` key, any non-`#none` symbol is an actor name (`#player`, `#berlinInGame`, `#tv`, `#walkSpeed`, ...) that is spawned by `objTileLayer.activateActors` -> `g.actorMaster` when the room activates; the objects layer is *not* drawn as tiles in play mode (`objRoom.getScaleImage`: "don't draw objects layer if pMode = #activate", `objRoom.txt:492-527`).

**Which layers collide:** only `#backgroundActive`. `modCollisionDetection.initCollisionMap`: `objTileLayer = me.ID.bigMe.pTileLayers[#backgroundActive]` ... `params.objTileMap = objTileLayer` (`modCollisionDetection.txt`, handler `initCollisionMap`), and `objCollisionMap.initMap` does `keyMap = pObjTileMap.convertToKey()` (numbers -> key symbols) and pokes it into a map of size `roomSize + 2*borderThickness` at offset `point(2,2)+1` (`objCollisionMap.txt:37-62`). `#backgroundPassive` never collides (its key is all blank anyway).

## 3. Tileset images

- The tileset bitmaps are cast members of the `data` cast named with the `tlk_` prefix: `collectionsMaster` maps `c[#objTileSetKey] = "tlk"` (`master_objects/collectionsMaster.txt:24`), scans every member of `castLib("data")` and, for prefix `tlk`, creates an `objTileSetKey` with `params.member = nMem` keyed by the name after the prefix (`collectionsMaster.txt:30-52`: `nNewName = StringToSymbol(nName.char[5 .. 99])`). Members ending in `key` or `properties` are skipped (`pNamesToSkip = ["key", "properties"]`).
- So `#tileSet: #merlinOpenPassive` -> bitmap member `tlk_merlinOpenPassive` (data cast) + text member `tlk_merlinOpenPassive_key`; likewise `tlk_merlinOpenActive`, `tlk_merlinOpenObjects`. `objTileSetKey.initParams`: `params.allTilesImage = params.member.image; params.tileSize = pDefinition.tileSize`.
- Tile size: 32x32 px (`tileSize | point(32,32)` in all three keys). Sheet layout: 10 tiles per row, sliced row-major by `objTileSet.makeTiles` (sheet width/32 columns, height/32 rows; `objTileSet.txt:191-223`). Key entry counts (non-comment lines after the tileSize line): Passive 58, Active 261, Objects 228 -- so the Active sheet is at least 27 rows (comments label rows up to 23; trailing entries are blank), Objects at least 23 rows.
- Tiles are cut with `copyPixelsParams = [#useFastQuads:true, #ink:0]` (copy) into 32-bit images (`objTileSet.txt:13`, `211-212`). Layers are composited with ink 36 (Director "Background Transparent": the background colour, white, becomes transparent) -- `objTileMap.txt:13` and `objRoom.getScaleImage` `copyPixelsParams = [#usefastQuads: true, #ink:36]`. Hence white pixels in Active tiles show the Passive layer through.
- The exported bitmaps were not found under `../gfx/` (only `_tileSet.tif` exists there); they live inside the `.dir`/`.cst` data cast. The map editor `.dir` in the parent folder is named "adjustableDisplayScaleAndUpdatedTiles", suggesting `displayScale` in layerDefinitions is honoured by the editor; in the engine `objTileSet` stores `pDisplayScale` but the room is drawn at `objRoom.pDefaultScale = 1` (`objRoom.txt:30`) and map `roomPlayScale` is parsed into the struct but never read by `objMap` (grep: only `structMaster.txt:500` and the map files mention it).

## 4. Timing

- The engine runs its own frame limiter: `master_objects/frameTimer.txt` `init`: `pFrameRate = 30; pFrameLength = 1000 / pFrameRate`; `update`: `if frameTime < pFrameLength then me.waitFrame(frameTime)` where `waitFrame` busy-waits (`repeat while the milliseconds < nFrameSecs`). It is started in `movieMaster.start` (`master_objects/movieMaster.txt:31`: `g.frameTimer.start()`) and registered on `g.updater` with priority `#hi`. So the game logic tick is **30 Hz** (or slower if the machine cannot keep up -- there is no delta-time compensation; everything below is "per tick").
- No `puppetTempo`/`the frameTempo` appears in the exported scripts; the Director movie tempo itself is not in the text export (see Open questions).
- `gGameSpeed` (a global, value not in the export; presumably 1) scales friction (`objMoveXY.txt:174`), gravity and all `Counter` increments (anim delays `objAnimStrip.txt:31`).
- `objMoveXY` is an `objAutoUpdate` ticked by `g.updater` (registered in `objAutoUpdate.calcStart`/`unpaws`, `objAutoUpdate.txt:82-86`, `145-147`; `objGameObject.start` calls `pMoveXY.calcStart()` `objGameObject.txt:777`). The character object itself and its AI are also updater clients; the AI's key handling is invoked from inside `objMoveXY.update` via `pCallingPrg.updateAI()` -> `objAiGameObject.updateAI` -> `pAI.update()` (`objAiGameObject.txt:153-155`), which guarantees input is applied immediately before friction/integration in the same tick.
- Walk speed is applied per tick inside `objMoveXY.update` (`script_objects/objMoveXY.txt:160-200`), which is the single integrator used by every game object:
  ```
  if pAdjustXY then pCallingPrg.updateAI()            -- player input -> vectAdd (see section 5)
  speed = PointPositive(pVect.duplicate())
  lostSpeed = PointValRange(pFriction, [point(0.000,0.000), speed])   -- pFriction is a PERCENT of current speed per axis
  lostSpeed = lostSpeed * gGameSpeed
  GravWeightSpeed = pGravity * pWeight * gGameSpeed    -- pGravity = 0 for top-down, so no effect
  pVect[2] = pVect[2] + GravWeightSpeed
  pVect = PointTowardZero(pVect, lostSpeed)
  mvVect = pVect.duplicate()
  if gMoveSpeedLimit <> #none then mvVect = PointConstrainToRect(mvVect, gMoveSpeedLimit)   -- +/-31 px
  newLoc = pLoc + mvVect
  ...
  if pAdjustXY then newLoc = pCallingPrg.checkCollisions(newLoc)
  me.moveLoc(newLoc)
  pSpr.loc = pLoc.duplicate()
  ```
  `PointValRange(percent, [lo, hi])` = `lo + percent/100 * (hi-lo)` (`general_functions/varValRange ().txt`), so with the default friction `point(50,50)` (`objGameObject.txt:35`: `friction = point(50, 50)`) the velocity loses 50% of its magnitude every tick, after the input acceleration has been added. Positions are floats (`pVect = point(0.00,0.00)`), the sprite loc is assigned the float point (Director rounds for display).

## 5. Player movement

### Input
- Key bindings are `bnd_*` fields in the data cast; default set is `#wasd` (`keyMaster.txt:19`: `pDefaultKeySet = #wasd`). `data/bnd_wasd.txt`: `#up:13, #down:1, #left:256, #right:2` (Mac virtual key codes: 13=W, 1=S, 2=D; 256 presumably stands in for 0=A). `data/bnd_arrow.txt`: `#up:126, #down:125, #left:123, #right:124`. Descriptions in `kyd_all.txt` ("Move Up"...).
- `keyMaster.checkKeys` polls `keyPressed(nKeyNum)` for every binding each tick and then `updateMoveVector` sums `pMoveKeyVectors`: `m[#up] = point(0,-1); m[#down] = point(0,1); m[#left] = point(-1,0); m[#right] = point(1,0)` (`keyMaster.txt:17-33`, `126-136`). Opposite keys cancel to 0; so the move vector is one of the **8 directions or zero**, each component in {-1,0,1}. No diagonal normalisation.
- `objAiPlayer.interpretMoveKeys` (`objAiPlayer.txt:233-246`): `moveVector = g.keyMaster.getMoveVector()`; in `#freeze` mode it is zeroed; then `me.pCharacterPrg.moveHoriz(moveVector[1]); me.pCharacterPrg.moveVert(moveVector[2])`. Called every tick from `objAiPlayer.update` while the AI mode is `#attack, #playerControl, #freeze, #release` (`objAiPlayer.txt:344-360`).

### Acceleration / friction model (`script_objects/modMoveToLoc.txt`)
- `moveHoriz me, dir`: `me.pMoveXY.vectAdd(point(pWalkAcceleration * dir, 0))` then `moveHorizReaction(dir)`; `moveVert` adds `point(0, pWalkAcceleration * dir)` (`modMoveToLoc.txt:317-320`, `481-484`). Defaults `i[#walkAcceleration] = 0.5; i[#walkSpeed] = 0` (`modMoveToLoc.txt:50-64`); the player actor sets `#walkAcceleration: 2` (`data/act_player.txt`). (`#walkSpeed` is only used by the AI helper `moveTowardsLocSpeed`; `data/act_merlin.txt` `#walkSpeed: 4` belongs to the cut-scene/"merlin" actor, not the playable `#player` actor which is `act_player` -> `#objType: #objPlayerMerlinCharacter, #AiType: #objAiPlayer`.)
- Per tick, per axis, with a = walkAcceleration = 2, friction 50%: `v' = (v + a*dir) * 0.5`. Steady state while a key is held: **v = a = 2 px/tick = 60 px/s at 30 Hz** (approached as 1, 1.5, 1.75, 1.875 ... from rest); releasing the key halves speed each tick (2, 1, 0.5, ...), so stopping takes ~3 visible ticks. Diagonal speed is 2*sqrt(2) ~ 2.83 px/tick (no normalisation). Note the `#walkSpeed` potion actually increases the player's *acceleration* (`objPlayerMerlinCharacter.txt:194-195`: `#walkSpeed: me.incWalkAcceleration(#potion)`), which raises the steady-state speed by the same amount.
- `gMoveSpeedLimit = rect(-31,-31,31,31)` (per-tick clamp, `modCollisionDetection.setMoveSpeedLimit`) keeps a mover from ever skipping a full 32 px tile.
- `friction` alternatives exist (`frictionXOff` -> 5%, `frictionStrong` -> 20%, `frictionReel` -> `point(10,10)`) but are for knock-back/reel modes (`objGameObject.txt:366-397`).

### Facing and animation
- Facing is horizontal only. `moveHorizReaction` (`modMoveToLoc.txt:327-340`): `if dir < 0 then me.pSpr.fliph = true; pMoveHoriz = true` / `dir > 0 -> fliph = false` / `dir = 0 -> pMoveHoriz = false`. Vertical-only movement keeps the previous facing. Art faces **right** natively (`objGameObject` default `initFaceDir = 1` -> `setFlip(0)`, `objGameObject.txt:50`, `735-741`).
- `pMoveHoriz`/`pMoveVert` are reset every tick (`modMoveToLoc.update` -> `resetMoveReaction`) and `getMoving` = `pMoveHoriz or pMoveVert` (`modMoveToLoc.txt:212-218`), i.e. "moving" means *a direction key is held this tick*, not "velocity non-zero".
- Anim strip selection (`modAnimSet.getAnimSym`, `modAnimSet.txt:86-145`): the symbol defaults to the character's mode (`#walk` during normal play: `objCharacter.internalEvent #buildingFinished: if pMode = #stand then goMode(#walk)`, `objCharacter.txt:229-231`). Then: `if sym = #walk then if me.big.getMoving() = false then sym = #stand`. While charging/releasing a spell: `#charge`->`#chargeWalk`, `#release`->`#releaseWalk` when moving. `objAnimSet.symExistsOrDefault` falls back to `#stand` for missing strips (`objAnimSet.txt:53-58`).
- Strips come from cast members named `anm_<chr>_<animName>_<delay>_<frame>` (`animStripMaster.txt:25-33`); merlin's are `anm_mer_walk_3_01 .. _08` (8 frames, delay 3), `anm_mer_charge_3_01..04`, `anm_mer_chargewalk_3_01..04`, `anm_mer_release_2_01..04`, `anm_mer_releasewalk_3_01..04`, `anm_mer_naturalMelee_3_01..07`, `anm_mer_grave_3_01` (`../gfx/merlin/`). Frame timing: `objAnimStrip.getMember` advances to the next member when a `Counter` with `tim = [1, delay]`, `inc = gGameSpeed` finishes (`objAnimStrip.txt:18-34`, `89-93`), i.e. each walk frame is shown for `delay` = 3 ticks -> full 8-frame walk cycle = 24 ticks = 0.8 s. **No `anm_mer_stand_*` bitmap exists in `../gfx/merlin`** (see Open questions).
- Sprite member swap each tick: `SpriteSetMember(spr, mem, #gameChar)` sets `spr.member`, width/height from the member, and `spr.ink = 36` (background transparent) (`general_functions/SpriteSetMember().txt`).

### Registration point and spawn position
- The sprite's `loc` *is* the object position (`pSpr.loc = pLoc`), so the member's registration point is the world position. `act_actor.txt`: `#startOffset: point(-16, -16)`. Objects are spawned from the `#objects` layer by `objTileLayer.activateActors` (`objTileLayer.txt:160-187`): `objectLoc = tileLoc * tileSize + mapLocation` with **1-based** `tileLoc`, i.e. the tile's bottom-right corner in screen px; `actorMaster.startActor` then adds `params.startOffset` (`actorMaster.txt:205-207`) -> the player's reg point starts at the **centre of the `#player` tile**: `roomLoc + ((col-1)*32+16, (row-1)*32+16)`. The player is only spawned if `g.actorMaster.getPlayer() = #none` (`objTileLayer.txt:171-173`), so it persists across rooms.
- The registration points of the merlin bitmaps live in the cast, not in the export; the collision-rect derivation (section 6) assumes they are near the middle of a >= 32 px sprite.

## 6. Collision

### Collision map construction
- Built per room on activation (`modCollisionDetection.activate` -> `initCollisionMap`; `g.collisionMaster.setCollisionMap(pCollisionMap)`). It is an `objDataMap` of `objCollisionTile` objects with size `roomSize + 2*2` (border thickness 2, all border tiles `#solid`) (`objCollisionMap.txt:23-62`). The room's active-layer key symbols are poked at `startLoc = point(2,2)+1 = (3,3)`.
- Each `objCollisionTile` precomputes four edges in **screen pixel coordinates** (`initCollisionEdges`, `objCollisionTile.txt:99-111`):
  ```
  firstTile = pCollisionMap.getFirstTileLoc()          -- roomLocation - tileSize*borderThickness  (objCollisionMap.txt:317-322)
  pEndOfTile = firstTile + (tileSize * pLocInMap)
  pStartOfTile = pEndOfTile - tileSize
  pStartOfTile = pStartOfTile - point(1,1)
  ```
  i.e. a tile at 1-based collision-map loc (cx,cy) spans screen x from `roomX + (cx-3)*32 - 1` (left edge location) to `roomX + (cx-2)*32` (right edge location). An edge is `solid` when the tile is `#solid` (or the one-sided types, see section 2) (`initCollisionEdge`, `objCollisionTile.txt:46-97`).
- `mergeEdges` (`objCollisionTile.txt:455-487`): for each tile's `#right` and `#bottom` neighbour, if both facing edges are solid they are both set non-solid, so only the *outline* of solid regions has active edges. `identifyAsCornerTile` (`objCollisionTile.txt:388-453`) marks a solid tile as a corner tile and records which of its corners (`#topLeft`, ...) are "solid corners" -- a corner where the vertical neighbour's side edge and the side neighbour's vertical edge are both solid, i.e. a convex corner of the solid outline.
- Speed limit: `modCollisionDetection.setMoveSpeedLimit` sets `gMoveSpeedLimit = rect(-32,-32,32,32)` then `inflate(..., -1, -1)` -> +/-31 px per frame; the movement code clamps the per-frame vector to it (see section 5).

### Collision resolution (`objCollisionMap.checkCollisions`, `objCollisionMap.txt:175-297`)
Called with the candidate `newLoc` and the movement direction `dir` (each component -1/0/1). Returns the corrected `newLoc`.
1. `if dir = point(0,0) then return newLoc`.
2. `collisionRect = callingPrg.calcCollisionRect(newLoc)`; the 4 corner points of that rect are converted to collision-map tile locs (`selectTilesFromCollisionRect`, `objCollisionMap.txt:405-459`: `tileRect = (collisionRect.rect + pMagicRect) / pTileSize + pBorderThickness`, where `pMagicRect` = `tileSize - roomLocation` on every side, `initMagicRect` `objCollisionMap.txt:85-89`; so tile = floor((screenPx - roomX)/32) + 1 + 2). **Only the 4 corner tiles are tested** (duplicates removed), so the collision rect must be smaller than one tile (32 px) in each dimension for correctness.
3. For each corner tile that is not `#none`: `overlap = tile.calcOverlap(collisionRect.rect, dir)` -> `[xOverlap|#none, yOverlap|#none, cornerFlag]`. `calcOverlapEdges` (`objCollisionTile.txt:237-264`) only tests edges facing the movement: moving right (`dir[1] = 1`) tests the tile's `#left` edge: `overlap[1] = collisionRect.right - leftEdge.location`; moving left tests `#right` edge: `collisionRect.left - rightEdge.location`; moving down tests `#top`: `collisionRect.bottom - top.location`; moving up tests `#bottom`: `collisionRect.top - bottom.location`. (Note the overlap is computed regardless of sign; a negative/zero value means "not yet past the edge" on that axis but the code still treats a non-#none value as a hit and pushes -- see step 4. Because the 4 tiles are exactly the ones the rect lies in, the rect necessarily already overlaps the tile, so every tested edge of a solid corner tile produces a real overlap.)
4. Choose the axis to correct (`objCollisionMap.txt:190-213`): if `overlap[3]` (corner case) -> both axes; if only one axis has a value -> that axis; if both -> the axis with the **smaller** absolute overlap (`overlapPositive = PointPositive(overlap); axisToChange = 1; if overlapPositive[1] > overlapPositive[2] then axisToChange = 2`). Then `newLoc[axis] = newLoc[axis] + (overlap[axis] * -1)` -- a push-out, which makes the character **slide** along walls when moving diagonally. After each push the rect is recomputed for the next tile.
5. Callbacks: `collisionCeiling` (pushed down), `collisionPlatform` (pushed up while `dir[2]=1`), `collisionWallLeft`/`collisionWallRight`; if moving down and nothing pushed up -> `collisionNoPlatform`. The callback follows the axis that was changed: a y-only push calls `collisionCeiling`/`collisionPlatform`, an x-only push or a corner push (`axisToChange = #both` takes the non-vertical branch) calls `collisionWallLeft`/`collisionWallRight`. For the player these zero the velocity on that axis (see the order-of-operations notes below).
6. **Corner handling** (`calcOverlapCorners`, `objCollisionTile.txt:198-235`): only when the tile is a corner tile and no edge overlapped (which can only happen when the mover approaches a convex corner exactly diagonally, since `mergeEdges` removed inner edges). For `#topLeft` corner with `dir = point(1,1)` it sets both overlaps (`top` vs `rect.bottom`, `left` vs `rect.right`) and `overlap[3] = true`, so the mover is pushed out on both axes (stopped dead at the corner). Similarly `#topRight` with `dir=(-1,1)`, `#bottomRight` with `(-1,-1)`, `#bottomLeft` with `(1,-1)`.
7. **Remake decision: swept moves.** Because only the destination is tested, a move longer than the rect plus a tile (46 px for Merlin's 14 px box) jumps a 1-tile wall; the original shares this. In the port a thunderBlast can stack its bullet hit (applied twice) and its splash into one tick's knockback, and the player's first knockback tick is not clamped to 31 px, so Merlin was blasted through walls. `sweepTileCollision` (`src/mr-open/mr-collision.ts`) splits each tick's move into equal sub-steps of at most `MAX_COLLISION_SUBSTEP_PX` (8 px, and at most half the rect's smaller side), resolving each with the ported push-out; a pushed axis stops for the rest of the tick, the free axis keeps sliding, and the wall flags (velocity zeroing, a reeling character's wall damage) are applied once per tick as before. Moves that fit in one sub-step (all walking) are unchanged. Used for the player, characters and dwellings; spells and bullets ignore tiles.


### Player collision rect (`script_objects/modCollisionRect.txt`)
- Default `collisionRect = #none`, `collisionRectType = #fixed`, `collisionRectClipTop = 0` (`modCollisionRect.txt:18-24`); no actor data for the player overrides these. On first use `initRectFromCurrentImage` (`modCollisionRect.txt:54-84`) builds it from the *current anim member*:
  ```
  collisionRect = rect(-regX, -regY, width - regX, height - regY)
  clamped to pCollisionRectMax = rect(-16,-16,16,16)  (max on left/top, min on right/bottom)
  collisionRect = collisionRect.inflate(-1, -1)
  ```
  so for a sprite at least 32 px wide/high with a central reg point the rect is **`rect(-15,-15,15,15)` around the reg point (30x30 px)**; smaller sprites get a rect equal to their bitmap bounds minus 1 px. `calcCollisionRect(theLoc)` = `pCollisionRect + rect(theLoc, theLoc)` (`modCollisionRect.txt:97-105`).
- Collision is checked on the whole 30x30 box, not the feet; there is no separate "shadow" rect for the top-down view.

### Order of operations per tick
`objMoveXY.update` -> `objGameObject.checkCollisions(newLoc)` (`objGameObject.txt:247-256`): `if pCollisionDetection then newLoc = g.collisionMaster.checkCollisions(me.big, newLoc)`; `collisionMaster.checkCollisions` (`collisionMaster.txt:39-47`): `dir = PointDirPoint(point(0,0), vect)` (sign of the *velocity*, not the key), `newLoc = pCollisionMap.checkCollisions(callingPrg, newLoc, dir)`, then `if pExitsOpen then newLoc = me.checkLeaveScreen(callingPrg, newLoc)`. Wall callbacks `collisionWallLeft/Right` do `pMoveXY.setVectX(0)` when `gBounceyWalls` is false (`objGameObject.txt:314-332`); `collisionCeiling`/`collisionPlatform` do `pMoveXY.setVectY(0)` (`objGameObject.txt:295-309`); the player inherits them unchanged through `objPlayerMerlinCharacter` -> `objCharacter` -> `objAiGameObject` -> `objGameObject` (`objCharacter.collisionPlatform`, `objCharacter.txt:130-141`, calls the ancestor first and then only reacts to the side-on `#reelFly/#jump/#fall` modes), so hitting a floor or ceiling zeroes the vertical velocity just as a side wall zeroes the horizontal one. A corner push moves both axes but, taking the wall branch, zeroes only x.
- `constrainToPlayArea` is off for the player: `objGameObject.autoConstrainToPlayArea` sets it false whenever collision detection is on (`objGameObject.txt:164-172`), and the player has `allowScreenExit = true` (`objPlayerMerlinCharacter.txt:25`).

## 7. Room transitions

- **Detection**: only when exits are open (`collisionMaster.pExitsOpen`). `checkLeaveScreen` (`collisionMaster.txt:109-117`): `if inside(newLoc, pPlayAreaRect) then nothing else newLoc = callingPrg.exitedPlayArea(newLoc)` -- tested on the object's **loc (reg point)**, not its collision rect. `pPlayAreaRect = currentMap.getSpriteRect()` = the room sprite's rect (`collisionMaster.initPlayArea`, `collisionMaster.txt:27-37`; fallback `rect(0,0,gStageSize[1], 288)`). For the player `exitedPlayArea` -> `g.collisionMaster.notifyOfScreenExit` (`objGameObject.txt:351-358`) -> `exitDir = PointDirRect(newLoc, pPlayAreaRectToFindLeaveDir) * -1` (rect inflated by -1 px) -> `outsidePlayArea(exitDir)`, which stores `pLeaveMode`, `pLeaveDir`, goes to mode `#leaveRoom` and clears the room-clear flag (`objPlayerMerlinCharacter.txt:174-181`). `exitDir` is axis-aligned (component +/-1 only on the axis that left the rect) unless the reg point leaves through a corner.
- **Why solid walls do not normally block leaving**: the collision map's 2-tile border is `#solid`, but when the room is cleared `modCollisionDetection.openExits` calls `pCollisionMap.insertExitTiles(surroundingExitTiles)` which overwrites the *inner* border ring (collision-map row/col 2 and roomSize+3; `calcExitTileEdgeStartLoc`, `objCollisionMap.txt:159-172`) with the **neighbouring room's facing edge tiles** (`objMap.getSurroundingInfo`, `objMap.txt:461-481`: for `#left` it asks the room to the left for its `#right` edge, etc.; `objTileLayer.getScreenExitsForEdge` returns `getTileSymbolByNum` of `peekCol(1)`/`peekRow(1)`/last col/row). `objCollisionTile.setTileType` re-derives edges/corners locally (`objCollisionTile.txt:493-525`). So the player can walk out where both the current room's edge tile and the neighbour's edge tile are non-solid; the outer ring stays solid but is never reached because the reg point exits the play rect first (collision box is only 15 px beyond the reg point).
- **Map edges**: `getRoomInDirection` returns `#none` outside the map (`objMap.txt:415-424`), `getSurroundingInfo` leaves that edge as `[]`, `insertExitTileEdge` loops zero times, so the solid ring remains and the player cannot leave the map. (`getMapEdgesForCurrentRoom` `objMap.txt:388-413` also reports which sides touch the map edge, used by the minimap/arrows.)
- **Exit blocking / opening** (`objRoom.attemptOpenExits`, `objRoom.txt:187-223`): on `activate` the module first `closeExits` (`g.collisionMaster.setExitsOpen(false)`); then `if g.teamMaster.isPlayerEnemiesDead()` -> `setRoomClear(true)`, `me.openExits()`, play `"end_screen"` sound the first time (unless whole map clear), `if gExitArrows then me.drawExitArrows()`. `attemptOpenExits` is re-run when enemies die (via teamMaster). While closed, `pExitsOpen = false` so the play-rect exit test is skipped *and* the solid ring blocks.
- **Exit arrows** (`objRoom.drawExitArrows`, `objRoom.txt:232-258`): combines this room's edge tiles with the neighbours' (`ListCombineExitTiles`: an entry is `#solid` if either side is solid, else `#none`; `[]` if either list is empty, i.e. map edge), converts runs of `#none` edge tiles into pixel ranges (`modScreenExits.convertExitTilesToRangesEdge`, `modScreenExits.txt:149-204`: `currentStart = (tileNo-1)*tileLength`, `currentEnd = tileNo*tileLength`) and draws arrows onto the room image (`drawExitArrowsOnImage`), coloured by `surroundingHostiles`. `setExitCollisionZones`/`convertExitRangesToCollisionRectsEdge` (`modScreenExits.txt:102-136`) build rects of thickness `pCollisionRectThickness` just outside the room for the `#solid` runs, but the call is commented out in `drawExitArrows` (`-- me.pTileLayers[#backgroundActive].setExitCollisionZones(combinedTiles)`), so the collision-map ring is the only blocker.
- **Transition is a hard cut, no scrolling.** `objPlayerMerlinCharacter.update` in mode `#leaveRoom` (`objPlayerMerlinCharacter.txt:249-270`):
  ```
  theMap = g.gameMaster.getCurrentMap()
  theMap.moveRoom(pLeaveDir)            -- objMap.moveRoom -> moveToRoom: old room offScreen() (sprite freed, deactivate/freezeObjects), gotoRoom(loc), showRoom() at the same pLocation, activate()
  myVect = me.getVect()
  roomSize = theMap.getRoomSizeInPixels()   -- pRoomSize * tileSize = (576, 288) for 18x9
  moveAmount = roomSize
  moveAmount = moveAmount * (pLeaveDir * point(-1,-1))
  me.pMoveXY.setLoc(me.getLoc() + moveAmount)   -- wrap to the opposite edge, same offset along the edge
  me.setVect(myVect)                            -- velocity preserved
  me.pMode = pLeaveMode
  me.eventNotify(#enteringNewRoom)
  ```
  e.g. leaving right at x = roomRight+e places the player at x = roomLeft+e in the next room. `objMap.moveToRoom` (`objMap.txt:540-557`) calls `pCurrentRoom.offScreen()` then `gotoRoom` and `showRoom` (`objRoom.show` -> `onScreen(theLoc)` -> rebuild image, `setSpriteLoc(theLoc)`, then `activate`). The new room's `activate` (`objRoom.txt:110-137`) adds the player to its object list, spawns actors on first visit (`activateActors`) or restores saved state, rebuilds the collision map (`modCollisionDetection.activate`), closes exits, then `attemptOpenExits`.
- **A charging spell goes along.** `objRoom.freezeObjects` -> `getRoomObjects` (`objRoom.txt:277-287, 462-478`) first calls `removeChargingSpell` (`objRoom.txt:585-591`: "spells already fired should be kept, as they need to be finished"), so the player's charging spell is neither saved with the room nor finished; the player (whose `pMode` is restored to `pLeaveMode`, e.g. `#charge`) then sends `#enteringNewRoom`, which the spell subscribed to (`modSpellMultistage.registerForEvents`, `modSpellMultistage.txt:291-296`) and answers with `reobtainPermission` (only meaningful for summon payloads). The charge therefore continues in the new room. (`objAiAttack.moveRoom`, `objAiAttack.txt:290-295`, would re-call `chargeMagic` but nothing calls it.)
- `overlapToLeaveRoom` (`= 14`, `act_player.txt`, `objPlayerMerlinCharacter.txt:33`) is read into `pOverlapToLeaveRoom` but **never used** anywhere else (grep). `structWalkScrollArgs` (`dir #left, speed 3`) is only used by `cutSceneMaster.walkScrollLeft/Right` for cut scenes, not by gameplay room changes.
- `gNavMode` (navigation/minimap mode) is left before moving and may be re-entered by `attemptOpenExits` (`objRoom.txt:209-211`).

## 8. Viewport

- Room image size = `roomSize * tileSize * pDefaultScale` = **576 x 288 px** for the 18x9 merlinOpen rooms (`objRoom.getImageSize`, `objRoom.txt:364-369`; `pDefaultScale = 1`). The room is one bitmap member/sprite with reg point top-left (`objRoom.refreshImage`: `me.setRegPoint(#topLeft)`, `objRoom.txt:579-583`) placed at `pLocation` (`onScreen`: `me.setSpriteLoc(theLoc)`), with `locZ = pLayer` = `gMapLayer + (map index)` (`objMapController.txt:39-44`).
- Where `pLocation` comes from: screens are defined by "mark" sprites placed in the Director score; `screenMaster.getMarks` (`screenMaster.txt:105-128`) records each sprite's member, loc, width, height. `objScreen.startObjects` (`objScreen.txt:391-408`) creates one controller object per mark whose member name matches `p[#objectKey] = [#map: "dd_map_", ...]` (`objScreen.txt:36`), passing `nLocation = nMark.loc` -> `mapController.newObject(defMember, location)` -> `objMap.pLocation`. So the map definition text member is named `dd_map_<mapName>` and its sprite position on the game-screen frame is the play-area origin. **The numeric position is not in the text export.** Constraints: the stage is 640 x 320 (`../dir_template.html:12`: `width=640 height=320`); `collisionMaster.initPlayArea` fallback `rect(0,0,gStageSize[1], 288)` implies the room occupies the top 288 px and the bottom 32 px are HUD; horizontally 640-576 leaves 64 px (either a 32 px margin on each side or a side bar).
- HUD elements referenced: `health_bar_surround` (player energy bar, `objPlayerMerlinCharacter.txt:57-60`, locZ raised by `gMapBoundaryLayer`) and `room_bar_surround` (room init progress, `objMap.txt:135`); their positions are also score sprites. `gMapBoundary > 0` draws four `dot` sprites as a frame `inflate(mapRect, gMapBoundary, gMapBoundary)` around the room (`modBoundary.displayBoundary`, `modBoundary.txt:34-51`).
- Display scale: the engine draws at scale 1 (`objRoom.pDefaultScale = 1`, `objTileSet.pDisplayScale` only used by the editor UI); `roomMapScale = 0.0625` is the minimap scale (`objMap.displayRoomMap`, `objMap.txt:288-314`), `roomEditScale` prints "implement roomEditScale" (`objMap.txt:88-90`).

## 9. Other details needed for identical walking feel

- **No diagonal normalisation**: both axes receive `walkAcceleration` independently, so diagonal movement is sqrt(2) faster (2.83 vs 2 px/tick).
- **Input is sampled per tick**; the same tick order every frame is: AI (keys -> vectAdd) -> friction -> clamp -> collision push-out -> exit test -> sprite loc. Wall hits zero the horizontal velocity only.
- **"Moving" for animation purposes = key held this tick** (`pMoveHoriz/pMoveVert`), so the walk animation stops instantly on key release while the sprite still glides ~1.5 px.
- **Sprite ink**: all game-object sprites use ink 36 (background transparent) with sprite size forced to the member size on every frame change (`SpriteSetMember`).
- **Z-ordering**: `pSpr.locZ = params.layerZ` is set once at creation (`objGameObject.txt:107`); the player uses `#layerZ: gPlayerLayer` (`act_player.txt`), other actors `gGameObjectLayer` (`act_actor.txt`), the room `gMapLayer + index`, the boundary/HUD `gMapBoundaryLayer`. No per-frame y-sorting was found (no `locZ` writes in update paths; `objHair` sets `gPlayerLayer + pos` for hair segments). The `#objects` tile layer is never drawn in play mode; scenery such as `#treesRocks` is spawned as actors with their own `layerZ`, so a sprite is always either wholly above or wholly below the player regardless of y. Values of the `g*Layer` globals are not in the export.
- **Per-tick speed cap** `gMoveSpeedLimit = +/-31 px` (`modCollisionDetection.setMoveSpeedLimit`).
- **Collision uses the velocity sign** (`PointDirPoint(point(0,0), vect)`), so during the ~3-tick glide after key release collisions are still resolved in the glide direction.
- Rooms are re-composited (`refreshImage`) on every entry and `objects`-layer actors are only spawned on first entry (`pBeenActivated`), otherwise `restoreState` (out of scope).
- `objMoveXY.stallUpdate` and `pStallCount` (`objMoveXY.txt:365-380`) only feed the "stalled" flag used by AI/reel logic, not walking.

## Open questions

- Numeric values of the globals `gGameSpeed`, `gPlayerLayer`, `gGameObjectLayer`, `gMapLayer`, `gMapBoundaryLayer`, `gMapBoundary`, `gExitArrows`, `gBounceyWalls`, `gStageSize`: defined in a movie script or the score, not in the exported casts (assume `gGameSpeed = 1`, `gBounceyWalls = false`).
- The pixel location of the room on the 640x320 stage (`dd_map_*` mark sprite loc in the game-screen score frame) and the HUD sprite positions.
- The Director movie tempo. `frameTimer` enforces a 30 fps ceiling but if the movie tempo is lower than 30 the effective tick rate is the tempo.
- Registration points of the `anm_mer_*` bitmaps (they determine the exact collision rect; assumed centred so the rect is `rect(-15,-15,15,15)`), and whether the reg point is the sprite centre or the feet.
- Whether a `#stand` strip exists for `mer`: `../gfx/merlin` has no `anm_mer_stand_*` file, but `animStripMaster.seperateMembers` allows one cast member to carry several space-separated names, so the standing frame may be an alias of a walk frame inside the cast. If it is truly missing, `symExistsOrDefault` would index `pStrips[#stand]` = void and error, so an alias must exist.
- `objMoveXY.initGameChar` sets `setAutoUpdate(false)`, yet it must be updated every tick; the registration path appears to be `unpaws` (unconditional `addPrg`). Worth confirming the exact tick order between the character's own `update` and `objMoveXY.update` if frame-exact reproduction matters.
- Exact semantics of `keyPressed(256)` for `#left` in `bnd_wasd` (expected to map to the A key).
- Ink 36 assumed to be Director's "Background Transparent" (white -> transparent) for both tiles and sprites; confirm against the actual tileset bitmaps' background colour.
- The Active key has 261 entries and Objects 228 versus the 10-per-row comments (23 and 21 labelled rows); trailing entries are blank lines, so the sheets are at least 27 and 23 rows tall respectively -- confirm from the bitmaps.

## Prototype assumptions (walk-and-rooms slice)

- Frames drawn at native size (16 px, half a tile; confirmed visually against the original by the user); collision rect from modCollisionRect's formula is (-7,-7,7,7).
- Play area at (32, 0) on a 640x320 logical screen.
- `stand` aliases the first `walk` frame.
- Exits always open (no enemies yet).
- Both archive copies of mr4Demo.txt are corrupt and were dropped.
- Tile key slot counts: merlinOpenActive 261, merlinOpenObjects 228, merlinOpenPassive 58; merlin4Passive has 66 slots but mriv_small references index 91, so the converter pads.

## Continuous world (remake feature, not in the original)

`?camera=follow` creates the sim with `worldMode: 'continuous'` (`createSim`, `src/sim/tick.ts`);
`?camera=room` (the default) keeps `'rooms'`, the original behaviour above, unchanged.

- **Switching live** (the C key): `switchWorldMode` (`src/sim/world-mode.ts`) turns the current
  state into the other mode between ticks, without RNG draws; `main.ts` switches the camera with it
  and writes `camera` into the URL (`history.replaceState`). Rooms -> continuous: the current
  room's actors stay as they are; visited rooms' stored units rejoin the live list and never-visited
  rooms spawn (each room spawns once, whatever the toggles); those units are awake only within
  `wakeDistance`, and the ones put to sleep stand on their stand strip as below. The exits stop
  gating; graves stay in their rooms. Continuous -> rooms: the room Merlin stands in becomes the
  current room and keeps its actors (all awake); living units elsewhere are stored in the room
  their position is in (marked spawned); dying units, bullets and spells elsewhere are dropped (as
  a room change drops them); the exits and nav mode are evaluated as on entering the room, so a
  room with a hostile closes.

- **Spawning**: every room's objects layer is spawned at map start (`spawnAllRooms`); there is no
  room store/restore and no room change for actors. `s.room` is the room Merlin stands in; it only
  picks the music (a music tile plays on entering its room, as on room activation) and where graves
  are stored (each grave in its own room; the renderer draws all of them).
- **Movement**: no exits and no exit gating; Merlin and every character are kept inside the map
  rect instead of the room rect (tiles outside the map are solid anyway). No `exitsOpened` event and
  no room-cleared sound.
- **Activation** (`src/sim/activation.ts`): each non-player unit (character or dwelling) is awake or
  asleep, by the reg point to reg point distance to Merlin. Asleep: closer than `wakeDistance`
  (192 px, 6 tiles) wakes it; awake: `sleepDistance` (256 px, 8 tiles) or farther puts it to sleep
  (hysteresis). A hit wakes it; a hit taken at `sleepDistance` or farther also holds it awake for
  `hitWakeTicks` (180, 6 s), then the distance rule applies again. A unit falls asleep only while
  walking or standing (a reel, death, attack or charge plays out first); it then stops, returns to
  its stand strip and its AI to `#findTarget`, and a spell it was still charging is removed. It is
  also settled for drawing (`prevPos = pos`, on this path and on a world-mode switch), since the
  tick no longer moves it and the renderer would otherwise keep interpolating between two old
  positions (sleepers jittered after the C key). At map
  start every unit beyond `wakeDistance` starts asleep. Bullets and spells always update.
- **Elliptical ranges** (owner request): every activation distance is `activationDistance`,
  `hypot(dx, dy / activationVerticalScale)`, so each range reaches its full length sideways and
  `activationVerticalScale` (0.75) of it up and down: `wakeDistance` 192 px sideways, 144 px
  vertically. It applies to waking, falling asleep, the far-hit hold and, for consistency, the
  nav-mode clear radius.
- **Asleep** means no AI, no movement, no attacks, no dwelling production, no cooldowns or
  regeneration. The AI does not see sleepers (they are not targeting candidates), but they are
  hittable: explosions catch them, a bullet whose target fell asleep can still hit it, and Merlin's
  nearest-hostile shot (Space) aims at them. For speed the tick does not copy sleepers at all
  (`Tick.sleepers`, brought into the tick when hit), and the renderer loops their stand strip from
  the tick (`sleepingFrame`). very_big_map (15x15 rooms, 1875 actors) steps in about 0.17 ms per tick
  on average this way (about 1.9 ms when every actor was copied and scanned each tick).
- **Team caps**: the team member and reservation counts that gate dwelling releases and summons
  (reservationsMaster, counted per room in the original) count awake units only, so the rest of the
  map does not fill a team's cap.
- **Space aims on screen** (owner request): Merlin's nearest-enemy shot and the F push-back shot
  only consider hostile units whose position lies inside the play view the follow camera shows
  (`viewRect`, `src/sim/view.ts`: the renderer's `cameraOrigin` around Merlin's position, clamped to
  the map, with the view size from `SimConfig.view`, 576x288). With none on screen the shot flies
  straight ahead, as with no hostile at all. In rooms mode the room is the view and nothing changes.
- **Nav mode** is on while no awake, living hostile unit is within `navModeClearRadius` (256 px
  sideways, 192 px vertically) of Merlin, re-evaluated every tick.
- The four distances and times and `activationVerticalScale` are remake fields of the player's ActorDef (`src/mr-open/mr-actor-data.ts`),
  tunable in `assets/tuning.json` under `player`. They live on the ActorDef rather than a separate
  sim config so they follow the project's one tuning path (defaults in actor data, overrides in
  tuning.json).
