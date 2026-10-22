# Engine mechanics: Merlin's spells and weapons

How Merlin Open gives Merlin his spells (scroll pickups), keeps them (modWeaponManager), lets the
player pick one (the spell keys and the weaponSelector palette), and what each player spell does.
Lingo paths are under the archive's `casts/` (`script_objects/`, `master_objects/`, `data/`); line
numbers count the exported file's lines. The energy blast itself (charge, release, explosion) is in
`engine-mechanics-combat.md` §5; summons, heals and exploding bullets for enemies are in
`engine-mechanics-enemies-3.md`.

## 1. Scrolls

- Every spell is an `act_<name>` data file with `#objType: #objScroll`, `#AiType: #objAiPowerUp`,
  `#team: #collectables`, `#minimapStatus: #spe`, `#member: member("<name>_scroll")`,
  `#collectSound: "collect_powerup_01"`, `#character: #<name>` and an `#attack` list (e.g.
  `act_cBlast.txt:3-40`). The `#attack` is the weapon the scroll gives; the file is never a weapon
  object itself.
- Merlin's scrolls (merlinOpenObjects tiles 22-30, 38, 39; merlin4Objects 10-12, 32, 40, 101, 103,
  104): armySummon, energyMines, energyPulseSpell, cBlast, energyPunch, monsterSummon, healBlast,
  arcticBlast, energyBeamSpell, merlinSword, gmg, and energyBlast. `act_darkBlast` is an objScroll
  too (the dark mage's weapon) but no objects tileset places it.
- `objScroll` (`objScroll.txt:6-39`) is an `objPowerUpWriting`: the pickup rules are the potions'
  (`engine-mechanics-potions.md` §2: touch, writing fade, collect sound, no second collection, not
  recorded in the room once collected). `collected` (`:32-38`) calls
  `collector.newScrollCollected(character, attack.duplicate())`.
- The writing member is `<character>_writing` (`objPowerUpWriting.displayWriting`, `#nameBased`),
  e.g. `cBlast_writing` ("Energy Blast c"), shown where the scroll lay while it fades.
- `objPlayerMerlinCharacter.newScrollCollected` (`objPlayerMerlinCharacter.txt:163-172`): for
  anything but `#gmg`, `addWeapon(scrollType, theAttack)` and `increaseEnergy(pBonusEnergy)` (+25);
  `#gmg` calls `gmgCollected` instead; then `startTempInvince()` either way.

## 2. Merlin's weapons (modWeaponManager)

"Spells count as weapons" (`modWeaponManager.txt:5`). `pWeapons` is a property list from weapon
symbol to attack list, kept in the order the weapons were added:

- `start` (`:53-63`): `initNaturalAttack` adds the character's own `#attack` under its name
  (`#punch` for Merlin, `act_player.txt`), then `initStartingWeapon(params.weapon)` (`#none` for
  Merlin in the data).
- `addWeapon(weapon, attack)` (`:141-153`): `pWeapons[weapon] = attack` (a symbol already there is
  replaced in place, not appended again), a fresh cooldown counter that starts ready (`:157-203`;
  advanced by agility for melee, dexterity for ranged, mana_regeneration for magic), and
  **`setCurrentWeapon(weapon)`**: a new scroll is selected at once.
- The key is the scroll's `#character`, not its attack's `#name`: cBlast's attack is named
  `#energyBlast` (`act_cBlast.txt:28`) but it is kept, selected and drawn as `#cBlast`.
- `setCurrentWeapon` (`:305-317`): for a weapon whose `animType` is not `#magic`,
  `cancelAttack()` first; then the attack list is copied onto the character (`setAttack`). A spell
  already charging keeps its own copy of the old attack (`objSpell.setSpellProperties`) and is
  released as usual.
- `updateCooldowns` (`:333-341`) steps every weapon's counter every tick, the idle ones included;
  `getCooldownFin` and `resetCooldown` use the current weapon's.
- `selectSpell(num)` (`:287-303`): the num-th weapon of `getWeapons(#magic)`, the weapons whose
  `animType` is `#magic`, in pWeapons order; nothing when there are fewer.
- `getWeapons(#nonMagic)` (`:393-415`): the others (the punch, energyPunch, merlinSword).

## 3. Choosing a weapon

**Keys** (`objAiPlayer.interpretGameKeys`, `objAiPlayer.txt:140-197`, run every tick in
`#attack`, `#playerControl`, `#freeze` and `#release`): `#spell1`..`#spell9` -> `selectSpell(1..9)`,
`#weaponSelector` -> `displayWeaponSelector()`. In `bnd_wasd.txt:15-25` those are Mac key codes:
`#weaponSelector: 12` (Q), `#spell1..#spell9: 18..26`. Codes 18-21 are the keys 1-4, but 22-26
are 6, 5, =, 9, 7: the bindings were evidently meant as the number keys 1-9 in order. There is no
mouse wheel and no "next weapon" key. (`#gmg: 14` is E, `#army: 8` C, `#wizard: 3` F and
`#wizardSelector: 15` R, for the golden machine gun, modAutoSummon and the in-game wizards.)

**The weaponSelector palette** (`modWeaponSelector.txt`):

- `displayWeaponSelector` (`:116-165`): returns at once while already displayed. For each palette
  type in `structWeaponSelectorPaletteTypes` = `[#magic, #nonMagic]` (`structMaster.txt:982-988`)
  it builds an image of that type's weapons side by side (`constructImage`, `:83-114`: one icon per
  weapon, left to right in pWeapons order, no gaps) and opens an `objPalette` on it at
  `mouseLoc + getPaletteOffset(type)`: x centred on the mouse (`-width / 2`), y
  `structWeaponSelectorPaletteOffsets` = `#magic: -20`, `#nonMagic: 10` (`structMaster.txt:968-978`),
  i.e. the spells in a row 20 px above the pointer, the other weapons 10 px below it. A type with
  no weapons gets no palette.
