# Friendly wizards, slice 1 (allies): implementation plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** The eight friendly wizards of Merlin Open as Merlin's allies. They appear on the original
maps and fight beside him, then join his reserve. R calls every reserve wizard together with the
army, and a roguelite floor reward can bring one.

**Architecture:** Wizards are ordinary data: CPU spell casters on team aldevar. Copying their
actor files and sprites makes the original maps' wizard tiles resolve. The existing
`leaveWhenFinished` teleport already puts a wizard into the reserve (`t.army`). The R key's
summon and send-back learn about `#wizard` actors (a new `ActorDef.wizard` flag), and wizards
bypass the team cap. The roguelite reward lays the wizard out in the start room like a pickup;
since the start room's fight is over, it teleports into the reserve.

**Tech Stack:** TypeScript, Vitest, pnpm. Data lives in `assets/` and is converted by
`pnpm assets:convert`.

Design: `docs/plans/2026-11-05-friendly-wizards-design.md`. Rules: `CLAUDE.md`.

Run every command with this shell prefix:
`export PATH="$HOME/.nvm/versions/node/v22.17.1/bin:$HOME/Library/pnpm:$PATH" && set -o pipefail`.
Work on the branch `friendly-wizards`.

---

### Task 1: Copy the wizard actors, AI spells and sprites

**Files:**
- Modify: `tools/copy-assets.ts` (the `spellActors` list, the in-game wizard loop at about line 185,
  and `castSprites`)

**Steps:**
1. Add a list of the eight wizards. Its keys are the actor names; each sprite name is the actor's
   `#name`:

   ```ts
   // The friendly wizards (docs/plans/2026-11-05-friendly-wizards-design.md): Merlin's allies on
   // the original maps, CPU spell casters of team aldevar; actor key -> sprite name (#name)
   const FRIENDLY_WIZARDS: Record<string, string> = {
     amotonlinInGame: 'amo', berlinInGame: 'ber', flaetorlinInGame: 'flaeto', foelinInGame: 'foe',
     garonlinInGame: 'garo', prestotolinInGame: 'presto', ulinInGame: 'uli', verdanlinInGame: 'verdan',
   }
   ```

2. Copy each `act_<key>.txt` to `assets/actors/<key>.txt`, with the reason "actor: friendly wizard".
3. Add `'cBlastAi', 'monsterSummonAi'` to `spellActors`. These are the AI variants that Flaetorlin
   and Foelin cast.
4. Add the sprite names to `castSprites`. Berlin's frames are named irregularly
   (`anm_ber_walk_01` with no direction, plus `mosh`/`rock`/`strum` strips). Check what the
   sprite conversion makes of them in `pnpm assets:convert` output. If they fail, stop and report
   instead of improvising.
5. Run `pnpm assets:copy`, then `pnpm assets:convert`.
6. Restore the files `assets:copy` is known to rewrite: title PNG re-encodes, the invasion
   regpoints' "raw" tag, and the dropped iceBoulder regpoints. Use `git diff --stat`, then
   `git show HEAD:<file> > <file>` for each. Keep only the new wizard and AI-spell files.
7. Check that the `.txt` files in `assets/actors/` and the sprite folders exist for all eight. Then
   load `?map=works/mriiidemoii` in the sim, or a quick tsx script with `createSim`, and confirm
   an `ulinInGame` actor is created.
8. Commit: "Friendly wizards: copy the eight wizard actors, their sprites and the AI spells".

### Task 2: The `wizard` ActorDef field

**Files:**
- Modify: `src/mr-open/mr-actor-data.ts`. Add the field next to `leaveWhenFinished` (about line
  221), with default `false` (about line 382), and add it to the field list at about line 432.
- Modify: the hand-built test defs that list every field. Find them with
  `grep -rn "leaveWhenFinished: false" src --include=*.test.ts`.

**Steps:**
1. Add the field `wizard: boolean // objGameObject #wizard: a friendly wizard (wizardMaster.newWizardFound; R calls every one in the reserve, remake)`.
   Parse it from `#wizard` the way the other booleans are parsed.
2. Write a test in the actor-data tests that `#wizard: true` parses to `wizard: true`, and that
   the default is `false`.
3. Run `pnpm test src/mr-open` and `pnpm tsc --noEmit`. Expected: PASS.
4. Commit.

### Task 3: R calls and sends home every wizard

**Files:**
- Modify: `src/sim/tick-army.ts` (`stepArmyKey`, `armyMembersInPlay`, `summonWholeReserve`,
  `armyKeyAction`)
- Test: `src/sim/army-key.test.ts` (follow its existing setup helpers)

**Rules** (remake decision; record it in `docs/notes/engine-mechanics-spells.md`, Remake decisions):
- "In play" for R also counts Merlin's living teleportable wizards on his team (any def with
  `wizard`).
- Summon: after the army units, every wizard type in the reserve comes out, all of its units, at
  the same jittered spot. Wizards are not part of `autoSummonTypes` and leave `teamSlotsFree` alone.
- Send back: when the fight is over, wizards teleport out with the army.
- `armyKeyAction` returns `'summon'` when only wizards wait in the reserve.

**Steps:**
1. Write the failing tests:
   - With a `berlinInGame` in the reserve, R summons it.
   - With the team cap already full of army units, R still summons the wizard.
   - With a wizard in play after the fight, R teleports it out.
   - With only a wizard waiting, `armyKeyAction` is `'summon'`.
   - A wizard killed in play is not back in the reserve.

   Use a small wizard def built like the existing test defs, with `wizard: true`,
   `leaveWhenFinished: true` and team aldevar.
