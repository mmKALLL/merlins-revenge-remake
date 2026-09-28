# Open items

Mirror of the owner's KanbanFlow board (which cloud sessions cannot reach), as of 2026-09-27.
Update this file when an item is done or added. Rules for how to work: `CLAUDE.md`.

## To do

- **Merlin's other spells.** The original's player spells beyond the energy blast: energy pulse,
  energy mines, army summon, cBlast, heal blast, arctic/freeze/thunder blasts, laser/energy beam
  (`act_*Spell` and scroll data). Needs weapon selection (the original `weaponSelector` palette and
  the spell1..9 keys), spell scroll pickups, and per-spell mechanics. Many mechanics (summons,
  heals, exploding bullets, multi-attacks) are already ported for enemies
  (`docs/notes/engine-mechanics-enemies-3.md`), so much may be data plus player wiring.

## Backlog

- **Level ups.** `modExperience` (experienceImWorth, `#lastAttacker`), experience stars
  (`modStarReleaser`, `objStar`, `starMaster`), the `*IncLevel` fields, the `level_up` sound, an
  experience bar.
- **Potions.** `potionMaster`, `objPotion`, the manaBurst / manaCapacity / manaFlow / walkSpeed
  potions, medikits (`medikitMaster`). When done, remove the stand-in `player.mana_capacity` /
  `mana_flow` values in `assets/tuning.json` (they mimic 4 Max Blast + 4 Quick Charge potions).
- **Cutscenes.** `cutSceneMaster`, `objScriptPerformer`, the archive's `cut_scenes/*.txt` and
  in-game scenes (`scr_stones*`), title/credits/ending music. A minimal script player exists for the
  map-complete sequence (`src/cutscene/`); what a full system needs is in
  `docs/notes/engine-mechanics-map-complete.md` §3.
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

- The 11 decisions at the top of `docs/plans/2026-09-27-enemies-progress.md`.
- Title screen and in-game menu (`docs/plans/2026-09-28-menus-design.md`), mainly for phones. The
  original menu's choose keys, save/load and show army are left out until those features exist.

## Reference material for sessions without the original archive

The owner can attach `mr-open-reference.zip` (Lingo source, maps, and every `anm_*` cast bitmap,
re-extracted 2026-09-27 with the fixed palette/32-bit decoding). Unzip its `mr-open-reference/`
folder as the archive root; see `docs/plans/2026-09-27-enemies-handoff.md`.