- The icons are the gfx members `<weapon>_ws` (`getWeaponIcon`, `:187-190`), 18x16 each (the
  palette definition's `tileSize | point(18,16)`, `:30`): energyBlast_ws, cBlast_ws, ..., punch_ws.
- `objPalette` (`objPalette.txt`) is an `objTileSetKey` grid: the yellow box (`yellowBox_ws`)
  follows the pointer, the green box (`greenBox_ws`) marks the selection, initially the current
  weapon (`getInitialGridSelection`, `modWeaponSelector.txt:167-176`). A click on an icon calls
  `commandIssued(weapon)` -> `setCurrentWeapon(weapon)` and closes the palettes (`:76-81`).
- `pTimer` (`:35-36`, `CounterNew`, `tim[2] = 60`) closes them after 60 ticks (2 s) whatever
  happens (`updateTimer`, `:215-221`); it is only reset when the palettes open.
- Nothing else on the gameScreen shows the current weapon (the score's marks,
  `engine-mechanics-hud.md` §2: `prg_wizardmaster` (72, 0) and `prg_gmgmaster` (90, 0) are the
  wizard and golden machine gun displays).

**Melee and ranged weapons on the player** (`objAiPlayer.playerAttackCharge`, `:265-289`): the
held button calls `attack()` every tick; for melee and ranged attacks that starts the attack strip
(`ensureMode(attack.animType)`, AI `#attack`) whenever the cooldown is ready, so they autofire while
held; `playerAttackRelease` does nothing for them (`:291-302`). The hit lands on the strip's
`animFrame` (`objAiAttack.updateAttack`), `performMeleeAttack` -> `teamMaster.impactMeleeAttack`:
every unit of a hated team whose sprite rect holds the strike point (combat notes §4). When the
strip loops, `attackFin(#completed)` -> `#playerControl` and `goMode(#walk)` (`:31-40`).

## 4. Charging: what the spells add

`modAttack` (`modAttack.txt:83-181`), on top of combat notes §5:

- `calcAttackChargeStart` (`:123-157`): `min(chargeStart + mana_burst, chargeMax)`, then
  `if pChargeStart <> #none then chargeStart = min(pChargeStart, attack.chargeStartMax)`: it takes
  the attack's own `chargeStart`, not the sum. What `min(number, #none)` gives in Lingo is not
  certain; the port keeps the sum when `chargeStartMax` is `#none` (every spell but the two summons;
  so Burst potions raise the energy blast's start, as before), and with a number (armySummon 8,
  monsterSummon 14) takes `min(chargeStart, chargeStartMax)`: mana_burst does nothing for summons.
- `chargeSpeedMax` caps `chargeSpeed * mana_flow` (army summon 0.4, monster summon 1).

**Multistage spells** (`modSpellMultistage.txt`), the summons, on every charge step (`#charge` ->
`chargeMultistage`, `:73-82`):

1. `selectPayload` (`:316-341`): the last stage of `#multistage` whose charge the spell has reached;
   with one, the payload function becomes `#payloadFunctionNonBlank` (`#same` = unchanged).
2. With `explodeFunction #summonUnit`, `obtainPermissionOrHalt` (`:236-267`): the first time a
   stage is reached it asks `reservationsMaster` for one slot. A spell of team `#aldevar` asks on
   the team named by `#residentTeamCategory` (`getPermissionToReleaseTeam`, `reservationsMaster.txt:76-98`:
   members + reserved + 1 <= `maxMembers`), others on their own team. Refused, `chargeReinIn`
   (`:84-90`): the charge drops to the first stage's charge - 1 (a blank) and `#chargeLimited`;
   the charge then climbs again and is reined in again, so it stays below the first stage.
3. For `#armySummon` only: `updateAvailableUnits` (`:395-403`) finds `pTopAvailable`, the highest
   stage whose unit type has a unit in the reserve (0 if none). Once the charge reaches that stage
   (or any stage, with none available) `chargeReinInToAvailable` (`:92-100`) holds it at the next
   stage's charge - 0.1. Stages below the top are not checked: a stage without a reserve unit
   summons nothing (`armyMaster.createUnit` returns `#none`).
4. `displayIcon` (`:151-159`): an `objSpellIcons` over the spell (`objSpellIcons.txt`) shows frame
   `pCurrentPayloadNum` of the strip `anm_spellIcons_<spell name>`, blend 100 when the unit is
   available (`armyMaster.checkUnitAvailability`: always, except an army summon stage without a
   reserve unit) else 50; it fades with the explosion.

The player's AI does not release on `#chargeLimited`: `objAiAttack.eventNotification` only sets the
charge counter to the reined-in charge (`objAiAttack.txt:190-205`).

## 5. The spells

`#explodeFunction`, `#releaseFunction` and `#payloadFunction` decide what a spell does; everything
else is the energy blast's charge, flight and explosion. `objSpell.goMode(#explode)`
(`objSpell.txt:145-161`) runs `teamMaster.impactAttack` over the attack's teams
(`targetAllegiance`) and then `#explode` -> `modSpellMultistage.doExplodeFunction` (`:161-169`).
Charge figures below are for Merlin at the start (burst 1, capacity 10, flow 1, magic limit 100 %).

| scroll (key) | data | what it does | at the start |
|---|---|---|---|
| energyBlast | `act_energyBlast.txt` | the blast (combat notes §5) | charge 12.5 |
| cBlast | `act_cBlast.txt:6-34` | a blast with `chargeMaxModifier 0`, `chargeMaxBasic 999`, `chargeSpeed .1`, `power 0.5`, no magic limit | charges 0.1 per tick up to 999 (no mana stat but flow matters): a long charge for a huge blast |
| healBlast | `act_healBlast.txt:6-35` | `targetAllegiance #friendly`, `payloadFunction #takeHeal`, `chargeMax 100`, `cooldown 50`, `spellSpeed 30`, heal sounds | heals the friendly units (Merlin too) in the splash by 2 x the push; charge 10 |
| arcticBlast | `act_arcticBlast.txt:6-35` | a blast (`chargeSpeed .25`, `power .75`) with `payloadFunction [#takeFreeze, #takeHit]`, `glowTeal` | freezes and hits; charge 12.5 in about 46 ticks |
| energyPulseSpell | `act_energyPulseSpell.txt:6-34` | `releaseFunction #fireBullets`, bullet `#energyPulse`, `chargePerUnit 2`, `fireDelay 5`, `cooldown 0` | 6 pulses from charge 10 |
| energyBeamSpell | `act_energyBeamSpell.txt:6-36` | `#fireBullets` with `beam true`, bullet `#energyBeam`, `chargePerUnit 5`, `fireDelay 6.75`, `chargeMaxModifier 1.5`, `cooldown 0` | 4 beam strikes from charge 15 |
| energyMines | `act_energyMines.txt:6-35` | `explodeFunction #depositMines`, `chargeExplodeFactor 1`, `chargePerUnit 10`, `power 1` | a small blast and 1 mine (charge 10) |
| monsterSummon | `act_monsterSummon.txt:6-51` | `#summonUnit`, stages `summonArcher 12, summonWarrior 15, summonOrc 20, summonBoulder 25, summonGolem 31`, team `#monsterSummon`, `chargeStart 8` (`chargeStartMax 14`), `chargeSpeed .6`, `chargeMax 37`, `chargeMaxModifier 1.2`, blank and stage payload `#takeHit` | charge 9 to 12: only the archer stage (warrior from capacity 12.5) |
| armySummon | `act_armySummon.txt:6-48` | `#summonUnit` from the reserve army, stages `warrior 10, archer 15, monk 20, dwarf 25, kingInGame 32`, `targetAllegiance #friendly`, blank payload `#armyTeleportOut`, stage payload `#none`, `chargeStart 0` (`chargeStartMax 8`), `chargeSpeed .4` (max .4), `chargeMax 38`, `chargeMaxBasic 35` | charge 0 to 38, 0.4 per tick |
| energyPunch | `act_energyPunch.txt:6-18` | melee `#magicMelee`, frame 3, `power point(3,1)`, `damageMultiplier 1.75`, `cooldown 0` | push (46, 15), 107 damage before inertia |
| merlinSword | `act_merlinSword.txt:6-20` | melee `#weaponMelee`, frame 3, `power point(.5,.5)`, `damageMultiplier 16`, `collisionLoc point(16,1)` | push (4, 4), 128 damage before inertia |
| (punch) | `act_player.txt` | the natural attack, `#naturalMelee` frame 3, `power point(2,0)` | push (16, 0), 16 damage |
| gmg | `act_gmg.txt` | the golden machine gun: `gmgCollected`, not a weapon | not ported (open item) |

Details:

- **Freeze** (`modFreeze.txt:70-103`, `CallPayloadFunction` order: `#takeFreeze` sees the push before
  the victim's inertia scales it in `#takeHit`): the first freeze halves the walk speed (CPU
  `walkSpeed`; with modNavMode, Merlin's acceleration) and starts a counter at 999 of 1000; every
  freeze subtracts `(|vx| + |vy|) * freezeMultiplier * 4`, so a unit stays frozen for about
  `1 + 4 * |push|` ticks (more with every hit while frozen); `defrost` restores the speed. With the
  attack's `glowTeal` the unit glows teal while frozen. The frosty monk's `freezeBlast` and the ice
  boulder carry the same payload (`act_freezeBlast.txt`, `freezeMultiplier 3`).
- **Pulses and beams** (`modFireBullets.txt`): on `#spellReleased` with `releaseFunction
  #fireBullets` the spell does not fly; it goes `#fireBullets` where it is and every `fireDelay`
  ticks (`Counter` over `[1, fireDelay]`) calls `fireBullet` (`:30-51`): the charge drops by
  `chargePerUnit` (the sprite shrinks with it) and a bullet goes; when the charge would fall below 0
  that last bullet is fired and the spell is gone. So a spell fires `floor(charge / chargePerUnit) +
  1` bullets, each aimed at its owner's target loc at the moment of firing (`getTargetLoc` ->
  `owner.getTargetLoc()` = the mouse for Merlin, `objAiPlayer.txt:53-55`):
  - `performRangedAttack` (`modAttack.txt:721-811`) from the spell's loc: the attack says
    `#throwType`, not `#firingType`, so it is `#proportional`: velocity = distance / 10.
    `energyPulse` (`act_energyPulse.txt`) is an `#explode` bullet: `explodeCharge 10`, `power 1`,
    `damageMultiplier 5`, friction 6 %, exploding when it hits its target or stalls (combat notes and
    enemies-3 "Exploding bullets"). Its target is the `findTarget` fallback (the spell has none), the
    nearest hated unit.
  - `performBeamAttack` (`modAttack.txt:623-718`): the target loc moved by `random(20) - 10` on each
    axis, an `energyBeam` bullet created there with no velocity and `setBeam(dist, distXY)`
    (`objBullet.txt:239-246`: the sprite stretched to the distance from the spell, turned to the
    angle). It stalls at once and explodes (`#bulletLanded`): `explodeCharge 1`, `power .25`,
    `damageMultiplier 10`, sound `spell_release`. A beam strike only hurts what stands under it.
- **Mines** (`modSpellMultistage.depositMines`, `:124-149`): on exploding, `charge / chargePerUnit`
  `act_energyMine` actors (`objMine`) at the spell's loc +- `VarRoughly(charge / 2)` on each axis,
  owned by Merlin; a solid tile cancels one. `objMine.txt`: `#stand` for `timeToPrime` 30 ticks,
  then `#primed`, checking every `timeToCheck` 3 ticks whether the nearest hated unit
  (`teamMaster.findTargetWithin`) is within `triggerRadius` 20 px; then `#mineTriggered` ->
  modExploder: `explodeCharge 50` (radius 25), `power 1.5`, `damageMultiplier 5`, `spell_explode`
  at 50, the `explode` strip, then gone (`dieOnExplode`). Mines are team `#aldevar`, role
  `#teamMines`: nothing targets them, they do not count as units, `recordInRoomState false`.
- **Summoning** (`modSpellMultistage.summonPayload`, `armyMaster.createUnitFromSummonSpell`,
  `armyMaster.txt:80-149`): `createUnit(spell team, payload, spell loc, spell name)`; a new actor of
  the payload type at the spell's loc (no offset; a solid tile cancels it). For the army summon it
  must find the unit in the reserve (`lookupArmyDetails`), else nothing; found, the unit gets the
  saved details (`restoreArmyDetails`: experience and stats, not energy: a returning unit is fresh),
  `armyTeleportIn` and is taken off the reserve (`restoreUnitToCombat`). The monster summon's units
  (`act_summon*`) are new team `#monsterSummon` units (team cap 3), reel-proof, without tile
  collision; they do not teleport.
- **The reserve army** (`armyMaster.pReserveArmy`, by team and type): filled only by
  `modArmyUnit.armyTeleportOut` (`modArmyUnit.txt:57-78`) once the teleport has played
  (`#teleportOutFinished` -> `recordUnitDetails`, `leaveGame`). Teleporting out happens (a) to a
  friendly unit hit by an army summon blast with no stage reached (payload `#armyTeleportOut`;
  `teleportable` false for Merlin and ghosts), (b) to a `#leaveWhenFinished` unit when its AI finds
  no target (`objAiCPU.txt:232-237`: the room is clear or no hated team is left). Every ally has
  `leaveWhenFinished: true` (`act_warrior`, `act_archer`, `act_monk`, `act_dwarf`,
  `act_kingInGame`), so a summoned army fights and then teleports back into the reserve.
- **The army key** (`modAutoSummon.summonArmy`, `modAutoSummon.txt:34-104`, from the `#army` key in
  `objAiPlayer.interpretGameKeys`, `objAiPlayer.txt:153-155`; C in the original): summons the whole
  reserve at once, with no spell, mana or charge. `availableSlots` = `reservationsMaster.
  getAvailableSlots(team)` (`maxMembers - currentMembers - reservedSlots`, no team override
  halving; `#aldevar` has 12, Merlin among the members); 0, or no reserve list for the team: nothing.
  The types are Merlin's `#armyMembers` (`act_player.txt:21`: warrior, archer, monk, dwarf,
  kingInGame). `slotsPerUnit` = `availableSlots / 5` (integer division), or `/ 3` when the slots
  do not cover every type ("drop the higher units"), at least 1. For each type in order: as many
  as `min(slotsPerUnit, units of the type in the reserve, slots left)`, each by
  `armyMaster.createUnitNum` (`armyMaster.txt:110-136`): a new actor at the mouse loc with
  `locv + random(30) - 15` (the code sets `locv` twice and never `loch`), the saved details,
  `armyTeleportIn`, off the reserve. A refused actor (solid tile) or no free slot left `exit`s the
  handler; so does a type with no reserve list at all (`reserveTeam[typ] = void`). So with 11 free
  slots every type gets at most 2 units, however many warriors wait. No sound of its own (the
  teleports have none); `displayNextSummons` redraws the army display.
  The original scroll brings no units: the army comes from allies on the map.
