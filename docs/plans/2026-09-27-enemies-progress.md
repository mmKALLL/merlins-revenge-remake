# Enemy slice and the rest of the bestiary: progress

Handoff: `docs/plans/2026-09-27-enemies-handoff.md`. Engine notes: `docs/notes/engine-mechanics-enemies-2.md`
(the five slice enemies; port status in its §8) and `docs/notes/engine-mechanics-enemies-3.md` (every
mechanic added afterwards). Branch: `claude/zealous-darwin-wtjy4c`, pushed; not merged into `main`
(the cloud session may only push its own branch). `pnpm test`, `pnpm tsc --noEmit` and `pnpm build`
pass, so it is ready to fast-forward.

The owner's reference bundle (`mr-open-reference.zip`, uploaded mid-session: the Lingo, all data files
and every `anm_*` cast member as PNG with reg points) made this possible. It is not in the repository;
`tools/copy-assets.ts` now lists everything taken from it and copies the sprites from
`assets-mr-original/cast_bitmaps/` when a cast dump is there.

## Decisions for the owner to review

Each follows the engine's evident intent; the tunable ones go in `assets/tuning.json`.

1. **Hut production time** = group size x build time (goblinHut 105-350 ticks per group). The Lingo
   multiplies the group-size *counter list* by the build time (`modResidents.startProduction`), so what
   the original really did is unknown. Tunable per dwelling: `productionTimeScale` (default 1; 0
   releases as soon as the team cap allows).
2. **orcHouse stays on team `#goblins`** as in its data: it waits under the goblins' cap (16) and keeps
   exits shut as a goblin building; its orcs join `#orcs`. `"orcHouse": { "team": "orcs" }` switches it.
3. **Dwelling level-ups** play `level_up` on every release (as the engine does) and nothing else: the
   -1 % max energy per level, experience stars and residents' random starting levels are not ported
   (experience is not ported at all). Same for every other `*IncLevel` / `startingLevel` field.
4. **A caster dies while charging**: the half-charged spell disappears with it.
5. **Spell-caster movement** walks straight toward its goal (tiles still block it) rather than through
   modPathFinding. Its run goals lie far beyond the room (`GeomMirrorPoint` x20), so a cornered mage
   slides along the wall.
6. **Counters** for production and release intervals use the port's N-tick model (the engine's Lingo
   counters finish one tick earlier), as elsewhere in the port.
7. **Map-placed dwellings are prebuilt**, as in the engine; the builder path (`#beBuilt`, goblinBuilder,
   dwarf) is not ported. Dwellings slide when hit (modReel, inertia 80) and stop at walls without wall
   damage.
8. **Mages hit hard**: goblin mages cast Merlin's own energy blast (charge 12.5, no friendly fire), about
   20-25 damage per direct hit. Engine-faithful; e.g. `"goblinMage": { "attack": { "chargeMaxBasic": 2 } }`
   would soften it.
9. **runReload** units (bats, evil TVs, vulture guards) walk directly away from their target while
   reloading: the engine's `moveAwayFromLoc` calls `GeomMirrorPoint` without a distance (void x 20),
   which might have made them stand or even walk *toward* the target. Say if bats should not back off.
10. **Enemy teams fight each other** as their hate lists say (undead vs goblins, karate vs goblins, ...):
    mixed rooms such as `tvsDemo` room 4 turn into brawls. Engine behaviour, just newly visible.
11. **Not visible in the port yet**: frosty monks' freeze (`#takeFreeze`, `glowTeal`), heal/summon glow
    effects, spell icons over a charging summon, the dwarf tower's axe splash (`splashDamageOn`), and
    stretch deaths of CPU characters (grey ghost). Hits and damage from those units work.

## Done

Engine pieces (all with tests in `src/sim/enemies.test.ts`, which also runs every spawnable actor
against Merlin for 600 ticks):

- Converter: PNG cast frames with `regpoints.tsv` and per-frame delays; frames hang from their reg
  points; collision and sprite rects use them; case-insensitive strip, actor, weapon and bullet names.
- Frame-list attacks, natural attack strips, per-actor `stallSpeed`, multiAttack with per-weapon
  cooldowns, runReload, reelProof, graveOn, collisionDetection, min/max energy, reincarnation.
- `objAiCPUSpellCaster` (casting while kiting, dodging bullets and spells), summon spells
  (modSpellMultistage with random stages and team-cap reservations), heal spells.
- Dwellings (`objDwelling` + modResidents + the reservations cap), exploding bullets (modExploder).

Enemies that now run from their original data (grouped by team):

- goblins: goblin mage, goblin hero, goblin hut, goblin mage hut, goblin house (without its builders),
  gar tower; orcs: bow orc, sword orc, orc mage, orc house (team goblins)
- undead: skeleton warrior/archer/thrower/commando/giant, skeleton dwelling, the skeleton lord and its
  parts (arm, foot soldier, lower leg, sword, head, torso tank, upper), necromancer, grey ghost, dark
  mage, undead dragon
- monsters: black orc, dragon, bug, lizard, lizard soldier, baby and power ostrich, quadranid and cocoon,
  boulder monster and cave, dark golem and cave, double dark golem, four-arm golem, evil TV and TV box,
  vulture guard, druid
- cave: fang bunny, fang bunny baby and portal, bat, cave bat, bat tree; swamp: hydra 1/2/3, plant
- karate: karate guy, kung fu chicken, speedy guy, dojo; ninja: ninja, sword ninja, shuriken ninja,
  mysterious cloud; magicalAlliance: bomb mage, thunder monk, shrouder, magic portal
- ice: ice rock, frosty monk (no freeze); scarlet: scarlet archer, warrior, monk, fire dragon, fire
  lizard, lava golems; invisible: orc and undead invasion spawners
- allies and villagers: archer, warrior, king, monk (heals Merlin), dwarf tower, farmer, town watch,
  friendly goblins and their huts

Test content: the `enemies_test` map (goblin mages, orcs, goblin hut, orc house). The original maps
now fill up with their own enemies: `mriv_small` rooms 1-5 and `tvsDemo` room 4 (80+ units) are good
showcases.

## Not ported yet

- Builders: goblinBuilder, dwarf (`objAiCPUBuilder`, `#beBuilt` construction).
- Weapons with new mechanics: techMech (`energyBeam`, a stretched beam), sumo (`cracks` with splash
  graves), ochre wizard and prestotolin (`energyPulse`), verdanlin (`energyMines`), flaming rock's fire.
- The in-game wizards (berlin, amotonlin, flaetorlin, foelin, garonlin, ulin, scarlet): `#wizard`,
  `#leaveWhenFinished` allies with special spells.
- monkGhost (`objAiCPUGhost`), and the `summon*` units, which only the player's army summon creates.
- Pickups (medikit, spell scrolls, mana upgrades, magic limiters): the next big piece for parity.
