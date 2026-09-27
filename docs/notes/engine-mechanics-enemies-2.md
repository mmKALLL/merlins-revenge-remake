# Engine mechanics: enemies 2 (goblin mage, goblin dwelling, orc archer, orc fighter, orc dwelling)

Source root (abbreviated `casts/` below): `assets-mr-original/merlin_open_30_speedy_and _tvs/casts/`.
Conventions and everything already covered (inheritance/ListsMerge, structAttack defaults, objAiCPU modes, melee/ranged hit resolution, energy blast, reel, death/graves, exits) are in `engine-mechanics-combat.md`; this note only adds what is new for the next five enemies.
Port state checked against: `src/mr-open/mr-actor-data.ts` (ActorDef/AttackDef, `resolveActors`), `src/sim/state.ts`, `assets/actors/` (copied act_ files) and `assets/teams/`.

## 1. Resolved data

All five chains end in `act_actor`; the new parent is `act_dwelling` (`data/act_dwelling.txt:3-7`): `#inherit: #actor, #energyIncPercentage: -1, #frictionReel: point(30,30), #inertia: 80, #teamRole: #teamBuildings`. It has **no `#objType`**: each dwelling file sets `#objType: #objDwelling` itself.

### goblinMage (`data/act_goblinMage.txt:3-19`)
Chain `goblinMage -> CPUCharacter -> character -> actor`. Verbatim: `#objType: #objCPUCharacter, #AiType: #objAiCPUSpellCaster, #character: #goblinMage, #damageSpeed: 4, #dexterity: 3, #energy: 50, #experienceAmountForNextLevel: 3, #experienceImWorth: 6, #inertia: 60, #miniMapStatus: #inf, #stallSpeed: 0.5, #strength: 1, #team: #goblins, #name: "goblinMage", #walkSpeed: 3.5, #weapon: #energyBlast`.
- No `mana_*` overrides, so from `act_character.txt`: `mana_burst 1, mana_capacity 10, mana_flow 1, mana_regeneration 1`, `eyestrain 0`, `agility 1`. No `chargeLoc`/`chargeOffsetSide` in data -> objCharacter defaults `chargeLoc point(0,-8)`, `chargeOffsetSide #top` (`objCharacter.txt:29-31`).
- **Weapon is the player's own `energyBlast`** (`data/act_energyBlast.txt:6-35`): `animframe #none, animType #magic, bullet #energyBlastBullet, chargeColour rgb(255,200,0), chargeSpeed 1, chargeStart 0, chargeMax 999, chargeMaxBasic 5, chargeMaxModifier 0.75, collisionLoc point(0,-8), cooldown 30, explodeSound "spell_explode", hits [#teamMembers, #teamBuildings], limitMagic true, power 0.75, payloadFunction #takeHit, reach 9999, releaseSound "spell_release", spellSpeed 20, targetRoles [[#teamMembers, #teamBuildings]]` (plus gmg* fields, unused unless gmg is on). Same numbers as Merlin's blast with Merlin's default mana, i.e. charge 1 .. 12.5 (10*0.75+5) at 100 % magic limit, +1 per tick (`modAttack.txt:83-175`, already ported as `chargeLimits`).
- Port: `resolveActors` handles it as-is (all fields exist in ActorDef/AttackDef; `energyBlast` is already in `assets/actors/`). Needs `goblinMage.txt` copied; AiType `objAiCPUSpellCaster` is new behaviour (section 2).

### goblinHut (`data/act_goblinHut.txt:3-24`) and goblinMageHut (`data/act_goblinMageHut.txt:3-19`)
Chain `goblinHut -> dwelling -> actor`. Verbatim goblinHut: `#objType: #objDwelling, #dieSound: "goblin_hut_die_02", #energy: 25, #experienceImWorth: 15, #residentGroups: [[#typ: #goblinArcher, #buildTime: [40,50], #groupSize: [3,7], #releaseInterval: [30,50]], [#typ: #goblinWarrior, #buildTime: [35,45], #groupSize: [3,7], #releaseInterval: [25,45]]], #team: #goblins, #name: "goblinHut"`.
goblinMageHut: `#energy: 15, #experienceImWorth: 20, #residentGroups: [[#typ: #goblinMage, #buildTime: [50,60], #groupSize: [1,2], #releaseInterval: [20,50]]], #name: "goblinMageHut", #team: #goblins, #totalResidents: 5` (same dieSound).
Resolved extras from the chain: `inertia 80, frictionReel point(30,30), energyIncPercentage -1, teamRole #teamBuildings`, `team` from the file, `startOffset point(-16,-16)` (act_actor). No `AiType`, no `weapon`, no `#attack`.