- **Teleports** (`modTeleport.txt`): 15 frames; in: the sprite starts 1000 px tall and shrinks to
  its member height with its bottom on the floor while fading in; out: it stretches to 1000 px while
  fading out. Collision detection is off meanwhile.
- **The dwarf** (`act_dwarf.txt`, `objAICPUBuilder.txt`, `modBuilder.txt`, `modConstruction.txt`):
  `unitToBuild [#dwarfTower]`, `buildOne true`, `buildRate 100`. On start its AI goes
  `#lookForBuilding`, and once no teleport plays `#walkToBuilding` -> `startBuilding`
  (`objAICPUBuilder.txt:187-236`): an unfinished dwarf tower of its team is continued; a finished one
  (with `buildOne`) means nothing to build; otherwise a new `dwarfTower` is created 32 px to its
  right with `preBuilt false` (a solid tile cancels it). The tower goes `#beBuilt`
  (`modConstruction.startBeBuilt`, `:91-100`): energy 1, its `beBuilt` strip (46 frames) paused.
  The dwarf (`#build` mode, standing beside it, `modBuilder.alignToBuilding`) adds `buildRate` per
  tick, each 100 advancing the tower one frame and adding 1/46 of its energy
  (`updateBuild`, `objAICPUBuilder.txt:259-282`, `advanceBuildFrame`); on the strip's loop the tower
  is finished (`#buildingFinished`) and fires axes, and the dwarf turns to fighting (throwing its
  own axes). Map-placed towers and every other unit are `preBuilt`.
