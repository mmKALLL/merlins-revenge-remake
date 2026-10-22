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
  the attack's own `chargeStart`, not the sum. With `chargeStartMax #none` (every spell but the two
  summons) the comparison with a symbol is what keeps the sum in play; with a number (armySummon 8,
  monsterSummon 14) the start is `min(chargeStart, chargeStartMax)` and mana_burst does nothing.
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

## Port

<!-- filled in by the port slice -->