### bowOrc (`data/act_bowOrc.txt:3-19`)
Chain as goblinArcher. Verbatim: `#objType: #objCPUCharacter, #AiType: #objAiCPU, #damageSpeed: 2, #dexterity: 10, #dieSound: #none, #energy: 300, #experienceImWorth: 30, #eyestrain: 50, #inertia: 55, #startingLevel: 0, #strength: 8, #team: #orcs, #name: "bowOrc", #walkSpeed: 6, #weapon: #crossBow, #weaponTechnique: -5`.
- `crossBow` (`data/act_crossBow.txt:3-15`): `#objType: #objPowerUp, #inherit: #weapon, #attack: [#animframe: [2,4,6], #animType: #weaponRanged, #bullet: #crossBolt, #collisionLoc: point(0,-2), #cooldown: 8, #firingType: #fullstrength, #name: #crossBow, #reach: 100, #sound: "orc_fire"]` + structAttack defaults (`power point(5,-1)` unused for ranged, `damageMultiplier 1`, `hits [#teamMembers]`). Note: no `#dexterity` in the attack list (goblinBow has `#dexterity: 1`, also unused).
- `crossBolt` (`data/act_crossBolt.txt:3-14`): `#inherit: #bullet, #attack: [#damageMultiplier: 4, #power: 0.7, #type: #bullet], #character: #bullet, #name: "crossBolt", #friction: point(5,5), #recordInRoomState: false, #weight: 1.6` (objType `#objBullet` from act_bullet). Compare goblinArrow: `damageMultiplier 3, power 0.5, weight 0.4`.
- **Three shots per attack strip**: `animframe [2,4,6]` is a list; `isOnAttackFrame` fires on each listed frame (`modAttack.txt:577-621`). Cooldown 8 advanced by dexterity 10 -> ready again after 1 tick, so it effectively fires as fast as the `weaponRanged` strip loops.
- Port gap: `buildAttack` keeps `animFrame` only if it is a number (`mr-actor-data.ts:253`: `typeof a['animFrame'] === 'number' ? ... : null`), so a list becomes `null` and **the crossbow would never fire**. `AttackDef.animFrame` must become `number[] | null` (and `onFreshFrame` in `src/sim/anim.ts:93` test membership).

### swordOrc (`data/act_swordOrc.txt:3-19`)
Verbatim: `#objType: #objCPUCharacter, #AiType: #objAiCPU, #character: #friendlyCharacter, #damageSpeed: 2, #dexterity: 4, #energy: 300, #inertia: 70, #eyestrain: 70, #experienceImWorth: 20, #miniMapStatus: #inf, #stallSpeed: 3, #strength: 3, #team: #orcs, #name: "swordOrc", #walkSpeed: 8, #weapon: #orcSword`. (`#character: #friendlyCharacter` looks like a copy-paste leftover; `#character` is a category tag, not the team.)
- `orcSword` (`data/act_orcSword.txt:3-18`): `#objType: #objPowerUp, #inherit: #weapon, #attack: [#animframe: [6,10,12], #animType: #weaponMelee, #collisionLoc: point(10,6), #cooldown: 0, #damageMultiplier: 8, #hits:[#teamMembers, #teamBuildings], #idealAttackLoc: point(10,6), #name: #orcSword, #power: point(1, 0), #sound: "skeleton_fire", #targetRoles: [[#teamMembers, #teamBuildings]]]`. Again a frame **list** (three hits per swing) -> same resolver gap as crossBow. agility 1 (default), cooldown 0.
- Melee push: `power point(1,0) * strength 3` vs goblinSword `point(0.7,0) * 4`; damageMultiplier 8 vs 2.

### orcHouse (`data/act_orcHouse.txt:3-31`)
Verbatim: `#objType: #objDwelling, #inherit: #dwelling, #dieSound: "boulder_die", #energy: 100, #experienceImWorth: 20, #frictionReel: point(85,85), #residentGroups: [[#typ: #bowOrc, #buildTime: [52,62], #groupSize: [1,6], #releaseInterval: [30,60]], [#typ: #swordOrc, #buildTime: [55,65], #groupSize: [1,6], #releaseInterval: [30,60]], [#typ: #mageOrc, #buildTime: [60,70], #groupSize: [2,3], #releaseInterval: [40,60]]], #team: #goblins, #name: "orcHouse"`.
- **The orc house is on team `#goblins`, not `#orcs`** (`act_orcHouse.txt:30`). Its residents join their own data team (`#orcs`), since `releaseResident` creates them via `newActor` with their own data (check section 2).
- **It also spawns `mageOrc`** (`data/act_mageOrc.txt:3-24`), out of this slice's list: `#AiType: #objAiCPUSpellCaster, #chargeOffsetSide: #top, #chargeLoc: point(0,-16), #energy: 300, #inertia: 65, #mana_capacity: 31, #mana_flow: 1.5, #walkSpeed: 4, #team: #orcs, #name: "mageOrc", #weapon: #goblinSummon`. `goblinSummon` is a summon spell (uses `residentTeamCategory`, randomSummon). Porting orcHouse faithfully needs the mageOrc + goblinSummon, or dropping that group.

### Resolver gaps summary
- `animFrame` lists (crossBow, orcSword) -> currently `null`.
- `residentGroups`, `totalResidents`, `teamRole`, `energyIncPercentage` stay only in `raw` (fine, but a dwelling def needs typed fields).
- `SPRITE_OBJ_TYPES` (`mr-actor-data.ts:87`) lacks `objDwelling`, so `needsSprite` is false for huts; the converter would not demand/ship their art.
- `OBJECT_DEFAULTS` has no `objDwelling` entry (e.g. its `energyRecoverDelay`; see section 2).
- Unknown weapon keys throw (`resolveActors`), so `crossBow`, `crossBolt`, `orcSword` (and `goblinSummon` for mageOrc) must be copied into `assets/actors/` with their users.