- **The tower's axe** (`act_towerAxe.txt`: `power 50`, `damageMultiplier 10`, `hits [#teamMembers,
  #teamBuildings]`, `collideWithTarget false`, `splashDamageOn true`, `splashGraveOn true`,
  friction (9,9)) is thrown `#proportional` (velocity = distance / 10), so with 9 % friction it
  comes to rest about 1.1 times the distance out. It never hits on contact
  (`objBullet.checkCollisionWithTarget` returns false). When it stalls, `goMode(#land)` ->
  `modSplashDamage.internalEvent(#land)` -> `impactSplashDamage` -> `teamMaster.impactAttack`
  (`modSplashDamage.txt:129-153`): every unit of a hated team in the hit roles with
  `GeomDistSqr(unit loc, axe loc) < power^2` (`calcAttackHitSplash`, `:65-83`; a #bullet's search
  radius is `power / tileSize`, `modAttack.calcAttackDist`), i.e. within 50 px reg point to reg
  point. The push is `calcCollisionVectSplash` (`:87-105`): `CollisionCalcVect(targetLoc,
  attackLoc, power)`, which is declared `(attackLoc, targetLoc, attackPower)`: the locs are passed
  the other way round, so the vector points from the unit toward the axe, of length
  `power - dist` (linear falloff to 0 at 50 px). It goes through the payload functions once
  (`#takeHit`, times `damageMultiplier` 10), with no second takeHit as a contact hit has.
  `splashGraveOn` stamps the axe's grave image where it landed (`drawSplashGrave`).

