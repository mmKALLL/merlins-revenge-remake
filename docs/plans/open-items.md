# Open items

Mirror of the owner's KanbanFlow board (which cloud sessions cannot reach), as of 2026-09-27.
Update this file when an item is done or added. Rules for how to work: `CLAUDE.md`.

## To do

- **Golden machine gun (pending reward).** `act_gmg` (an objScroll: `gmgOn` swaps the spell's
  charge for the `gmg*` fields and auto-fires). Once ported, the Magic Maze (floor 4) also gives it
  at the start: set `MAZE_GIVES_GOLDEN_MACHINE_GUN` in `src/gen/themes.ts` (the `gmg` tile is
  merlinOpenObjects 38).

## Backlog

- **Roguelite floors.** Four random 3x3 floors exist, one per sketch floor
  (`?map=randomly_generated/1-goblin-forest`, `2-undead-marsh`, `3-dragon-canyon`, `4-magic-maze`), and the
  four stacked into the tower (`randomly_generated/sorcerers-tower`; `src/gen/`,
  `docs/plans/2026-09-28-random-floor-design.md`, with the enemy substitutions). Two potions wait in each floor's side corner rooms; each start room gives 3 potions, a medikit
  and a spell scroll. Next: MR3 wizards and the
  Black Sorcerer once ported, snapshots of generated floors.
- **Level ups.** `modExperience` (experienceImWorth, `#lastAttacker`), experience stars
  (`modStarReleaser`, `objStar`, `starMaster`), the `*IncLevel` fields, the `level_up` sound, an
  experience bar.
- **Potions: what is left.** Ported (`docs/notes/engine-mechanics-potions.md`): the four potions,
  medikit, maxikit, pickup, writing fade, temporary invincibility and the HUD. Open: wire in the real
  `maxikit_potion` / `maxikit_writing` members (gfx cast members 679/680, dumpable with
  `tools/director-extract/dump_bitmaps.py maxikit_`; stand-ins now: the objects tile and the
  medikit's writing), `pulseWhite` (Merlin's alpha pulses instead), save/load of the pickups.
- **Cutscenes.** `cutSceneMaster`, `objScriptPerformer`, the archive's `cut_scenes/*.txt` and
  in-game scenes (`scr_stones*`), title/credits/ending music. A minimal script player exists for the
  map-complete sequence (`src/cutscene/`); what a full system needs is in
  `docs/notes/engine-mechanics-map-complete.md` §3.
- **Scoring mode.** Each room counts down from 9999 points to 0 over 200 seconds. The map's total is
  shown bottom right, with the current room's points as a green `+1234` about 8 px to its right.
  The map selector shows the top score for each map.
- **Save and load the state of a map.** Original: `saveMaster` (save/load menu options,
  `addSaveData`/`restoreFromSave` on every object). Builds on the snapshot code in `src/debug/`.

## Player feedback

- **Bug (fixed, owner to confirm):** an enemy froze in place, unhittable and without a grave.
  Fixed paths: a reel-proof unit (tower, plant, skeleton head) killed mid-attack went back to
  `#walk` out of energy; units restored mid-attack by the C key slept on their attack strip; a
  dying unit could be dropped or left unstepped (now always stepped and stored with its room).
  Fuzzing goblin maps in the continuous world with K and blasts timed at sleep transitions found no
  goblin freeze; if it recurs, ask for an `mr.exportState()` paste.
- **Low priority:** call "energy" "health" in the UI and code, if not too entangled with the
  engine's naming.

## Awaiting the owner's review

- Merlin's spells (`docs/notes/engine-mechanics-spells.md`, Remake decisions; test map
  `?map=spells_test`): every scroll but the golden machine gun gives its weapon; Q opens the
  original's weapon palettes, 1-9 pick the n-th spell, E/click/Space charge a spell or swing a melee
  weapon. To confirm: the army summon's starting army (2 warriors, 2 archers, a monk, a dwarf; in
  `assets/tuning.json`), the current weapon icon in the top strip (the original only shows the Q
  palette), the touch weapon button (steps to the next weapon), a hit ending Merlin's swing, the
  teal freeze glow's look. Faithful but maybe surprising: energy mines need a full charge (1 mine at
  the start), the monster summon only reaches its archer stage until Merlin drinks Max Blast
  potions, summoned allies teleport back into the reserve as soon as the room is clear, and frosty
  monks now freeze Merlin.
- R and M (2026-10, owner request): R summons the whole reserve army at the mouse
  (modAutoSummon, the original's C key; at most 2 of each type with Merlin's 12-member team cap),
  and sends the whole army back into the reserve while any of it is out; M gives one medikit (as
  collecting one: +25 energy and invincibility too) instead of the full heal. R has no touch
  control yet (would need a third button).

- The 11 decisions at the top of `docs/plans/2026-09-27-enemies-progress.md`.
- Title screen and in-game menu (`docs/plans/2026-09-28-menus-design.md`), mainly for phones. The
  original menu's choose keys, save/load and show army are left out until those features exist.

- Mini-map (`modMiniMap`, `docs/notes/engine-mechanics-minimap.md`): ported as in the original
  (all rooms shown from the start, only in nav mode, fading near Merlin or the mouse). Remake
  decisions to confirm: the follow camera's sliding view marker over live room statuses, the N key
  to hide it, shrinking to scale 1 for maps too tall for the view (none so far).

## Reference material for sessions without the original archive

The owner can attach `mr-open-reference.zip` (Lingo source, maps, and every `anm_*` cast bitmap,
re-extracted 2026-09-27 with the fixed palette/32-bit decoding). Unzip its `mr-open-reference/`
folder as the archive root; see `docs/plans/2026-09-27-enemies-handoff.md`.