## 2. Behaviour

### 2a. Goblin mage: objAiCPUSpellCaster

Class chain `objAiCPUSpellCaster -> objAiCPU -> objAiAttack -> objAi` (`script_objects/objAiCPUSpellCaster.txt:15-16`). Header comment (`:2-3`): "because spells are not limited by range, spell casters can spend their time trying to find safety". Everything in objAiCPU (findTarget / moveToAttack / retarget every 30 ticks / dazed) still runs; the subclass adds a second, parallel "spell caster mode" that only steers movement.

**Charging (the attack itself).** `energyBlast.reach` is `9999` (an integer), so `targetInReachRanged` is `GeomDistSqr < 9999*9999`, i.e. **always in reach** once a target exists. Per tick in AI `#moveToAttack` (`objAiCPU.txt:452-459`): `updateMoveToAttack` returns `#fin` (fires `#arrivedAtAttackLoc`, which cancels the path walk) and calls `attack()`:
- `objAiCPU.attack` (`objAiCPU.txt:33-40`) skips `faceTarget()` for `#magic`; `objAiAttack.attack` (`objAiAttack.txt:37-54`) returns if `getCooldownFin() = false`, else `attackMagic -> chargeMagic` (`:61-62, 126-130`): `pCharacterPrg.ensureMode(#charge)`, `ensureSpell()`, `chargeSpell()`.
- **The AI mode stays `#moveToAttack`** (attackMagic does not `goMode(#attack)`), so `attack()` -> `chargeMagic` runs again every tick: one charge step per tick. This is the same `ensureSpell`/`chargeSpell` path as the player (`objAiAttack.txt:157-185`): the spell actor (`#spell`) is created at `calcChargeLoc()`, `setSpellProperties` gets the mage's `attack` and **`params.team = me.getTeam()`** (`:170`), and `pChargeCounter` is `tim = [calcAttackChargeStart, calcAttackChargeMax]`, `inc = calcAttackChargeSpeed` (`:179-182`; formulas `modAttack.txt:83-175`, ported as `chargeLimits`). With the mage's defaults: start 1, max 12.5 (at 100 % magic limit, `limitMagic true`), +1 per tick -> **about 12 ticks of charging** (0.4 s).
- `chargeSpell` (`objAiAttack.txt:132-141`): `currentSpell.charge(theCount, calcChargeLoc())`, `CounterOnce`, and when the counter finishes `internalEvent(#spellCharged)`. The spell can also report `#chargeLimited` (the SpellCaster forwards it as `#spellCharged`, `objAiCPUSpellCaster.txt:60-74`).

**Release.** `objAiCPU.internalEvent #spellCharged` (`objAiCPU.txt:245-250`): `targetLoc = calcSpellTargetLoc()`; if not `#none`, `releaseMagic(targetLoc)`, else `cancelAttack()`. `calcSpellTargetLoc` (`objAiCPU.txt:78-100`) = **the target's current `getLoc()`** (reg point), snapped to the tile centre only when `attack.targetTileWhenNotBlank` (not set for energyBlast). **No eyestrain is applied** to spells (only `modAttack` ranged fire calls `modifyLocWithEyestrain`, `modAttack.txt:735`), and there is no lead on a moving target. `releaseMagic` (`objAiAttack.txt:337-358`): `ensureMode(#release)` on the character, `currentSpell.release(targetLoc, attack.spellSpeed)` (20 px/tick), `goMode(#release)`; `updateRelease` (`:416-420`) waits for the `release` strip to loop, then `attackFin(#completed)`. `objAiCPUSpellCaster.attackFin` does `setTarget(#none)` (`:38-44`) and `objAiCPU.attackFin` `clearTarget()` + `refreshTarget()` (`objAiCPU.txt:42-46`): the mage **re-picks its nearest target after every cast**.
- Cooldown: `energyBlast.cooldown 30` advanced by `mana_regeneration` (1) per tick (see combat note, `modWeaponManager.addCooldownCounter`), so a new charge can begin ~30 ticks after the previous attack starts cooldown; one cast cycle is roughly 12 charge + release strip (4 frames x 1 tick) + remaining cooldown.
- **Friendly fire: none.** The spell explodes through `teamMaster.impactAttack -> impactMeleeAttack` (`objSpell.txt:147-157`, `teamMaster.txt:1037-1110`), which only considers `cullTeamList(hates[1])` of the **spell's team** (= the caster's, `#goblins`). Goblins' and orcs' hate lists do not contain goblins/orcs (section 3), so the mage's blast hurts `#aldevar` (and other hated teams) only; `hits [#teamMembers, #teamBuildings]` means it would also hit hated buildings. The port's `explodeSpell` already filters by `hatedTeams(spell.team)` (`src/sim/tick-combat.ts:268`), so this is free once the spell is spawned with the mage's team.
- Explosion is the ported energy-blast explosion (charge x `chargeExplodeFactor 4`, radius, push `power 0.75`, `explodeSound "spell_explode"`); nothing mage-specific.