## Port

- Rules: `src/mr-open/mr-weapons.ts` (modWeaponManager: order, current weapon, selectSpell),
  `mr-weapon-selector.ts` (the palettes' layout and timer), `mr-spell.ts` (charge start with
  chargeStartMax, stages, rein-in, stage payload functions), `mr-army.ts` (the reserve, the teleport
  look), `mr-freeze.ts`, `mr-mine.ts` (mines and modFireBullets timing), `mr-builder.ts`. The
  scroll and spell fields are on `AttackDef` (`payloadFunctionNonBlank`, `residentTeamCategory`,
  `chargeStartMax`, `releaseFunction`, `chargePerUnit`, `fireDelay`, `beam`, `glowTeal`,
  `freezeMultiplier`) and `ActorDef` (`leaveWhenFinished`, `teleportable`, `unitToBuild`,
  `buildRate`, `buildOne`, and the remake's `startingArmy`).
- Tick: `tick-weapons.ts` (scroll collected, weapon keys, every cooldown), `tick-player-attack.ts`
  (charge and release, or a swing while held), `player-aim.ts`, `tick-spell.ts` (spells, fire
  bullets, payloads, summons, mines laid), `tick-mine.ts`, `tick-army.ts` (teleports, the reserve,
  `#leaveWhenFinished`), `tick-builder.ts`; the payload functions (`#takeHit`, `#takeHeal`,
  `#takeFreeze`, `#armyTeleportOut`) are `applyPayload` in `tick-combat.ts`, used by spells, exploding
  bullets, mines and melee strikes alike. `SimState.arsenal` and `SimState.army` hold Merlin's
  weapons and the reserve army.
- Drawing: `src/render/weapon-selector.ts` (the palettes, the current weapon icon), and in
  `scene.ts` the stage icons over summon spells, beams, teleports and the teal glow.
- Every spell in the table is ported but the golden machine gun (an open item; its scroll tile
  stays unspawned). Test content: `?map=spells_test` (`tools/make-spells-test-map.mjs`).
- Left out: experience in the army details (not ported anywhere), the in-game wizards, the axe's
  `splashGraveOn` stamp, the engine's 50 px splash test (see the remake decision), the monk's ghost
  (`reincarnateAs #monkGhost`, objAiCPUGhost), and the enemies that fire pulses, beams or lay mines
  (techMech, prestotolin, verdanlin; their actors are not copied yet).

### Remake decisions

- **Builders in the open world (owner request, 2026-10-22).** teamMaster.getBuildingOfType takes the
  team's first building anywhere, which in the continuous world can be one left far behind. There a
  builder only counts the team's buildings within Merlin's active range (wakeDistance): it continues
  the nearest unfinished one, or (buildOne) leaves a finished one be and fights; with none in range
  it demolishes the team's buildings of the type left behind (no grave) and starts a new one beside
  itself (`buildingInActiveRange`, `demolishOutOfRange` in `src/sim/tick-builder.ts`).

- **The dwarf tower's attack (owner requests, 2026-10-22).** Its axe now hits, as the engine does, every
  hostile whose reg point is within 50 px of where it lands (`towerAxe.splashRadius` 50; owner
  decision, after trying 16 and 24 px circles meeting the sprite rect) and leaves a crack where it lands: `splashGraveOn` (act_towerAxe) stamps the bullet's
  grave image, and the axe's grave frame is cut from the middle of the cracks actor's grave
  (`tools/copy-assets.ts`, 40x36 around its reg point). The tower also no longer drops an attack
  whose target dies during its long wind-up (strike frame 31): `keepAttackOnTargetLoss` (remake,
  engine default off; on for `dwarfTower`) remembers where the target last stood (`ai.attackAt`)
  and throws the axe there.

- **The dwarf builds slower and can leave mid-build (owner request, 2026-10-22).** `dwarf.buildRate`
  is 25 in `assets/tuning.json` (engine 100: one tower frame a tick), so the tower takes four times
  as long. A building ally (`leaveWhenFinished`) teleports out with the others once the fight is
  over (`fightOver`), leaving the tower unfinished; a later builder of the team continues it.

- **Frozen units attack slower (owner request, 2026-10-22).** modFreeze only halves walking speed. In
  the remake a frozen unit other than Merlin also plays its attack strips `frozenAttackSlowdown`
  times slower (default 3, every frame's delay multiplied), so its hits land at a third of the rate
  (`advanceAnim`'s `slow`, `attackSlowdown` in `src/sim/tick.ts`).

- **R summons at the nearest enemy (owner request, 2026-10-22).** The original's army key summons
  around the mouse. Unless Space is in the mouse cursor mode, R now summons around the nearest
  hostile on screen (the same choice Space's nearest mode makes), falling back to the mouse and then
  Merlin when no hostile is in sight (`InputSnapshot.armyAtNearest`, `stepArmyKey`).

- **Merlin's sword hits in a circle (owner request, 2026-10-22).** The engine's melee hit is a single
  strike point (`collisionLoc`, the sword's (16,1) from the reg point) that must lie inside the
  victim's sprite rect (`teamMaster.impactMeleeAttack`). A new attack field `strikeCircle`
  (`{ centre, radius }`, x mirrored by facing; engine default `null` keeps the point) makes a melee
  hit land on every target whose sprite rect meets the circle. `merlinSword.attack.strikeCircle` in
  `assets/tuning.json` is centre (6,1), radius 14: from 8 px behind the reg point (covering Merlin's
  16 px wide sprite) to 20 px ahead (the strike point's 16 plus about 20 %), 14 px up and down. The
  damage is unchanged: push (4, 4) from `power (.5,.5)` x strength 8, times `damageMultiplier` 16
  = 128 before the victim's inertia (a goblin warrior, inertia 30, takes about 90 of its 100).

- **The army summon's starting army (owner request).** Collecting the army summon scroll puts 2
  warriors, 2 archers, a monk and a dwarf into the reserve: `armySummon.startingArmy` in
  `assets/tuning.json` (engine default `{}`, as the original scroll brings none). The spell then
  works as in the engine: the charge picks the stage, held below the stage above the best unit in
  the reserve; allies go back to the reserve when they run out of enemies.
- **The current weapon in the HUD.** The original shows the weapon only in the Q palette; the
  remake draws the current weapon's `_ws` icon at the `prg_wizardMaster` mark (72, 0), free until
  the wizards are ported.
- **Keys.** 1-9 select the n-th spell (`Digit1`-`Digit9`; bnd_wasd's codes 22-26 are 6, 5, =, 9, 7,
  evidently meant as 5-9). Q opens the palettes at the mouse, or around Merlin without a mouse
  position; a click on an icon picks it and charges nothing. E, a click and Space work for every
  weapon: a spell charges while held, a melee weapon swings while held (facing where it aims; Space
  aims at the nearest enemy), as objAiPlayer does for the mouse. The punch and the melee scrolls are
  only on the lower palette (selectSpell counts spells only).
- **The army key is R** (owner request, 2026-10): C is the camera here. The port
  (`src/mr-open/mr-auto-summon.ts`, `stepArmyKey` in `src/sim/tick-army.ts`, the snapshot's
  `armyKey`, once per press, while Merlin is alive, in both world modes) follows summonArmy, with
  the mouse position (Merlin's without one). Differences: every unit's offset is taken from the
  mouse (the Lingo writes into `summonLoc`, which may alias `startLoc` and so drift from unit to
  unit: points are not certainly copied on assignment); a type with no units is skipped rather than
  ending the summon, as the port's reserve keeps counts and does not tell an emptied type from one
  never seen. **Remake addition, unsummon all:** while any of Merlin's army members (his
  `armyMembers` types on his team, living, teleportable, not already leaving) are in play, R
  teleports them all out into the reserve instead (`armyTeleportOut` each, as a blank army summon
  blast does); only units in the tick count, so an ally left asleep far away in the continuous
  world stays where it is. **Only once the fight is over** (owner request, 2026-10-22): the room
  clear (`exitsOpen`, as #noTargetFound's room test) or, in a continuous world, nav mode on (no
  awake hostile near Merlin); with army members out mid-fight R does nothing (it does not fall
  through to summoning). The same `fightOver` test sends allies home by themselves.
- **The touch army button** (owner request, 2026-10-22; no such control in the original): a blue
  button with the army summon's `_ws` icon above the weapon button (below it in portrait) is R,
  once per tap; with no mouse on a touch screen it always summons at the nearest enemy on screen,
  else at Merlin (`InputTracker.touchArmy`).
- **A blank army summon flies at the nearest ally** (owner request, 2026-10-22). A spell whose
  release charge leaves it blank with the payload `#armyTeleportOut` (the army summon below its
  first stage, `sendsAlliesHome`) flies at Merlin's army member nearest to him (in the room, or
  inside the play view in a continuous world) instead of the mouse or the nearest enemy, so a weak
  tap sends one ally home. At or above the first stage, or with no ally in sight, it aims as before.
- **The dwarf tower's axe splashes in a circle** (owner request, 2026-10-22). A bullet field
  `splashRadius` (engine default `null`: the port's old contact hit on the target) makes a bullet
  ignore its target in flight and, when it lands, hit every living hated unit of its hit roles
  whose sprite rect meets the circle of that radius around the landing point (the sword's
  `circleMeetsRect`), with the original's splash push (`splashPush`: toward the axe, length
  `power - dist`, through the payload functions once). `towerAxe.splashRadius` is 16 in
  `assets/tuning.json`, the owner's figure; the original's test reaches 50 px reg point to reg
  point (`power`), a much wider blast.
- **Touch.** A weapon button beside the blast button shows the current weapon; a tap steps to the
  next one in Merlin's list (no such control in the original).
- **A hit ends Merlin's swing.** objPlayerMerlinCharacter.takeHit forces `#walk`; the port ends the
  attack there instead of letting the AI watch the walk strip for its strike frame.
- **The energy blast scroll keeps the tuned blast.** A map's energyBlast scroll re-adds the
  starting weapon with `player.attack`'s tuning instead of the scroll's untuned attack.
- **#noTargetFound in a continuous world** (no room to clear): an ally leaves once its AI finds no
  target and no hated unit is awake near it, or nav mode is on (no awake hostile near Merlin).
- **The teal glow** is drawn as a 50 % blend toward rgb(0, 255, 255) (modColourTransform.glowTeal
  transforms the sprite's colour; its exact look is not in the Lingo).
- **Timing** follows the port's N-tick counters: a pulse or beam every `ceil(fireDelay)` ticks (5
  and 7), mines primed after 30 ticks and checked every 3.
- **The freeze reaches Merlin too** (modFreeze is an objCharacter module): frosty monks' freeze
  blasts and ice boulders halve his acceleration while it lasts.
- Collected pickups now show their writing strip (`<name>_writing`); before this slice potions and
  medikits faded out on their stand frame.

### Notes from the port

- A beam is drawn stretched from its spell for its one `fly` frame; its two `explode` frames are
  2 px wide with the reg point in the middle, so the kept stretch centres them on the target
  (setAnimKeepSize), as the data says.
- Energy mines need a full charge at Merlin's starting capacity (charge 10 = 1 mine); Max Blast
  potions add 0.75 each, so a second mine needs capacity 20.
- The monster summon reaches only its first stage (the summoned goblin archer) at the start:
  chargeMax = capacity 10 x 1.2 = 12; the warrior (15) needs capacity 12.5, about four Max Blast
  potions.
