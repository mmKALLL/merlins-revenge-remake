# Open items

Mirror of the owner's KanbanFlow board (which cloud sessions cannot reach), as of 2026-10-24.
Update this file when an item is done or added. Rules for how to work: `CLAUDE.md`.

## Board priorities (owner, 2026-10-24)

Work top down; the sections below hold the details.

- **High priority:** (done 2026-10-25: one music track per biome on every random map.)
- **Medium priority:**
  - The victory jingle does not play on winning a map if music was already playing.
  - Projectile volley spells (done on branch `volley-spells`, awaiting review; see below).
  - Less reel on Merlin: the same knockback, but more friction when he walks against his current
    movement vector.
  - Scoring mode.
  - Golden machine gun (see To do below).
  - The eight friendly wizards, as allies and as enemies.
  - **A proper roguelite mode**, selectable from the main menu or `randomly_generated/tower-roguelite`:
    - **Floor rewards:** at the very start and at each floor start, the player picks one of three:
      a new random spell; a full heal plus one medikit; or 4-5 random potions split randomly
      between two types. Keyboard or touch/click, each option previewing its contents, selectable
      only after 0.8 s to prevent misclicks. A wizard ally in lieu of a spell is an idea; run any
      other reward types past the owner.
    - **Alternative biomes:** 2-3 per floor with different enemy groups, e.g. deep forest; cave or
      hydra marsh; fortress or golem mountain; golden palace.
    - **Location sign:** the place's name in the entry room, not blocking exits.
    - **Safe arrival:** no enemies within 3 tiles (taxicab) of Merlin's arrival.
    - **Statistics:** win ratio, floors reached and win streak, kept in localStorage. Abandoned runs
      reset the streak but don't count towards the ratio or distribution.
    - Hades-like gameplay ideas are welcome.
- **Backlog:** level ups, save and load, check Ochre's pulse aim.
- **Low priority:** the energy -> health rename, random midbosses and bosses, Steve's lock-up, cutscenes,
  "army might be OP".

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
  and a spell scroll. Rooms follow a per-theme room plan with enemy tiers (owner to review the tier lists and counts). The maze's walls are
  autotiled castle towers and wall faces. A fifth floor outside the tower, `5-golden-fort` (golden
  palace look, every theme's enemies in peaceful team alliances, rooms to an HP budget of 1500-2000,
  a start room of 10 potions, 2 medikits and a scroll), awaits the owner's review. The maze's midboss and boss rooms share wizard-led groups (Scarlet, Ochre; one list, more minions at the exit). Next: MR3 wizards
  and the Black Sorcerer once ported, snapshots of generated floors.
- **Level ups.** `modExperience` (experienceImWorth, `#lastAttacker`), experience stars
  (`modStarReleaser`, `objStar`, `starMaster`), the `*IncLevel` fields, the `level_up` sound, an
  experience bar.