**Movement: `updateMoveToOptimumPosition`** (`objAiCPUSpellCaster.txt:261-297`). Runs after `ancestor.update()` every tick while `pSpellCasterMode = #moveToOptimumPosition` **and** `getAttack().reach = 9999` (i.e. only while a range-unlimited spell is equipped). Because it runs after objAiCPU's `#arrivedAtAttackLoc`, its `moveToLoc` wins: the mage keeps moving while it charges (character strip `chargeWalk` when moving, `modAnimSet.txt:120-127`; `releaseWalk` likewise). Priority order, first that triggers wins:
1. **Dodge bullets**: `g.teamMaster.findNearestEnemyBullets(me)` = the 2 nearest `#teamBullets` of hated teams (`teamMaster.txt:196-198, 374-...`). `runTangentToObjects(nearest, pBulletSafeDistance = 100)` (`:171-259`): if the nearest is closer than 100 px, move to a point tangent to it at 100 px (`GeomTangentPoint`), blended 25..75 % (`25 + random(50)`) with the point mirrored away from the two bullets' midpoint (`GeomMirrorPoint`). Merlin's spell is a `#teamBullets` object of team `#aldevar` (act_spell inherits `teamRole #teamBullets`), **including while it is still charging over Merlin's head**, so a mage within 100 px of a charging Merlin runs away.
2. **Keep distance from enemies**: `findNearestEnemies` (2 nearest hated `#teamMembers`), `runFromObjects(nearest, pEnemySafeDistance = 100)` (`:80-156`): if the nearest is closer than `safeDistance` move to the point mirrored away from the two nearest enemies' midpoint at that distance. `safeDistance` becomes `enemy.attack.reach + 25` when that reach is > 100 and not 9999 (`:100-103`); Merlin's blast has 9999 so it stays 100.
3. **Close in**: `runTowardsObject(target)` (`:158-169`): walk straight at the target while `dist^2 - 100^2 > 20^2` (`pBufferDistance = 20`); i.e. approach until about 102 px away.
4. Otherwise `stopMoving()`.
- `characterModeChanged` (`:46-58`): `#dead`/`#reel` -> spell caster mode `#none` and `cancelMoveToLoc()`; `#walk` -> back to `#moveToOptimumPosition`. `pEnemyGoodShootingDistance = 150` and `pRefreshDestinationCounter` are set but never read (dead data).
- Summary vs the ported goblin AI: no `idealAttackLoc` walk (reach always met), no `faceTarget`, charge/release instead of an attack strip, a kiting movement layer that keeps ~100 px from Merlin and sidesteps his spells. Being hit (`#reel`) while charging: `objAiCPU.characterModeChanged` sets AI `#dazed` (`objAiCPU.txt:116-135`) but does **not** cancel the spell; `cancelAttack` (`objAiAttack.txt:107-113`: `currentSpell.finish()`, `attackCancelled()`) is only called on `#noTargetFound` (`objAiCPU.txt:232-233`) or when `calcSpellTargetLoc` returns `#none`. After the reel the AI returns to `#findTarget` -> `#moveToAttack` -> `chargeMagic`, and `ensureSpell` reuses the existing half-charged spell (see Open questions for death while charging).

### 2b. Dwellings: objDwelling + modResidents

`objDwelling` (`script_objects/objDwelling.txt:5-29`) is an `objGameObject` (not a character, no AI) with modules `modAnimSet, modConstruction, modEnergy, modExperience, modFlasher, modGhost, modGrave, modListNode, modReel, modRelationships, modResidents, modScale, modStarReleaser`, flag `#objDwelling`. `objAICPUBuilder`/`modBuilder` are for builder units (goblinBuilder) that construct new buildings; they are not used by map-placed huts.

**Start**: `objDwelling.start -> startBuilding` (`:115-119`); `modConstruction.startBuilding` (`modConstruction.txt:103-109`): `preBuilt` defaults to `true` (`:19`), so a map-placed hut calls `buildingFinished` at once -> `internalEvent(#buildingFinished)` -> `startProduction()` (`objDwelling.txt:94-95`). (Not prebuilt = `#beBuilt` strip, energy grows from 1 as the strip plays; only for builder-made huts.)