2. Run `pnpm test src/sim/army-key.test.ts`. Expected: FAIL.
3. Implement:
   - A helper `isWizardOf(t, p, a)`.
   - Have `armyMembersInPlay` also accept wizards. Rename it if the name stops fitting, e.g.
     `alliesRCalls`; `nearestAllyOnScreen` uses it too, so a blank army summon can send a wizard
     home, as in the original.
   - Add `summonReserveWizards(t, p, at)`, called from `stepArmyKey` after `summonWholeReserve`.
     Order the wizard types by key, so the order is deterministic.
   - In `summonWholeReserve`, the early `return` on a solid tile must not skip the wizards. Make
     the wizards' own placement check the tile per unit.
   - `armyKeyAction`: count wizards in the reserve and in play.
4. Run the tests again. Expected: PASS.
5. Update the comments at the head of `tick-army.ts` and above `stepArmyKey`. Update the help
   panel line in `src/ui/help-panel.ts`: R becomes "call or send home your army and wizards".
6. Commit.

### Task 4: Wizards first in the reserve army display

**Files:**
- Modify: `src/render/army-entries.ts` (`armyDisplayEntries`) and its caller in
  `src/render/army-display.ts`
- Test: the `army-entries` test file next to it (create `src/render/army-entries.test.ts` if there
  is none)

**Steps:**
1. Write the failing test: a reserve holding `{ warrior: 2, berlinInGame: 1, ulinInGame: 1 }`, with
   the wizard keys passed in, lists `berlinInGame` and `ulinInGame` first, then `warrior`.
2. Implement: give `armyDisplayEntries` a third parameter `wizards: readonly string[]`, the sorted
   wizard keys from the defs, placed before `order`. The caller passes the wizard def keys.
3. Check that the wizard's stand frame draws the way the other types' do, using the display's
   existing `stand` lookup. Look at `?map=works/mriiidemoii` after Ulin teleports out. Take a
   screenshot only if the code alone can't settle the frame choice.
4. Run `pnpm test`, then commit.

### Task 5: The roguelite wizard reward

**Files:**
- Modify: `src/run/rewards.ts` (`RewardOption`, `rollRewards`, `rewardPickups`)
- Modify: `src/gen/themes.ts` (`MERLIN_OPEN_OBJECTS`). Add the wizard tiles from
  `assets/tile-keys/merlinOpenObjects.txt` row 1: berlinInGame 3, ulinInGame 4,
  prestotolinInGame 5, garonlinInGame 6, amotonlinInGame 7, foelinInGame 8,
  flaetorlinInGame 9, verdanlinInGame 10. Check them against the key file: `#none` is tile 1.
- Modify: `src/main.ts` (where `rollRewards` gets `holdsScroll`), `src/ui/floor-pick.ts` (the
  reward card), `src/ui/run-summary.ts` (list the wizards)
- Modify: `src/sim/rewards.ts` (a `hasWizard(s, key)`: in the reserve or in play)
- Test: `src/run/rewards.test.ts`

**Rules:**
- `{ kind: 'wizard'; wizard: string }` takes the spell option's place, as the reserved weapons do.
- It is drawn from the wizards Merlin does not have, at weight `WIZARD_REWARD_WEIGHT` (a named
  constant). Start at the reserved weapons' weight, `ORIGINAL_SPELL_WEIGHT`, shared over all
  eight wizards, so one wizard is about as likely as one reserved weapon.
- It is laid out as the wizard actor itself, in the start room's pickup row. The start room's
  fight is over, so `leaveIfFinished` teleports the wizard into the reserve at once. Confirm
  that happens; if the start room isn't counted as cleared, add the wizard straight to `t.army`
  on arrival, the way `startingArmy` is added.
- The run summary shows a "Wizards" row (stand frames) when the run found any.

**Steps:**
1. Write the failing tests in `rewards.test.ts`:
   - Across many seeds, `rollRewards` sometimes offers a wizard, never one Merlin has, and never
     when he has all eight.
   - `rewardPickups` of a wizard reward is `[wizardKey]`.
2. Implement `rewards.ts`, then thread `hasWizard` through `main.ts` alongside `holdsScroll`.
3. On the pick screen card, show the wizard's stand frame and name. Give the names a small map
   in `floor-pick.ts`: Amotonlin, Berlin, and so on.
4. Run `pnpm test`, `pnpm tsc --noEmit`, then commit.

### Task 6: Test map, docs, board

**Files:**
- Modify: `tools/make-enemies-test-map.mjs`. Add a wizard room, e.g. `roomAt(3,2)` with Berlin,
  Ulin, Foelin and Flaetorlin beside a few goblins. Their tiles come from the merlinOpenObjects
  key, so check which tileset the generator's objects layer uses. Regenerate
  `assets/maps/test_maps/enemies_test.txt`.
- Modify: `docs/notes/engine-mechanics-spells.md`. Under Remake decisions, add "R calls every
  wizard". Also add a short "Friendly wizards" section: how the original works (the design doc's
  first section, with the Lingo references), what the port does, and what is left out (the
  selector key, the wizard bar `prg_wizardmaster`).
- Modify: `docs/plans/open-items.md`. Move the wizards to Awaiting the owner's review (slice 1),
  and keep "enemy wizards (slice 2)" under Medium.

**Steps:**
1. Do the map, then the docs.
2. Run `pnpm test && pnpm tsc --noEmit && pnpm build`. Expected: all pass.
3. Commit. Then fast-forward merge into `main` if the owner has no uncommitted changes, and push.
4. Board: comment on the card "Es - The eight friendly wizards, as allies and as enemies" that
   slice 1 is done and slice 2 is left. It stays in Medium.

## Agent rules (if delegated)

Stop and report on tooling trouble (Chrome, dev server, asset copy surprises) instead of working
around it. Run headless Chrome only with `--mute-audio`. Take screenshots only when needed.
Never touch `.env`, and never commit `assets-mr-original/`.
