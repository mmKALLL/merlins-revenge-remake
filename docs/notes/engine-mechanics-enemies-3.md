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

## Teams

All team files are copied. Enemy teams hate each other too (undead hate goblins and orcs, karate hates
goblins, ...), so mixed rooms fight among themselves; `isPlayerEnemiesDead` only waits for teams whose
first hate group holds the player's team (or `#all`).