**Production cycle** (`modResidents.txt:178-243`, params `:22-47`):
- `residentGroups` from data; `totalResidents` default **10** (`modResidents.txt:26`; goblinMageHut sets 5, goblinHut and orcHouse use 10). `pResidentsRemainingCounter`: `tim [0, totalResidents]`, `inc -1` (counts down).
- `startProduction`: pick a **random group** (`varRndRange(1, residentGroups.count)`, uniform), `groupSize = min(VarRndRange(group.groupSize), remaining)` into `pCurrentGroupSize` (`tim [0, n]`, `inc -1`), `timeToBuildSingle = VarRndRange(group.buildTime)`, `productionTime = pCurrentGroupSize * timeToBuildSingle` (`:185`, see Open questions: `pCurrentGroupSize` is the counter list, not the number), mode `#produceGroup` (the dwelling's strip becomes `#produceGroup`, `objDwelling.txt:55-68`; no such strip is exported, so it falls back to `stand`).
- `#produceGroup`: `Counter(pGroupProductionCounter)` each tick until fin -> `#awaitPermission`.
- `#awaitPermission`: `g.reservationsMaster.getPermissionToRelease(me, groupSize)` each tick (`reservationsMaster.txt:56-74`): granted iff `team.currentMembers + team.reservedSlots + numToRelease <= team.maxMembers` for **the dwelling's own team**; on grant it reserves the whole group. So a hut waits (indefinitely) until the whole group fits under the team cap. `maxMembers`: `#goblins` **16** (`tem_goblins.txt:8`), `#orcs` **11** (`tem_orcs.txt:8`). `currentMembers` counts only `#teamMembers` joins (`reservationsMaster.txt:124-149`), i.e. live characters in the active room (buildings do not count).
- `#releaseCountdown`: `pReleaseCounter.tim[2] = VarRndRange(group.releaseInterval)` (reset on entering the mode, `:98-107, 173-176`); on fin `releaseResident()` + `postReleaseResident()`.
- `releaseResident` (`:146-171`): `newActor(typ = group.typ, startLoc = dwelling.getLoc(), useOffset = false)` -> the resident spawns **on the dwelling's reg point**, with its own data (so its own `#team`), subject to the normal spawn placement check (tile hard edges only). If the dwelling's `experienceLevel > 0`, `newUnit.setStartingLevel(random(level))`. Then `CounterOnce` on group size and remaining, `objectReleasedFromReservation` (-1 reserved slot), and **`me.big.levelUp()`**: the dwelling gains a level per released resident (`modExperience.levelUp`, `modExperience.txt:201-221`: releases an experience star and plays `"level_up"` since `pReleaseStarOnLevel` defaults true, `:48`; `levelUpEnergy` changes max energy by `energy * energyIncPercentage / 100` = **-1 % of starting energy per release**, `modEnergy.txt:55, 169-181`). Later residents therefore start at random levels 1..n (each level: `strength +0.1`, one random mana stat up, energy +1 %, `modCharacterAttackProperties.txt:132-153`, defaults `:63-72`).
- `postReleaseResident` (`:129-135`): group not empty -> `#releaseCountdown` again (new random interval); else `produceNextGroupOrDie`: if all `totalResidents` are released -> `noMoreResidents()` -> **`objDwelling.noMoreResidents -> startDeath()`** (`objDwelling.txt:105-107`): **an emptied dwelling destroys itself** (loseAllEnergy, `#dead`, grave). Otherwise `startProduction()` for the next group.
- Timing (counters start at 1 and finish on reaching the length, so N-1 ticks): per group, production (see open question), then one release every `releaseInterval` ticks: goblinHut 25..45 / 30..50, goblinMageHut 20..50, orcHouse 30..60 / 40..60.
- `#residentTeamCategory` / `getResidentTeamCategory` (`modResidents.txt:90-92`, always `#enemies`) and `structAttack.residentTeamCategory` are for summon spells (e.g. mageOrc's `goblinSummon`), not for dwellings. There is no per-dwelling `#maxMembers`; the cap is the team's.

**Target, damage, death.**
- `teamRole #teamBuildings` (act_dwelling) -> it joins `pTeams[team].teamBuildings`. Attacks with `hits` containing `#teamBuildings` damage it: the player's energyBlast (`hits [#teamMembers, #teamBuildings]`) yes; goblinSword/orcSword too (irrelevant: they only hit hated teams). Target finding with `targetRoles [[#teamMembers, #teamBuildings]]` can pick buildings (when a team has both, `findTargetInTeam` picks members or buildings at random, `teamMaster.txt:815-837`); relevant for the player's auto-aim keys in the port.
- `objDwelling.takeHit` (`:130-136`) forwards to `objGameObject.takeHit` unless `#dead`: inertia 80 (hut) absorbs 80 % of the push, damage as for characters. It has `modReel`, so **a hit pushes the hut** and it slides with `frictionReel` (30,30) (orcHouse 85,85); `getAnimSym` maps `#reel` to `#stand` (`:61-63`). `#reelFinished`/`#outOfEnergy` -> `startDeath` if dead (`:90-103`).
- `energyRecoverDelay` default 1000 (`modEnergy.txt:28`), i.e. a dwelling regenerates 1 energy per 1000 ticks (effectively never). The port's OBJECT_DEFAULTS has no objDwelling entry (`*` default would apply).
- Death: `startDeath` -> `loseAllEnergy` if needed -> `goMode(#dead)`: plays `dieSound` (`:77-80`); `update #dead` waits for the current strip (`#dead` -> `grave` via modAnimSet) to loop, then `#finish` -> `setDead(true)` + `drawGrave()` (grave stamped into the room background, as for goblins; `graveOn` true). `modFlasher.flasherFinished` also leads to `#finish` (`:47-53`). On `#outOfEnergy` modResidents goes `#dead` and a pending reservation is cancelled on finish (`modResidents.txt:49-56`). Residents already released keep living.
- **Exits**: `isTeamDead` counts `teamMembers + teamBuildings` (`teamMaster.txt:1170-1183`), so **a living dwelling of a team whose `hates[1]` contains `#aldevar` keeps the room's exits closed**; its self-destruction after `totalResidents` releases (or its destruction) plus killing all residents opens them. The port's `exitsOpenFor` only counts characters (`src/sim/tick-combat.ts:353-355`, `isCharacter`), so it must include dwellings.
- **Object collision**: none. Dwellings add nothing to the tile collision map, and there is no character-vs-object blocking (combat note section 8), so Merlin and enemies walk through huts. `modExperience.attributeExperience` uses `calculateExperienceFromResidents` for dwellings (`modExperience.txt:100-110`); experience is not ported.

### 2c. Orc archer and orc fighter
Both use `objAiCPU` exactly like goblinArcher / goblinWarrior (section 3 of the combat note). Differences are data only, plus two data shapes the port does not accept yet:
- **Attack frame lists**: crossBow `animframe [2,4,6]` (three bolts per `weaponRanged` strip, each re-aimed with eyestrain 50 at the target's current position), orcSword `animframe [6,10,12]` (three melee impacts per swing). `modAttack.isOnAttackFrame` accepts a list (`modAttack.txt:577-621`).
- **`stallSpeed`** per actor: swordOrc 3, goblinMage 0.5 (objGameObject default 0.2, `objGameObject.txt:69`, `pMoveXY.setStallSpeed`). The port hard-codes `STALL_SPEED = 0.2` (`src/mr-open/mr-take-hit.ts:9`). A stallSpeed of 3 makes the reel end (stall count) as soon as the push drops to 3 px/tick, so sword orcs recover from hits much faster.
- Crossbow fire rate: `cooldown 8`, `dexterity 10` -> ready after 1 tick; bowOrc fires whenever the strip loops. `weaponTechnique -5` barely lengthens the strip (goblinArcher is -75).
- crossBolt: `damageMultiplier 4, power 0.7` (arrow 3, 0.5), `friction point(5,5)`, `recordInRoomState false`; `weight 1.6` only feeds `objMoveXY` gravity (`objMoveXY.txt:175`), unused like the arrow's.

## 3. Orcs vs goblins

- `tem_orcs.txt:3-8`: `#teamName: #orcs, #category: #enemies, #colour: rgb(0,255,0), #friends:[#goblins], #hates: [[#aldevar, #monsterSummon,  #karate, #magicalAlliance, #ninja, #undead, #scarlet, #village]], #maxMembers: 11`.
- `tem_goblins.txt:3-8`: same hates list, `#maxMembers: 16`, `#friends:[orcs]` -- **written without `#`**, so in Lingo `orcs` is an (undefined) variable and the list is `[<Void>]`; goblins do not formally list orcs as friends. This does not matter for combat: targeting and impacts only use `hates`, and neither team hates the other, so orcs and goblins never target or damage each other. `friends` is only used by `findNearest(#friendly)` and the team-override code.
- Both hate `#aldevar` at priority 1, so both block exits (section 2b).
- Orcs differ from goblins only in numbers and weapons: same AI classes (`objAiCPU`; the mageOrc uses `objAiCPUSpellCaster` like the goblin mage), same bullet class (`objBullet`) and same melee path. Much tougher: energy 300 (goblins 50/100 in data, 50/25 in the port's tuning), multi-hit weapon strips, walkSpeed 6/8 (goblins 3-4; halved by the 50 % friction as in the combat note), higher stallSpeed.
- **orcHouse belongs to team `#goblins`** (`act_orcHouse.txt:30`) while its residents are `#orcs`. Consequences: (1) its release permission is checked against the goblins' cap 16, and released orcs never increase `#goblins.currentMembers`, so the cap only bites through other goblins in the room -- the orc team cap 11 is never consulted; (2) the house blocks exits as a goblin building; (3) its `dieSound` is `"boulder_die"`. Likely a data quirk; keep it for fidelity or flag it.

## 4. Sprites

Frame files are `anm_<name>_<anim>_<delayTicks>_<frame>` under `gfx/<name>/` (sizes via `sips`). The port's converter (`tools/convert-assets.ts:162`) only reads `.bmp`, so `.tif` frames need converting (e.g. `sips -s format bmp`).

| `#name` | folder | strips (frames, delay) | size | missing / notes |
|---|---|---|---|---|
| `goblinMage` | `gfx/goblinMage/` | stand (1, 3), walk (8, 3), charge (4, 3), chargeWalk (4, 3), release (4, 1), releaseWalk (4, 1), grave (2, 1) | 16x16 | no `reel` strip (falls back to `stand`, as for the archer) |
| `goblinHut` | `gfx/goblinHut/` | stand (1, 3), grave (1, 3) -- **`.tif`** | 20x20 | no `produceGroup`, `beBuilt`; duplicates in `gfx/objects/goblinHut.tif`, `goblinHut_grave.tif` (+ `_lo`, `_test` variants), 20x20 |
| `goblinMageHut` | `gfx/goblinMageHut/` | stand (1, 3, `.bmp`), grave (2, 1, `.tif`) | 20x20 | no `produceGroup` |
| `bowOrc` | `gfx/bowOrc/` | only `anm_bowOrc_weaponRanged_02_10.bmp` (frame 10 of weaponRanged, delay 2) | 26x27 | **stand, walk, weaponRanged 1-9, grave all missing** |
| `swordOrc` | none | -- | -- | **no folder at all** |
| `crossBolt` | `gfx/crossBolt/` | fly (1, 1), land (1, 1) and a second `land_30_01` (delay 30) | 16x16 | `tif/cross_bolt.tif`, `tif/cross_bolt_in_earth.tif` are the sources (16x16) |
| `orcHouse` | none | -- | -- | **no folder**; candidates in `gfx/orc/`: `orc_barracks.tif` / `orc_barracks_grave.tif` (25x25), `orc_barracks02.tif` / `orc_barracks02_grave.tif` (40x40) |
| `mageOrc` | `gfx/mageOrc/` | only `stand_02_01.bmp` | 33x33 | rest missing (out of scope) |

Raw orc source art (not in `anm_` form) in `gfx/orc/`: `orc.tif`, `orcDark.tif`, `orcGrave.tif` (33x33 each), `Ocwa0001-0008.tif` (8 frames, 33x33, probably a walk cycle), `orc_squat.tif` + `orc_squat0002-0005.tif` (5 frames, 32x33, probably the crossbow kneel/fire), `orc_squat_dark0002.tif`, `cross_bolt*.tif`, plus `.psp`/`.lbm` sources; mirrored under `gfx/gfx/mr2_gfx/orc/` and `fanGameKit/gfx/mr2_gfx/orc/`. `gfx/blackOrc/` has a complete `anm_blackOrc_*` set (stand 1, walk 8, weaponMelee 9, grave 2; `act_blackOrc`, a different enemy) and `gfx/black_orc/` raw `Bofi000x.tif` frames; these could stand in for swordOrc art. The actual bowOrc/swordOrc/orcHouse cast members were evidently in the `.dir` cast but not exported to `gfx/`.

## 5. Sounds

Names only; none of these are exported as files in `merlin_open_30_speedy_and _tvs/` (the fan kit has `fanGameKit/sfx/mr2_sfx/OrcFire.wav`).
- goblinMage (energyBlast): `"spell_release"`, `"spell_explode"`; no dieSound (`objCharacter.txt:32` default `#none`).
- goblinHut, goblinMageHut: `dieSound "goblin_hut_die_02"`; orcHouse: `"boulder_die"`. Every resident release: `"level_up"` (`modExperience.txt:205-209`).
- bowOrc: crossBow `"orc_fire"`; `dieSound #none`. swordOrc: orcSword `"skeleton_fire"` (same as goblinSword); dieSound default `#none`.

## 6. Port plan hints

Data-only (copy `act_` files into `assets/actors/`, add sprites, tune) once the small resolver/engine gaps are closed:
1. **bowOrc** (+ crossBow, crossBolt): data-only apart from the `animFrame` list gap (`AttackDef.animFrame: number[] | null`, `onFreshFrame` membership). Art is the blocker (one frame exists).
2. **swordOrc** (+ orcSword): same `animFrame` list gap, plus a per-actor `stallSpeed` ActorDef field replacing the hard-coded `STALL_SPEED` 0.2. No art folder.
3. `tem_orcs` -> `assets/teams/orcs.txt`: data-only (the team parser already handles goblins).

New behaviour code, smallest first:
4. **goblinMage** (small-medium): an AI caster in `tick-ai.ts`: when `attack.type === 'magic'`, in `moveToAttack` with cooldown ready, spawn/charge the spell each tick with the existing `chargeLimits`/`chargeStep`/`alignSpell` (reuse the player's spell actor path, `team = caster team`), release at the target's current position when charge reaches max, wait for the `release` strip, cooldown 30, retarget. Plus the `updateMoveToOptimumPosition` movement layer (dodge nearest hated bullet/spell within 100 px, keep 100 px from nearest enemies, close to ~102 px of the target, else stop), needing "nearest hated bullets" and "2 nearest enemies" queries and the `GeomTangentPoint`/`GeomMirrorPoint` helpers. Anim names `charge/chargeWalk/release/releaseWalk` when moving. Explosion and friendly-fire rules already work.
5. **goblinHut / goblinMageHut** (medium): a new non-character actor kind (`objDwelling`): no AI, `teamRole teamBuildings`; state machine `produceGroup -> awaitPermission -> releaseCountdown` with counters, team caps (`maxMembers` in TeamDef, `currentMembers` + reservations), spawning residents at its position, self-destruct after `totalResidents`, damage via `applyHit` (inertia 80, reel slide with frictionReel), death with dieSound, grave stamp, and inclusion in `exitsOpenFor`, spell-explosion victims (`hits` teamBuildings) and the player's auto-target. Needs `objDwelling` in `SPRITE_OBJ_TYPES` and OBJECT_DEFAULTS (`energyRecoverDelay 1000`). Resident level-ups/stars can be skipped (experience is not ported).
6. **orcHouse** (medium, after 5 + orcs): same dwelling code; its third group is `mageOrc` (objAiCPUSpellCaster + `goblinSummon`, a summon spell with random multistage charge, not in this slice). Either port mageOrc/goblinSummon or drop that group via tuning. No art.

## 7. Open questions

- **Production time bug?** `productionTime = pCurrentGroupSize * timeToBuildSingle` (`modResidents.txt:185`) multiplies the counter *property list* (`[#theCount, #tim, #inc, #fin, #looped]`), not its count. Lingo list arithmetic would yield a list, and `pGroupProductionCounter.tim[2]` then compares a number against a list in `Counter()`. What the original actually did (immediate release? never?) is unknown; the intent is clearly `groupSize * buildTime` ticks (goblinHut 105..350, goblinMageHut 50..120, orcHouse 52..420). Needs the user's memory of how fast huts spawn.
- **orcHouse on team `#goblins`**: deliberate or a data slip? It changes the cap (goblins 16, orcs uncapped) and sounds `boulder_die`.
- `tem_goblins` `#friends:[orcs]` without `#`: harmless for combat; the port's team parser should not choke on it (it already loads goblins).
- **Mage death while charging**: nothing in `objAiCPUSpellCaster`/`objAiCPU.characterModeChanged` cancels the half-charged spell on `#die`/`#dead`; presumably `modAttack`/`objCharacter` or `objSpell`'s owner `#leaveGame` notification cleans it up (not traced). Decide in the port: remove the spell with its caster.
- Whether the mage's charging spell over **another** caster also triggers bullet-dodging (team `#goblins` bullets are not hated by goblins, so no); and whether Merlin's charging spell (team `#aldevar`, `#teamBullets`) really registers in `pBulletMap` before release (assumed yes: `joinTeam` happens in `objGameObject.init`).
- Hut push: dwellings have `modReel` and `inertia 80`; confirm with the user that huts visibly slide when blasted (orcHouse barely, frictionReel 85).
- `produceGroup` / `beBuilt` strips are not exported; did huts animate while producing?
- Missing art for bowOrc (9 of 10 weaponRanged frames, stand/walk/grave), swordOrc and orcHouse: re-export from the `.dir` cast, or build from `gfx/orc/` raw frames / blackOrc.
- Residents spawn exactly on the hut's reg point with `useOffset false`; if that tile is solid the spawn silently fails (counters still advance? No: `releaseResident` counts the resident even when `newActor` returns `#none` -- `newUnit.setStartingLevel` would then error only if level > 0). Treat a failed spawn as consumed.

## 8. Port status (2026-09-27)

Ported in the enemy slice (progress and decisions: `docs/plans/2026-09-27-enemies-progress.md`). Checked
against the Lingo in the owner's reference bundle (`mr-open-reference.zip`, same paths as above), which
settled several guesses in the sections above:

- **Spell caster movement** (`objAiCPUSpellCaster.txt:61-297`, `GeomTangentPoint()`, `GeomMirrorPoint()`,
  `teamMaster.findNearest` `:374-470`): `GeomMirrorPoint(averageLoc, myLoc, safeDist)` returns a point
  `20 * safeDist` from the average position, through and past the caster (a run *direction*, the goal
  itself is never reached). `GeomTangentPoint(bulletLoc, myLoc, dir, safeDist)` is the bullet position
  minus `(u.y * 2s * dir1 + u.x * s/5, u.x * 2s * dir2 + u.y * s/5)` with `u` the unit vector caster->bullet
  and `(dir1, dir2) = (-1, 1)` for `dir > 0`, else `(1, -1)`. With one bullet `dir = 1`; with two, `dir`
  comes from the second bullet's offset multiplied per axis by the caster->bullet vector, and the
  destination is `PointValRange(25 + random(50), [tangent, mirror])` (that percentage toward the mirror
  point). The `dif = -1` typo leaves `dir` void, which `GeomTangentPoint` treats as `dir <= 0`.
  `findNearest` searches the unit/bullet map in tile shells (own tile, then rings 1..3) and stops at
  the first shell that found anything, then keeps the 2 closest by Euclidean distance. Ported in
  `src/mr-open/mr-spell-caster.ts`.
- **Strip frame order** (`animStripMaster.txt`): frames are appended in cast member order; the frame
  number in the name is never parsed. The converter sorts by frame number, which gives the same order
  for every shipped sprite. Two members with the same frame number both play (crossBolt `land` is
  `land_01_01` then `land_30_01`).
- **Residents** (`modResidents.txt`, `reservationsMaster.txt`): as described in §2b. The production-time
  expression is confirmed as `pCurrentGroupSize * timeToBuildSingle` with `pCurrentGroupSize` the counter
  property list, so the open question stays open.
- **Dwelling strips** (`objDwelling.getAnimSym`): `#produceGroup` while producing, else `#reel -> #stand`.
  No dwelling has a `produceGroup` strip in the cast (only `fangBunnyPortal` does), so huts show `stand`.
- **Art**: the cast has complete bowOrc, swordOrc, orcHouse, crossBolt and mageOrc strips (§4's missing
  art was only missing from the loose `gfx/` folders).