- **Potions: what is left.** Ported (`docs/notes/engine-mechanics-potions.md`): the four potions,
  medikit, maxikit, pickup, writing fade, temporary invincibility and the HUD. Open: wire in the real
  `maxikit_potion` / `maxikit_writing` members (gfx cast members 679/680, dumpable with
  `tools/director-extract/dump_bitmaps.py maxikit_`; stand-ins now: the objects tile and the
  medikit's writing) save/load of the pickups.
- **Cutscenes.** `cutSceneMaster`, `objScriptPerformer`, the archive's `cut_scenes/*.txt` and
  in-game scenes (`scr_stones*`), title/credits/ending music. A minimal script player exists for the
  map-complete sequence (`src/cutscene/`); what a full system needs is in
  `docs/notes/engine-mechanics-map-complete.md` §3.
- **Enemy-only spell scrolls for Merlin.** Dark blast, goblin / Scarlet / skeleton / undead summon:
  the mechanics work (enemies cast them), so it is mostly data.
- **The eight friendly wizards.** Amotonlin, Berlin, Flaetorlin, Foelin, Garonlin, Prestotolin,
  Ulin, Verdanlin (`act_*InGame`, team aldevar, 200 HP, sprites in the cast dump; each casts one of
  Merlin's ported spells): as allies (wizardMaster / modSummonWizard, tower rewards) and as enemies
  (a palette swap at convert time, boss-level HP).
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
- **Wizard allies and the army list.** Ulin, Prestotolin and Verdanlin (`act_*InGame`,
  `wizardMaster`, `modSummonWizard`) and the original's Show army menu (`showArmyMaster`: the reserve
  army as unit figures in rows and pages). Wizards are separate from the army in the original: found
  wizards are called in with their own key and selector and fight as AI spell casters. Not started.
- **Morph (MR2 spell).** Only its art is in the archive (scroll, writing, `gfx/morph` forms); no data or
  Lingo, so it would be a remake design; waiting for the owner's description of how it worked.
- **Low priority:** call "energy" "health" in the UI and code, if not too entangled with the
  engine's naming.

## Awaiting the owner's review

- Volley spells (`docs/notes/engine-mechanics-spells.md`, Volley spells; data in
  `assets/remake-actors/`; test map `?map=test_maps/spell_test`, the row below Merlin): all eight
  (with needle spray). To decide: the projectiles' damage (2.5x the enemy shot, every one), the
  charge per level (one rule from damage) and the capacity where the most projectiles are reached
  (20; thunder 24), the ranges, the themed floors, the scroll and writing art, the icons (groups of
  five), whether a volley should re-aim at the mouse as it fires (now it keeps the release aim).
- Merlin's spells (`docs/notes/engine-mechanics-spells.md`, Remake decisions; test map
  `?map=test_maps/spell_test`): every scroll but the golden machine gun gives its weapon; Q opens the
  original's weapon palettes, 1-9 pick the n-th spell, E/click/Space charge a spell or swing a melee
  weapon. To confirm: the army summon's starting army (2 warriors, 2 archers, a monk, a dwarf; in
  `assets/tuning.json`), the current weapon icon in the top strip (the original only shows the Q
  palette), the touch weapon button (steps to the next weapon), a hit ending Merlin's swing, the
  teal freeze glow's look. Faithful but maybe surprising: energy mines need a full charge (1 mine at
  the start), the monster summon only reaches its archer stage until Merlin drinks Max Blast
  potions, summoned allies teleport back into the reserve as soon as the room is clear, and frosty
  monks now freeze Merlin.
- R and M (2026-10, owner request): R summons the whole reserve army at the nearest enemy on
  screen, or the mouse in the mouse cursor Space mode (modAutoSummon, the original's C key; at most 2 of each type with Merlin's 12-member team cap),
  and sends the whole army back into the reserve while any of it is out once the fight is over
  (room clear / nav mode; mid-fight R does nothing); M gives one medikit (as collecting one: +25
  energy and invincibility too) instead of the full heal. Touch: a blue army button above the
  weapon button (below it in portrait) acts as R, at the nearest enemy, shown only while R would act
  (`armyKeyAction`). A blank army summon (below
  its first stage) flies at Merlin's nearest ally, sending one home.
- Mobile polish (2026-10-23, owner requests; to confirm on a phone): touch controls that cannot
  wedge (Steve's "controls locked up after a couple of screens", on Firefox on iOS 27 = WebKit,
  an iPhone 11, first test only; deprioritized, reopen if it recurs; not reproduced in headless
  Chrome: a new press takes the nub or blast button over, a lifted finger anywhere ends its press,
  no finger left releases all, no page zoom/scroll while playing); preloaded weapon icons; a
  NEAR / FAR target toggle beside the 176 px blast button (lighter fill) (new Space mode "farthest"); a
  loading screen with a percentage (generated maps build in slices); installable as an app
  (`public/manifest.webmanifest`, Merlin icons, no service worker).
- The dwarf tower (2026-10-22, owner requests): its axe hits every hostile within 50 px (reg point to
  reg point) of where it lands, as the original's splashDamageOn does, and leaves a crack (to
  confirm: the Lingo's push pulls toward the axe), it throws at a dead target's last spot, the dwarf builds 4x slower and leaves mid-build once
  the fight is over, and in the open world continues the nearest unfinished tower in range.

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
