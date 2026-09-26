# Design: walk-and-rooms vertical slice

Date: 2026-09-26
Status: approved

## Goal

Port the open-sourced "Merlin Open" Director engine (Merlin's Revenge 3/4) to TypeScript. The first milestone proves the approach with the smallest playable slice: load an original map file, render its tile layers, move Merlin with the original movement and collision rules, and move between rooms. Combat, AI and teams follow in later slices.

The port must keep the door open for four modernizations: display rates above 30 Hz via interpolation, continuous room scrolling with enemy leash ranges, variable room and screen sizes, and integer display zoom.

Engine behaviour is documented in `docs/notes/engine-mechanics-walking-and-rooms.md`, which cites the Lingo source line by line.

## Approach

Ported rules on a fresh core. The simulation is a fixed 30 Hz step over world coordinates, with the map treated as one global tile grid where rooms are an 18x9 partition. Behaviour lifted from Lingo lives as pure functions in `src/mr-open`, named after the Lingo objects they came from. Rendering is a separate layer with a camera, integer zoom and tick interpolation.

Alternatives considered: an object-for-object port (highest traceability, but bakes in per-room compositing and hard cuts) and a from-scratch fangame (fastest, but discards the original map and data formats).

## Stack

- Vite, TypeScript with strict settings, pnpm.
- PixiJS for rendering, nearest-neighbour filtering, integer scaling.
- Vitest for unit tests.
- Node scripts under `tools/` for asset conversion.

## Project layout

```
assets/                 originals copied from the archive, reorganized (committed)
  maps/                 selected map .txt files (tvsDemo plus a few from maps/works)
  tile-keys/            tlk_merlinOpen*_key.txt
  sprites/merlin/       anm_mer_*.bmp frames
  keybindings/          bnd_wasd.txt, bnd_arrow.txt
  tilesets/             real sheets once extracted from the .dir (see Risks)
public/generated/       converter output: JSON maps, atlases, PNG sheets (git-ignored)
src/
  mr-open/              direct ports, one file per Lingo object, each citing its source
    mr-lingo-plist.ts   Lingo property-list parser (XMLmaster.interpretXML equivalent)
    mr-map-format.ts    map definition to typed structure (objMap, objDataMap)
    mr-tile-key.ts      tile key text to per-index symbols (objTileSetKey)
    mr-movement.ts      acceleration, friction, clamp (modMoveToLoc, objMoveXY)
    mr-collision.ts     edge merging, four-corner test, push-out (objCollisionMap, objCollisionTile)
    mr-room-exit.ts     play-rect exit test and wrap-around (collisionMaster, objPlayerMerlinCharacter)
  sim/                  fixed-step simulation, game state types, tick function, world grid
  render/               PixiJS app, camera, zoom, interpolation, debug overlay
  input/                keyboard and mouse to an input snapshot per tick
  data/                 loaders for public/generated
  main.ts
tools/
  copy-assets.ts        documents and performs the copy from the archive into assets/
  convert-assets.ts     assets/ to public/generated/
docs/notes/, docs/plans/
```

Rule: nothing under `src/` or `tools/convert-assets.ts` reads from `assets-mr-original/`. Only `tools/copy-assets.ts` knows about the archive, and it records which files each feature needs.

## Data pipeline

- Map files are Lingo property lists. The converter parses them to JSON: map size in rooms, room size in tiles, start room, layer definitions, and per-room per-layer tile arrays (row-major, 1-based indices, 0 means empty).
- Tile keys become per-index arrays of symbols. Only the `backgroundActive` layer collides, using `#solid` versus `#none`. The `objects` layer is never drawn; it spawns actors (only `#player` matters in this slice).
- Merlin's BMP frames are packed into one PNG sheet plus a JSON atlas keyed by animation name, frame order and per-frame delay taken from the filename convention `anm_<chr>_<anim>_<delay>_<frame>`.
- Tile sheets: the real `tlk_merlinOpenPassive/Active/Objects` bitmaps exist only inside the Director binary. Until extracted, the converter generates a placeholder sheet from the key files (distinct colours for solid and open, index printed on each tile), 10 tiles per row, 32x32.

## Simulation

State is plain data: player position and velocity as floats, facing (horizontal flip only), animation name and frame counter, current room, previous-tick position, and the world tile grid.

Each 30 Hz tick, in this order, reproducing the original:

1. Sample input into an 8-direction vector (components -1, 0, 1), no diagonal normalization.
2. Add acceleration 2 per axis in the input direction.
3. Apply friction: velocity loses 50% per axis.
4. Clamp velocity to plus or minus 31 px.
5. Resolve collision of the 30x30 rect around the registration point against the four tiles under its corners, testing only edges facing the velocity, pushing out along the axis with the smaller overlap (sliding), both axes at an exact convex corner. Horizontal wall hits zero horizontal velocity.
6. Exit test on the registration point against the current room rect. If it leaves and the exit is open, the current room changes; in world coordinates the position is already correct, so no wrap arithmetic is needed. Map edges stay solid.
7. Animation: `walk` while a movement key is held this tick, else `stand`; each walk frame lasts its delay in ticks.

Exit gating is a hook that always returns open in this slice. The leash and "enemies dead" rules plug in later.

## Input

Per tick the input layer produces a snapshot: movement vector, mouse position in world coordinates, and action buttons. Bindings reserved now, acted on in later slices:

- WASD and arrow keys: move.
- Mouse: target position.
- Space: charge a spell while held, release to shoot at the mouse position.
- E: shoot at the nearest enemy's current position.
- F: shoot 16 px in front of the nearest enemy, to push them back.

## Rendering and camera

- Logical resolution defaults to 640x320 (room area 576x288 plus HUD space), configurable in tiles. Integer zoom chosen from the window size.
- Tile layers render from the world grid through a tilemap container, culled to the camera.
- Camera modes from config: `room` snaps to the room containing Merlin (matches the original hard cut); `follow` scrolls continuously.
- The render loop runs on requestAnimationFrame. Sprites draw at a position interpolated between the previous and current tick; the sprite frame is the current tick's.
- Debug overlay: tick rate, position, room, collision rect toggle.

## Error handling

Malformed maps and keys fail at conversion time with the file and offset. Runtime loaders validate shapes once on load and throw with the asset name. Missing animation strips fall back to `stand`, as in the original.

## Testing

- Vitest unit tests for every file in `src/mr-open`, with expectations drawn from the engine notes: steady-state speed 2 px per tick, halving on release, diagonal 2.83, sliding along a wall, stopping at a convex corner, room exit detection.
- Map parser tested against tvsDemo and two maps from `maps/works`.
- Tile key parser tested against the three merlinOpen keys.

## Risks and open questions

- Real tile sheets need extraction from the .dir. Spike a Python Director cast extractor in parallel; the slice proceeds on placeholders.
- Room pixel origin on the stage and Merlin's bitmap registration points are only in the binary; assume a 32 px side margin and centred registration until verified.
- No `stand` strip file exists for Merlin; assume the first walk frame until the cast alias is confirmed.

## Out of scope for this slice

Combat, spells, enemies, teams, HUD bars, sound, menus, cut scenes, saving, minimap.
