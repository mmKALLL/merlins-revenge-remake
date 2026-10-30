# Engine mechanics: enemies 3 (the rest of the bestiary)

Mechanics added after the enemy slice (`engine-mechanics-enemies-2.md`) so that most of the
engine's enemies run from their data. Read against the owner's reference bundle
(`mr-open-reference.zip`: `casts/` Lingo and data, `cast_bitmaps/` every `anm_*` cast member with
`regpoints.tsv`); paths below are relative to its `casts/`. Status and decisions:
`docs/plans/2026-09-27-enemies-progress.md`.

## Data and art

- **Symbols are case-insensitive.** Actor keys in resident groups, `reincarnateAs`, weapons, bullets
  and summon stages are matched to actor files ignoring case (dojo's `#SpeedyGuy` is `act_speedyGuy`,
  iceRock's `#iceboulder` is `act_iceBoulder`); strip names likewise (`chargeWalk`/`chargewalk`).
  A sprite folder is named after the actor's `#name` even when the cast members spell it differently.
- **Frame order** is cast member order (`animStripMaster.extractData`), the frame number in the name is
  never parsed; each member keeps its own delay. The converter sorts by frame number, which matches.
- **Registration points** come with the cast dump; the renderer hangs such frames from them, the
  collision rect (`modCollisionRect.initRectFromCurrentImage`) and sprite rect use them.
- `layerZ` can be a bare sprite channel number (`act_cracks`); accepted.

## Attacks

- **Attack strip = `attack.animType`** (`objAiAttack.attackMelee/attackRanged`:
  `ensureMode(getAttack().animType)`), so natural attacks play `naturalMelee`/`naturalRanged`.
- **Frame lists** (`modAttack.isOnAttackFrame`): strike or fire on every listed frame.
- **multiAttack** (`objAiCPU.refreshTarget -> modWeaponManager.setMultiAttack`, `modWeaponManager.txt:343-390`):
  the weapons are the natural attack (1, added first by `initNaturalAttack`) and the starting weapon (2).
  On each new target: weapon 1 when `distSqr - bufferDist^2 > 0` (`bufferDist` 100, or weapon 2's reach
  when that is ranged); else weapon 2, except that against a melee target weapon 1 is kept while
  `distSqr > 20` (a squared distance against 20, so effectively always). Each weapon has its own
  cooldown counter (`addCooldownCounter`, all advanced by `updateCooldowns`).
- **runReload** (`objAiCPU.attackFin`, `updateRunReload`): after an attack the unit re-picks its target
  and walks away from it until the cooldown is done, then `#moveToAttack`. `moveAwayFromLoc` calls
  `GeomMirrorPoint` without a distance (void x 20); the port walks directly away (evident intent).

## Bullets

- **Exploding bullets** (`modExploder`, `objBullet.updateFly/goMode`): an `#explode` bullet goes off on
  the events in its `#explodeEvents` (`#bulletCollidedWithTarget`, `#bulletLanded`; `#bulletArrivedAtTargetLoc`
  is never raised: the arrival check is commented out). A direct hit first applies the bullet's own
  collision vector twice (`takeHit` + payload) - for `#explode` that is `calcCollisionVectSpell` at the
  current charge - then the explosion: `teamMaster.impactAttack` with charge = `attack.explodeCharge`
  (radius charge / 2, push `(radius + r - dist) * power`, exactly the spell explosion), sound = the actor's
  own `#explodeSound` at `#explodeVolume` (default 50). The bullet shows its `explode` strip, then is removed.
- A landed bullet with `reincarnateAs` creates it when the land strip ends (`objBullet.update #land`;
  flamingRock -> fire, not ported).

## Units

- **reelProof** (`modReel.takeHit`): the push and damage still apply, no `#reel`.
- **graveOn false** (`modGrave`, `objCPUCharacter.updateDead`): no grave strip wait, no grave stamp.
- **collisionDetection false** (`objGameObject.checkCollisions`): no tile collisions; `constrainToPlayArea
  #auto` then keeps it in the room (bats, ghosts).
- **minEnergy / maxEnergy** (`modEnergy`): dies at `energy <= minEnergy`; regenerates up to `maxEnergy`
  (`#auto` = starting energy).
- **reincarnateAs** (`modReincarnate`): on leaving the team when killed, each listed actor is created on
  the reg point (`useOffset` stays false: the loop resets `j` every pass; `reincarnateRadius` is never read).
  hydra3 (1500, dies at 1000) -> hydra2 (1000, dies at 500) -> hydra1; four-arm golem -> two dark golems.
- **teamRole on characters**: towers and the plant are characters in the `#teamBuildings` role; they do
  not count toward a dwelling's team cap (`reservationsMaster.objectJoined` counts `#teamMembers` only).

## Spell casters

- **Summons** (`modSpellMultistage`, `modAttack.calcAttackChargeMax`, `armyMaster.createUnit`): the spell's
  payload is the last `#multistage` stage its charge has reached (`selectPayload`). `randomSummon` casters
  draw their charge max per cast: when stage 2 is below the max, `min(max, max * random(20) / 17 +
  random(stage 1)) + random(2) - 1`, so they stop at a random stage or short of stage 1 (a plain blast).
  Reaching a stage asks `reservationsMaster` for one slot (the caster's team cap); refused, the charge is
  reined in to stage 1 - 1 and `#chargeLimited` releases it at once. With a payload and
  `targetTileWhenNotBlank` the spell aims at the target's tile centre (`objAiCPU.calcSpellTargetLoc`).
  On exploding (blast as usual) the unit is created on the spell with its own data; a solid tile cancels it.
  `chargeSpeedMax` caps `chargeSpeed * mana_flow` (`calcAttackChargeSpeed`). The spell sits at the caster's
  own `#chargeLoc` (`objCharacter.calcChargeLoc`, default `point(0,-8)`; mageOrc `point(0,-16)`).
- **Heal** (`teamMaster.findTarget/calcTargetTeamsByAllegiance/findTargetInTeam`, `objAiCPU.refreshTarget`,
  `modEnergy.takeHeal`): `targetAllegiance #friendly` targets the friends plus the own team, `#lowestHealth`
  the lowest energy percentage (the caster itself included), nobody at 100 %. The explosion goes over the
  same teams and its `#takeHeal` payload adds `2 * (|vx| + |vy|)` energy (up to the max), no push.

## Wizards

The in-game wizards Scarlet and Ochre (`act_scarletInGame`, `act_ochreInGame`) are ported as
enemies: plain `objCPUCharacter` / `objAiCPUSpellCaster` units with 1000 energy and inertia 60.

- **Scarlet** (team `#scarlet`, `#name "scw"`: the cast's `anm_scw_*` strips) carries the
  `#undeadSummon` scroll as her weapon, as the necromancer does (Summons above): randomSummon
  stages from skeleton warrior up to skeleton lord, mana_capacity 35, mana_flow 1.5. The summoned
  units are team `#undead`, which neither hates nor is hated by `#scarlet`.
- **Ochre** (team `#blackSorcerer`, `#name "ochreWizard"`, `#character #archEnemy`, walkSpeed 10)
  carries `#energyPulseSpell`: the spell stays where he releases it and fires `floor(charge / 2) +
  1` energy pulses at his target (engine-mechanics-spells.md, Pulses and beams). In a probe (open
  room, Merlin standing still 160 px away, 30 s) he cast 82 spells and fired 470 pulses, but they
  burst 12-19 px from Merlin's loc, mostly past the 13 px reach of their blast (explodeCharge 10 ->
  radius 5, plus Merlin's 8), so only 2 hurt him (20 each). His room is dangerous through its
  elementals; the pulses' reach against a CPU caster's target is worth a look against
  `modAttack.performRangedAttack` before any tuning.
- Neither has a `#wizard` role or the wizard selector here: those belong to the player's wizard
  allies (open items).

## Teams

All team files are copied. Enemy teams hate each other too (undead hate goblins and orcs, karate hates
goblins, ...), so mixed rooms fight among themselves; `isPlayerEnemiesDead` only waits for teams whose
first hate group holds the player's team (or `#all`).

## Remake decisions: enemy life (owner request, 2026-10-22)

Lower `energy` for several enemies, all in `assets/tuning.json` (deleting an entry restores the data file's value):

- Non-dark golems and their dwelling about -25 %: boulderMonster 400 -> 300, fourArmGolem 1200 -> 900, boulderCave 700 -> 525.
- Orcs about -33 %: bowOrc, swordOrc, mageOrc 300 -> 200; blackOrc 1200 -> 800.
- skeletonArcher 120 -> 80, skeletonGiant 200 -> 160, vultureGuard 1300 -> 800.
- Hydras -40 %: each stage keeps its share, so hydra1 500 -> 300, hydra2 1000 / minEnergy 500 -> 600 / 300, hydra3 1500 / 1000 -> 900 / 600, and the shared `maxEnergy` (health bar scale) 1500 -> 900.
- Scarlet's army (the red team) about -30 %: scWarrior 250 -> 175, scArcher 175 -> 120.
- Dark golem cave about -30 % (owner request, 2026-10-23): darkCave 1000 -> 700.
- MR3 wizards -20 %: bombMage 200 -> 160, thunderMonk (lightning) 150 -> 120, shrouder (pins, taken as the poison mage) 150 -> 120.

## Remake decisions: dark mages (owner request, 2026-10-23)

- **Damage and knockback -30 %.** The dark blast's push is `(radius + r - dist) * power` and its damage
  the push's Manhattan length times `damageMultiplier` (1), so `power` scales both:
  `darkMage.attack.power` 3 -> 2.1 in `assets/tuning.json`. The tuning goes on the wielder, not on
  `darkBlast`: a CPU unit's attack is resolved from its weapon's file with the unit's own `attack`
  overlay. With chargeMax 15 (mana_capacity 10 x 0.5 + 10) the explosion's radius is 30, so a direct
  hit on a target of radius 8 pushes and hurts 114 -> 79.8.
- **About 20 % fewer in the Magic Maze.** Almost all dark mages come from the undead rooms' fixed
  groups (the dark sorcerer's court, the necromancy study) and those rooms' regular draws, where the
  dark mage is the only undead regular: the draw picks a tier, then a unit within it, so its weight
  hardly matters (2 -> 1 changed the average by 0.02). The maze's table caps it at `maxPerRoom: 4`
  instead (`src/gen/themes.ts`): over 200 seeds the average per maze floor goes 3.64 -> 2.80 (-23 %),
  nearly all of it in the court, which loses one or two regulars.

## Remake decisions: small lizards and plants (owner request, 2026-10-25)

- **Small lizards (`lizard`, the baby flamethrower) -30 % energy, twice the reel friction.**
  `assets/tuning.json`: `lizard.energy` 100 -> 70 (`maxEnergy #auto` follows), `frictionReel`
  point(10,10) (inherited from `act_CPUCharacter`) -> point(20,20), so a hit slides one about half as
  far (reel friction is the percent of speed lost per tick, `engine-mechanics-combat.md` section 6).
  `fireLizard` (the same unit on team scarlet) is placed by no generated floor and keeps its data.
  More of them per room only where a room draws to an HP budget (`hpBudget`: the biomes' "numerous
  weak" corner, the Golden Fort): the other draws place a fixed count of units whatever their energy.
  Over 200 seeds per floor: Hydra Marsh 20.1 -> 23.2 lizards, Dragon Canyon 7.2 -> 7.4, Woods of
  Mourning 3.2 -> 3.2, Golden Fort 1.3 -> 1.4. No `maxPerRoom` caps them.
- **Small lizards walk 1.8x faster (owner, 2026-10-28).** A CPU character walks at its `walkSpeed`
  (modMoveToLoc; `walkAcceleration` is the player's): `lizard.walkSpeed` 2 -> 3.6 in
  `assets/tuning.json`, so after the 50 % walking friction it covers 1.8 px a tick (54 px/s) instead
  of 1 (30 px/s). `fireLizard` again keeps its data.
- **Least hit area (`minHurtboxPx`, ActorDef, engine default 0).** The plant's stand frame (its seed,
  7x10 px, reg (4,-2)) gives it the fixed collision rect (-3,3)-(2,11), 5x8 px, for its whole life
  (`collisionRectType #fixed`, see `collisionRectFor`), and the 7x10 sprite rect for melee and
  blasts (12x10 at the first frame of its shooting strip). With `minHurtboxPx` a unit's hit area is
  grown about its centre to at least that width and height: the victim's collision rect a bullet
  tests (`hurtRectFor`), and the sprite rect melee strikes and explosions test and take their radius
  from (`hurtSpriteRectFor`). Wall collision, pickups and AI ranges keep the engine rect; the axe's
  landing splash keeps the engine's reg-point distance. `plant.minHurtboxPx` is 12.
- **Bug bite (owner, 2026-10-25):** the bug's damageMultiplier 0.75 (was 0.35): its 2 px push now deals
  1.5 energy a bite instead of 0.7 (`assets/tuning.json`).
- **Skeleton heads' shots slower (owner, 2026-10-25):** a new attack field `shotSpeedScale` (engine 1)
  scales performRangedAttack's launch speed; the skeleton head (skelitonHead, #proportional: distance /
  10 per tick) fires at 0.7 of it. Its missile still flies past Merlin (friction 3 carries a
  proportional shot about 3x the distance), only slower.
- **Slower enemy shots (owner, 2026-10-26):** `shotSpeedScale` now also scales a spell's flight
  speed (`spellFlightSpeed` = spellSpeed x shotSpeedScale, objSpell.releaseNormal), so one field
  covers bullets and spells. In `assets/tuning.json`: goblin mage 0.9 (its energy blast flies 18 px a
  tick, was 20), dark mage 0.8 (16), shuriken ninja 0.8 (#fullstrength, strength 8: 6.4), quadranid
  0.9 (laser, strength 10: 9); skeleton heads keep 0.7. Merlin's spells stay at 1, and so do the
  friendly goblin mages (the owner named the enemies). Spell speed in the original: the goblin
  mage's 20 px a tick is the original data (act_energyBlast `#spellSpeed: 20`, the same as Merlin's
  blast), so at the engine's 30 Hz ceiling it flew 600 px/s, as in the port; frameTimer has no delta
  time, so on a machine (or a movie tempo, walking notes §4) that ran slower than 30 ticks a second,
  every shot and walk looked slower in proportion. The port does not know the tempo the original
  ran at.
- **Every shuriken at 9 px a tick; quadranid lasers a tad faster (owner, 2026-10-28).** Two units
  throw shurikens, both #fullstrength: the shuriken ninja (its own attack, strength 8) and the ninja
  (a multiAttack unit: its natural attack throws them at strength 12, its weapon is the ninjaSword).
  A tuning entry's `attack` tunes the installed attack, which for the ninja is the sword's, so
  `tuning.json` has a second key, `naturalAttack`, merged onto the actor's own #attack only
  (`naturalRawAttack` in `src/mr-open/mr-actor-data.ts`). `shurikenNinja.attack.shotSpeedScale` 1.125
  (8 x 1.125 = 9, was 6.4) and `ninja.naturalAttack.shotSpeedScale` 0.75 (12 x 0.75 = 9, was 12); the
  ninja's sword is untouched. The sword ninja has no throw (multiAttack false, no #attack of its own).
  `quadranid.attack.shotSpeedScale` 0.9 -> 0.97 (laser 9 -> 9.7 px a tick).
- **HP pass (owner, 2026-10-30, `assets/tuning.json` energy):** dark golem 650, four-armed golem 800,
  double dark golem 900, fang bunny portal 300, ice rock 250 (it becomes a full-HP boulder monster on
  death), lava golem 450, lava dark golem 550, skeleton lord 700, vulture guard 500, fang bunny 300,
  undead dragon 400, skeleton commando and skeleton upper 225, fang bunny baby and karate guy 150.
