# Design: combat slice

Date: 2026-09-26
Status: approved

## Goal

Add enemies and Merlin's energy blast on top of the walk-and-rooms slice: goblin warriors (melee) and goblin archers (ranged) spawned from the objects layer, the original AI, attacks, knockback, damage, death and exit gating, plus a Merlin energy bar and map restart on death.

Behaviour follows the original engine exactly, with constants taken from the original data files. The backlog cards describe intent; where they disagree with the engine, the engine wins and tuning happens later through data. Enemy types must be data-driven so later types (mage/wizard, dwelling spawners) are new data files plus at most one new behaviour function.

Engine reference: `docs/notes/engine-mechanics-combat.md` (line references into the Lingo source).

## Approach

Data-driven actors on the existing pure simulation. Alternatives rejected: an object-per-Lingo-class port (breaks the pure sim, hides in-place mutation bugs) and an ECS library (new paradigm and dependency for a dozen actors).

## 1. Actor data pipeline

- A converter step (`tools/`) parses the needed `act_*.txt` files with the existing Lingo parser and ports `actorMaster.retrieveActorData`: resolve `#inherit` chains by shallow child-over-parent overwrite, with a child's `#attack` list replacing the parent's wholesale, then fill gaps from a ported `structAttack` defaults table.
- Files copied into `assets/actors/`: player, actorPlayer, actor, character, CPUCharacter, goblinWarrior, goblinArcher, goblinSword, goblinBow, goblinArrow, weapon, bullet, energyBlast, spell (plus any parent they name).
- Output: `public/generated/actors.json` with fully resolved records keyed by name.
- `assets/tuning.json` (initially `{}`) is merged over the resolved records last, so tweaks are explicit and diffable against the originals.
- Sprite atlases are built for `goblinWarrior`, `gar` (archer), `gobarrow` and `spell` from `assets/sprites/<folder>/`, like Merlin's. The archer folder's grave frame serves as the grave for both goblins.

## 2. Sim state

- `SimState.actors`: array of actor records. The player is actor 0 and uses the same record shape. Record fields: id, def (definition name), team, pos, prevPos, vel, facingLeft, mode (`walk`, `weaponMelee`, `weaponRanged`, `charge`, `release`, `reel`, `die`, `dead`, `fly`, `land`, `explode`, `finish`), anim + frame + counter, energy, cooldown counter per current weapon, stall counter, friction, inertia, ai (mode, targetId, retargetCounter, pathMode, waypoint), and for projectiles: owner id, target id/point, charge.
- Rooms keep per-room state: whether actors were spawned, surviving actor snapshots when the player leaves, and graves (definition, position). Re-entering a room restores, never respawns.
- Tick order per tick: player input -> for each actor: AI intent -> velocity (walk friction 50%, reel friction 10%, projectiles 0) -> tile collision (spells skip it) -> animation advance -> attacks resolve on the attack frame -> hits (inertia-scaled push added to velocity, damage = Manhattan length of the scaled push times the attacker's damageMultiplier) -> death transitions -> remove finished actors -> team-dead check -> exits open.

## 3. Behaviour functions (src/mr-open)

One file per Lingo object, each citing its source:
- `mr-actor-data.ts`: inheritance resolution and structAttack defaults.
- `mr-targeting.ts`: hated teams from `#hates[1]`, nearest by squared reg-point distance; retarget every 30 ticks and after every attack.
- `mr-ai-cpu.ts`: mode machine findTarget -> moveToAttack -> attack -> back; dazed while reeling or dying; ideal attack location (melee: 15 px on the near side; ranged: the target); in-reach tests (melee strike point inside target rect; ranged squared distance below reach squared).
- `mr-pathfinding.ts`: beeline at walkSpeed (velocity overwritten each tick), stall counter of 5 ticks -> random waypoint within +/-100 px -> back to beeline.
- `mr-attack.ts`: cooldown counters advancing by agility / dexterity / mana_regeneration; melee push = power * strength mirrored to facing; ranged spawn point = collisionLoc mirrored; eyestrain error scaled by distance over reach; attack frame detection.
- `mr-bullet.ts`: arrow flight, stall -> land, hit test by rect overlap with its target, push = velocity * 0.5. Applied once per hit (the engine's double takeHit is a recorded quirk, not reproduced).
- `mr-spell.ts`: charge from chargeStart + mana_burst up to min(chargeMax, mana_capacity * chargeMaxModifier + chargeMaxBasic) at chargeSpeed * mana_flow per tick; release toward a point at spellSpeed; arrival when past the target on both axes; explosion: charge * chargeExplodeFactor, radius = charge / 2 (after the factor) + target radius, push = (radius - dist) * power toward the victim.
- `mr-take-hit.ts`: inertia scaling, reel entry (friction 10%, stall counter reset), damage, energy, death detection; the player is pushed with full force and returns to walk mode immediately.
- `mr-death.ts`: die -> dead (grave strip) -> finish (grave recorded on the room), team removal, `isPlayerEnemiesDead` over teams whose first-priority hate group contains the player's team.
- Experience is not awarded (the engine never sets `#lastAttacker`); recorded in the notes.

## 4. Input and player attacks

- Left click or Space held: charge; release: fire at the mouse world position.
- E: charge while held, release fires at the nearest enemy's current position.
- F: same, but at the point 16 px short of the nearest enemy along the line from Merlin (a push-back shot).
- All three share the charge mechanics and the cooldown. Merlin's natural punch is out of scope.
- Merlin takes hits like the engine: full push, straight back to walk mode, no reel state; energy 200; passive regeneration +1 per 30 ticks.

## 5. Rendering and HUD

- Actors draw sorted by their definition's layer value (bullets and spells above characters). Graves are a per-room layer of static sprites, not baked into the tile bitmap.
- The blast draws as the single spell frame scaled to the charge size in pixels with its tint; explosions fade over a few frames.
- HUD strip (bottom 32 px): Merlin's energy bar; the debug line stays.
- Camera, zoom and interpolation unchanged; every actor interpolates between prevPos and pos.

## 6. Errors, restart, testing

- Missing actor definitions, parents or animation strips fail at conversion time with the name.
- Merlin's energy reaching zero restarts the current map from its start state after the die animation.
- Tests: unit tests for each behaviour function on a small representative set (warrior sword push and damage, archer reach and eyestrain bounds, one cooldown case, blast max charge and explosion radius, reel ending after stall, exits opening only when goblins are dead). Not every actor or constant gets its own test, since numbers will be tuned. One integration tick test runs a scripted fight on a tiny map: goblin approaches, strikes, Merlin blasts it, it reels, dies, the exit opens.

## Out of scope

Merlin's punch, medikits and other pickups, experience and levels, sounds, hut spawners, mages, cut scenes, saving, minimap, exit arrows.
