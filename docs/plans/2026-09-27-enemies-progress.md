# Enemy slice: progress

Handoff: `docs/plans/2026-09-27-enemies-handoff.md`. Engine notes: `docs/notes/engine-mechanics-enemies-2.md`
(port status in §8). Branch: `claude/zealous-darwin-wtjy4c`.

## Decisions for the owner to review

Each one follows the engine's evident intent; the tunable ones can be changed in `assets/tuning.json`.

1. **Hut production time** = group size x build time (goblinHut 105-350 ticks per group). The Lingo
   multiplies the group-size *counter list* by the build time (`modResidents.txt` startProduction), so what
   the original really did is unknown. Tunable per dwelling: `productionTimeScale` (default 1; 0 releases
   as soon as the team cap allows).
2. **orcHouse stays on team `#goblins`** as in its data: it waits under the goblins' cap (16) and keeps
   exits shut as a goblin building; its orcs join `#orcs`. `"orcHouse": { "team": "orcs" }` in tuning
   would switch it to the orcs' cap (11).
3. **orcHouse's mageOrc group is dropped** (the converter warns) until mageOrc and its goblinSummon spell
   are ported; the house produces bow and sword orcs only.
4. **Dwelling level-ups** play `level_up` on every release (as the engine does) but nothing else: the
   -1 % max energy per level, experience stars and residents' random starting levels are not ported
   (experience is not ported at all).
5. **Mage dies while charging**: the half-charged spell disappears with it (the port's existing rule for
   Merlin; the engine path was not traced).
6. **Mage movement** uses a straight walk toward its goal (tiles still block it) rather than routing
   `moveToLoc` through modPathFinding's beeline/scenic modes. Its run goals lie far beyond the room
   anyway (`GeomMirrorPoint` x20), so in practice it slides along walls when cornered.
7. **Counters** for production and release intervals use the port's N-tick model (the engine's Lingo
   counters finish one tick earlier), as elsewhere in the port.
8. **Map-placed dwellings are prebuilt**, as in the engine; the builder-made `#beBuilt` path is not ported
   (its frames ship but are unused). Dwellings slide when hit (modReel, inertia 80) and stop at walls
   without wall damage (objGameObject's collision callbacks).
9. **Mages hit hard**: they cast the same energy blast as Merlin (charge 12.5, 20 px/tick, no friendly
   fire), about 20-25 damage per direct hit. Engine-faithful; say if it should be toned down
   (e.g. `"goblinMage": { "attack": { "chargeMaxBasic": 2 } }`).

## Done

- Converter: PNG frames with per-folder `regpoints.tsv`, per-frame delays; renderer hangs such frames from
  their reg point; collision and sprite rects use it; strip names are matched case-insensitively
  (`chargeWalk` / `chargewalk`).
- Data: `animFrame` lists (crossBow [2,4,6], orcSword [6,10,12]), per-actor `stallSpeed`, `teamRole`,
  `residentGroups`, `totalResidents`, team `maxMembers`.
- bowOrc, swordOrc, crossBow/crossBolt/orcSword and the orc team: data only.
- Goblin mage: `objAiCPUSpellCaster` (`src/sim/tick-caster.ts`, `src/mr-open/mr-spell-caster.ts`):
  charges while walking, releases at the target, re-targets after each cast, dodges hostile bullets and
  spells within 100 px, keeps 100 px from enemies, closes in to ~102 px.
- Dwellings: goblinHut, goblinMageHut, orcHouse (`src/sim/tick-dwelling.ts`, `src/mr-open/mr-residents.ts`):
  production cycle under the team cap, releases on the reg point, self-destruction, hits and reel, death
  sound and grave, exits stay shut while one lives, targetable by Merlin's Space shot, hit by the blast.
- Test content: `enemies_test` map (4 rooms). `mriv_small` now also spawns its original bow orcs, sword
  orcs and goblin huts (rooms 1, 2, 4).
- Tests: `src/sim/enemies.test.ts` (three bolts / three hits per strip, mage casting, kiting, no friendly
  fire, dwelling cycle, team cap, blast vs hut).

## Open

- The production-time question above; whether huts visibly slid when blasted.
- mageOrc (+ goblinSummon, a summon spell) for the orc house's third group.
