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

## Volley spells (remake)

Owner design (2026-10-24), not in the engine: eight scrolls that fire a fan of an enemy's
projectiles, one more for each charge level. They are remake data, so their actor files live apart
from the copied originals in `assets/remake-actors/` (`act_`-style Lingo lists, `#objScroll` like
Merlin's scrolls, `#releaseFunction #volley` and a `#volley` list); `assets/tuning.json` can still
override them by key like any actor. Rules: `src/sim/volley.ts`; firing: `stepVolley` in
`src/sim/tick-spell.ts`; hits: `firstHostileTouched` in `src/sim/tick-combat.ts`; icons:
`src/render/volley-icons.ts`; art: `tools/volley-scroll-art.ts` (run by `tools/copy-assets.ts`).

- **Fields.** `attack.releaseFunction #volley` with `attack.volley` (engine default null:
  `chargePerShot`, `maxShots`, `rangeFactor`, `damageMultiplier`, `staggerTicks` 2, `spreadMinDeg` 10,
  `spreadMaxDeg` 32, `speedJitter` 0.05, `spread` #random or #even, `chill` 0 and `pierce` 0: see the
  second batch below), the projectile in `attack.bullet`, the launch in
  `attack.firingType`, the charge in the usual `chargeSpeed` / `chargeMaxModifier` / `chargeMaxBasic`.
- **Count.** A volley released at charge c fires `min(maxShots, 1 + floor(c / chargePerShot))`. The
  charge max is the engine's (`mana_capacity x chargeMaxModifier + chargeMaxBasic`), held at
  `(maxShots - 1) x chargePerShot` (`chargeLimits`), so Max Blast potions unlock the higher counts.
  The full count's capacity and the charge speed per spell are in the retune and tweak tables
  below (Volley retune, Volley tweaks).
- **Release.** The spell stays where it was released and fires one projectile every `staggerTicks`
  (the first at once) toward the aim at the release, shrinking by `chargePerShot` each; then it is
  gone. Each launch is `performRangedAttack`'s #fullstrength (Merlin's strength 8) or #proportional
  (distance / 10) velocity times `rangeFactor`, turned into its place in the fan: the fan's total
  width is `spreadMinDeg` at 1-2 projectiles growing linearly to `spreadMaxDeg` at `maxShots`. An
  #even fan (needles, shurikens) spaces them equally from one edge to the other; a #random one (the
  rest) sends the first exactly at the aim and every later one at a random angle anywhere in the
  fan. The speed is jittered by up to +-`speedJitter` (not a random fan's first). The range follows
  from the speed and the bullet's own friction; a projectile that explodes on landing
  (`#bulletLanded` in its explodeEvents: bombs, thunder, lava) is launched only as fast as lands it
  on the aim (`launchToLand`: the largest speed whose friction flight stalls short of the aim),
  never faster than the spell's own launch, so out of range it falls short, and never slower than
  `minLandingSpeedShare` (0.5) of it, so a close aim is overshot.
- **Hits.** Enemy bullets still collide only with their target. A volley projectile has no target:
  it hits the first living hated unit of the spell's `hits` roles (members and buildings: every
  bullet's own data only hits #teamMembers, so dwellings were missed) its collision rect touches, the nearest
  to where it was a tick before when it touches several, with the bullet's usual hit (contact push
  twice; an #explode bullet explodes there as it does now). It carries a copy of the bullet's attack
  with `damageMultiplier x volley.damageMultiplier`, and Merlin's `damageDealtMultiplier` (2) applies
  as to all he deals (`withOwnerDamage`).
- **Icons.** While charging and firing, the projectiles the spell stands for are drawn over it as
  mini projectiles (the bullet's first fly frame, at most 8 px) stacked diagonally, each 3 px right
  of and above the one before, one per projectile up to five; at six or more a small black "+"
  stands right of the stack. The ball is at least the stack's size plus 2 px (`volleyBallPx`), and
  each spell's `chargeSize` makes it 30 px at its full count.
- **Scrolls.** Art made at copy time from original members: the plain healBlast scroll tinted to the
  volley's colour with a mini projectile on it (fit to 10 x 8 px, a projectile 1.5x longer than tall
  turned 45 degrees to point down-right, thin lines kept by a lower coverage threshold), the energy pulse's `_ws` icon with its disc recoloured
  and the projectile on it, and the name in a pixel font drawn after the writings (2 px stems, 1 px
  bars, black outline, the writings' orange-to-yellow rows). Object tiles: merlinOpenObjects' empty
  slots 31-37 and 40 (painted with the scroll), merlin4Objects 173-180 past its key
  (`src/gen/remake-object-tiles.ts`, written into the converted keys). Every floor's start scroll
  list includes them at weight 1 (Spell pools, below). `?map=test_maps/spell_test` has them in a row below Merlin.

Numbers (damage measured in the sim on an inertia-0 target 48 px away, one projectile; the enemy's
shot from its wielder's strength; Merlin's with his `damageDealtMultiplier` 2; at the start Merlin's
mana capacity is 13):

| volley | projectile | launch speed (range) | per level | max | at the start | volley dmg mult | enemy shot | Merlin's | ratio |
|---|---|---|---|---|---|---|---|---|---|
| bombVolley | bomb (explodes) | 10 (about 80 px) | 3 | 7 | 4 | 1.5 | 17.5 | 44 | 2.5 |
| boltFan | crossBolt | 8 (about 120 px) | 5.5 | 10 | 6 | 1.3 | 35 | 87 | 2.5 |
| arrowRain | archerArrow | 10 (about 160 px) | 8 | 10 | 6 | 1.4 | 39 | 100 | 2.55 |
| shurikenFan | shuriken | 12 (friction 1 %: crosses the room) | 8 | 10 | 6 | 0.85 | 38 | 94 | 2.5 |
| thunderBurst | thunderBlast (explodes, radius 50) | 10 (about 270 px) | 18 | 4 | 2 | 1.3 | 70 | 177 | 2.5 |
| pinStorm | smokePin | 20 (about 180 px) | 7.5 | 10 | 6 | 0.27 | 36 | 91 | 2.5 |
| lavaLob | flamingRock (explodes) | 10 (about 80 px) | 6.5 | 7 | 4 | 1.9 | 41 | 102 | 2.5 |
| needleSpray | needle | 16 (about 175 px) | 6 | 10 | 6 | 1.2 | 28 | 69 | 2.45 |

"Per level" is `chargePerShot`, set from Merlin's damage per projectile at about 12 damage per unit
of charge, about 15.6 (cheaper levels) for the short-range bolts, bombs and lava, and 18 for the
thunder bolt (its blast also hits around it). The pins' own power (1.5, the most of any bullet)
times their much faster launch made them 9x the shrouder's, hence 0.27. The lava golem's rock
`reincarnateAs #fire`, but `act_fire` is not ported, so neither the enemies' rocks nor Merlin's leave
a fire.

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
  stays unspawned). Test content: `?map=test_maps/spell_test` (`tools/make-spells-test-map.mjs`).
- Left out: experience in the army details (not ported anywhere), the in-game wizards, the axe's
  `splashGraveOn` stamp, the engine's 50 px splash test (see the remake decision), the monk's ghost
  (`reincarnateAs #monkGhost`, objAiCPUGhost), and the enemies that fire pulses, beams or lay mines
  (techMech, prestotolin, verdanlin; their actors are not copied yet).

### Remake decisions

- **Monster summon (owner requests, 2026-10-22).** It charges at 70 % of the engine's speed: the
  charge per tick is `chargeSpeed` 0.6 x Merlin's mana_flow capped at `chargeSpeedMax`, and with his
  starting flow of 3 the cap decides, so `monsterSummon.attack.chargeSpeedMax` is 0.7 in
  `assets/tuning.json` (engine 1; tuning chargeSpeed alone changed nothing), the summoned team
  holds up to 12 (`team:monsterSummon` `maxMembers` 12, engine 3; `team:<key>` entries in
  tuning.json tune teams, `withTeamTuning`), and its units are drawn blended 30 % toward light blue
  (the remake team `overlay`, rgb(150, 210, 255)) so Merlin's monsters stand out from the wild ones.
  Its scroll carries an M (drawn by `tools/copy-assets.ts` in the outline colour, where cBlast's
  scroll has its C).
- **cBlast charges 1.2x faster (owner request, 2026-10-23).** Its charge per tick is `chargeSpeed`
  0.1 x mana_flow with no `chargeSpeedMax` (`#unlimited`), so here the speed itself decides:
  `cBlast.attack.chargeSpeed` is 0.12 in `assets/tuning.json`. At Merlin's flow of 3 that is 0.36 a
  tick instead of 0.3 (the engine's full charge, mana_burst 1 to 999, would take 2773 ticks instead
  of 3327).
- **cBlast is full after 12 s (owner request, 2026-10-23).** A new attack field `chargeFullTicks`
  (engine default null, no time cap) caps the charge max at `start + charge speed x chargeFullTicks`
  besides the engine's max (`chargeLimits`), so the blast's size still grows with the charge speed.
  `cBlast.attack.chargeFullTicks` is 360 in `assets/tuning.json`: at Merlin's start (flow 3) the max
  is 130.6 (explosion radius 261 px, charge ball 131 px); with 4 Quick Charge potions (flow 5) it is
  217 (radius 434 px). The charge sound's volume map tops out at charge 100, so it plays at full
  volume from there on.
- **Attack grace (owner request, 2026-10-23).** A hostile unit that has just become active for Merlin
  starts no ranged or magic attack for the player's `activationAttackGraceTicks` (24 ticks, 0.8 s, in
  `assets/tuning.json`; engine default 0): with the room camera the units of the room he enters (and
  of the start room), in the continuous world those awake at the map start and every unit that wakes
  (by distance or by a hit). An AI spell caster starts and charges no spell meanwhile, an objAiCPU
  unit whose attack is not melee stands in reach instead of starting its strip; both keep walking
  (the caster's optimum-position movement included), and melee attacks are not held, since a melee
  unit has to reach Merlin first. Ranged attacks are held too because the MR3 wizards (bomb mage,
  thunder monk, shrouder) and the archers fire bullets that are as sudden on entering a room as a
  spell. Allies get no grace. The counter (`ActorState.attackGrace`) runs down with the cooldowns, so
  it pauses while a unit sleeps (`src/sim/attack-grace.ts`).
- **Filters stay sharp.** The colour filters (white flash, teal glow, team overlay) render at the
  canvas's resolution (`pixelFilter` in `src/render/scene.ts`); Pixi's 1x default blurred them.

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

### Volley retune (owner, 2026-10-25)

- **Full count by tier:** easy volleys reach their full count at Max Blast capacity 15 (bombs, bolts,
  lava), mid at 18 (arrows, needles), hard at 21 (shurikens, pins, thunder); Merlin starts at 13, each
  Max Blast potion adds 0.75. Each file's `chargeMaxModifier` is set so `capacity x modifier` reaches
  `(maxShots - 1) x chargePerShot` at its tier (rounded up).
- **No damage buff:** each projectile now hits about as hard as the enemy's own shot, Merlin's 2x
  included (the volley `damageMultiplier` divided by the old ~2.5 ratio); bombs hit 1.5x the enemy
  bomb.

| Spell | Max | Start (cap 13) | +4 Max Blast (cap 16) | Full (cap) |
|---|---|---|---|---|
| Bomb volley | 7 | 6 shots, ~156 | 7, ~182 | 15 |
| Bolt fan | 10 | 8, ~280 | 10, ~350 | 15 |
| Lava lob | 7 | 6, ~246 | 7, ~287 | 15 |
| Arrow rain | 10 | 7, ~273 | 9, ~351 | 18 |
| Needle spray | 10 | 7, ~196 | 9, ~252 | 18 |
| Shuriken fan | 10 | 6, ~228 | 7, ~266 | 21 |
| Pin storm | 10 | 6, ~216 | 7, ~252 | 21 |
| Thunder burst | 4 | 2, ~140 | 3, ~210 | 21 |

Damage is per direct hit summed over all projectiles (every one hitting); bombs, thunder and lava also
splash.

### Volley tweaks (owner, after playing, 2026-10-25)

- **Spread:** wider fans (10 degrees at 1-2 projectiles up to 32 at the full count) and a per-spell
  `spread`: #even for needle spray and shuriken fan, #random for the rest (first shot exactly at the
  aim, no jitter; later ones anywhere in the fan).
- **Exploding projectiles land on the aim** (thunder overshot by far): see Release above. Only
  exploding ones; the others keep flying past the aim.
- **Dwellings:** volley projectiles hit with the spell's `hits` (the skeleton dwelling was immune to
  needles).
- **Slower charge:** `chargeSpeed` x 0.5 (owner, 2026-10-25; first tried x 0.4, the table below) for all but needle spray and arrow rain (the light, fast
  ones; dragon fire to join them). Ticks from the first charge to the max at Merlin's start
  (capacity 13, flow 3, 30 ticks a second) and to the full count:

| Spell | Charge per tick | Max at cap 13 | Ticks to max (cap 13) | Ticks to full count |
|---|---|---|---|---|
| Arrow rain | 2.0 | 52 (7 shots) | 25 (0.8 s) | 35 |
| Needle spray | 1.5 | 39 (7) | 25 (0.8 s) | 35 |
| Shuriken fan | 0.8 | 44.6 (6) | 54 (1.8 s) | 89 |
| Pin storm | 0.75 | 41.8 (6) | 54 (1.8 s) | 89 |
| Bolt fan | 0.55 | 42.9 (8) | 76 (2.5 s) | 88 |
| Lava lob | 0.43 | 33.8 (6) | 76 (2.5 s) | 88 |
| Bomb volley | 0.2 | 15.6 (6) | 73 (2.4 s) | 85 |
| Thunder burst | 0.48 | 33.4 (2) | 68 (2.3 s) | 110 |

- **Icons and ball, scroll art:** see Icons and Scrolls above.

### Volley tweaks, third round (owner, 2026-10-25)

- **Fans:** most volleys widen by about 5 degrees each way (20 degrees at 1-2 shots up to 42 at the
  full count); bolt fan and bomb volley go up to 60 (+-30); arrow rain is the wide, cheap spray (30 up
  to 75); needle spray is unchanged (the owner's favourite).
- **Arrow rain** fires goblin arrows (the remake's graphic choice; the skeleton/archer arrow looked
  wrong), with its multiplier raised 1.6x so its damage stays where it was, which also pays for its
  short range and wide spread. The Scarlet longbow arrow is kept for the second batch's few, strong,
  accurate, long shots.
- **Shuriken fan** charges 1.5x faster; **lava lob** flies about twice as far (`rangeFactor` 2.5).
- **Charge icons:** no "+" for more than five projectiles.
- The scroll art tool also reads original gfx BMP fly frames (the goblin arrow has no cast PNG).
- **Damage buff back (owner, 2026-10-25):** every volley's `damageMultiplier` x2.5, so each
  projectile hits about 2.5x the enemy's own shot (bombs ~3.75x; tried 2x first).
- **Bombs (owner, 2026-10-25):** 4.5x the enemy bomb, and a fan of 30 degrees at 1-2 bombs up to 80 (+-40).
- **Launch speeds (owner, 2026-10-25):** an exploding projectile launches at no less than half its
  full speed (`minLandingSpeedShare`), overshooting close aims; bombs 1.2x faster (rangeFactor 1.5,
  about 90 px); thunder rangeFactor 2.6 (about 600 px, across the room).
- **From zero, smooth ball, from Merlin (owner, 2026-10-25):** a volley fires one projectile per
  `chargePerShot` (a release below the first fires nothing); each `chargePerShot` became
  (maxShots - 1) / maxShots of the old one, so the full charge and the capacity tiers stay. The ball
  grows linearly with the charge (`volleyBallPx`), from room for one icon to the larger of charge x
  chargeSize and what holds every icon stack in time, with a 4 px margin (it used to stall at five
  icons, then jump). The pin icon sits 1 px higher. To try: `launchFrom` (#caster, the default now)
  starts the projectiles at Merlin's attack point instead of the ball (#spell). Bombs fan to 90 degrees; lava
  lobs fly 1.2x further (rangeFactor 2.9).
- **Touch weapon button skips the punch (owner, 2026-10-25):** the energy blast is always held, so
  the button's cycle (`nextWeapon`) passes over Merlin's natural attack; Q's palettes still offer it.
- **Heal blast aim (owner, 2026-10-25):** fired by a Space mode (nearest or farthest, and the touch
  button), a healing spell (`#takeHeal`) flies to Merlin's nearest ally in sight, else to Merlin himself
  (`spellAimPoint`); aimed by the mouse it goes to the mouse as before.
- **Lingering blasts (owner, 2026-10-25):** Merlin's exploding bullets and mines (`explosionsLinger`
  on the player, in `assets/tuning.json`) keep hitting while their explode strip plays: a unit that
  enters the blast is hit as on its first tick, once per blast (`lingerExplosion`). Enemy blasts hit on
  their first tick only, as in the engine (modExploder.explode's single impactAttack).

### Volley spells, second batch (2026-10-25)

Thirteen more volleys (draft and open questions: `docs/plans/2026-10-25-volley-batch-2.md`), built
by the same rules as the first after its tweak rounds: the count starts at 0, one projectile per
`chargePerShot`; the full count is reached exactly at a capacity tier (15 / 18 / 21, the
`chargeMaxModifier` rounded up to 4 decimals); each projectile keeps its bullet's own push, damage,
friction, explosion and payload, and hits about 2.5x the enemy's own shot (the volley
`damageMultiplier`, measured in the sim as before: an inertia-0 target 48 px away, the enemy's shot at
its wielder's strength, Merlin's with his `damageDealtMultiplier` 2). Most charge slowly (72 ticks from
nothing to the full count, 2.4 s, at flow 3); the strong long-range ones slower (90); only dragon fire
fast (36). The ball is 30 px at the full count (`chargeSize` = 30 / full charge).

| Spell (key) | Projectile (enemy) | Max | Tier | Per level | Start (cap 13) | Ticks to full | Launch (range) | Volley dmg mult | Enemy shot | Merlin's | Fan | Notable |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Longbow (`longbow`) | scArcherArrow (Scarlet archer) | 4 | 21 | 12 | 2 | 60 | 20 (about 340 px) | 0.94 | 122 | 305 | even 4-8, no jitter | few, accurate, far |
| Dragon Fire (`dragonFire`) | fireBall (dragons) | 10 | 18 | 5.4 | 7 | 36 | 10 (about 190 px) | 1.0 | 16 | 41 | random 30-80, stagger 1, jitter 0.25 | fast, wide spray, low push |
| Boulder Lob (`boulderLob`) | boulder (boulder monster) | 4 | 18 | 12 | 2 | 72 | 12 (about 210 px) | 1.25 | 42 | 105 | random 30-60, stagger 5 | heavy push (power 2) |
| Dark Rock (`darkRockBurst`) | darkRock (dark golems), explodes | 5 | 15 | 6 | 4 | 72 | 20 (lands on the aim, at most about 160 px) | 2.6 | 65 | 163 | random 20-50, stagger 3 | short-range blasts |
| Poison Smoke (`poisonSmoke`) | smoke (shrouder), explodes | 5 | 18 | 7 | 3 | 72 | 8 (lands on the aim, at most about 295 px) | 1.6 | 41 | 102 | random 15-35, stagger 3 | a blast, low push |
| Acid Splash (`acidSplash`) | acid (hydra) | 8 | 15 | 5 | 6 | 72 | 12 (about 130 px) | 1.68 | 58 | 145 | random 25-60, jitter 0.15 | short range, many |
| Lightning (`lightningFan`) | lightning (vulture guard) | 3 | 21 | 15 | 1 | 90 | 16 (about 450 px) | 1.2 | 99 | 245 | even 6-14, stagger 3, no jitter | huge push (power 3.5) |
| Bunny Lob (`bunnyLob`) | fangBunnyBabyBullet (fang bunny baby) | 8 | 15 | 4 | 6 | 72 | 10 (about 190 px) | 1.0 | 20 | 49 | random 30-70, jitter 0.25 | cheap sparks |
| Skull Toss (`skullToss`) | skeletonHead (skeleton thrower) | 5 | 18 | 8 | 3 | 72 | 10 (about 260 px) | 1.03 | 50 | 124 | random 20-45, stagger 4, jitter 0.15 | solid push (power 1) |
| Frost Burst (`frostBurst`) | freezeBlast (frosty monk), explodes, freezes | 4 | 21 | 12 | 2 | 90 | 16 (lands on the aim, at most about 450 px) | 1.24 | 34 | 86 | random 20-42, stagger 4 | radius 50 blast, long freeze |
| Ice Boulder (`iceBoulderLob`) | iceBoulder (ice rock), freezes | 4 | 21 | 12 | 2 | 90 | 12 (about 210 px) | 1.25 | 42 | 105 | random 30-60, stagger 5 | heavy push, long freeze |
| Blue Flame (`chillFlame`) | blueFlame (undead dragon) | 5 | 18 | 8 | 3 | 72 | 12 (about 240 px) | 1.09 | 53 | 133 | random 20-42, stagger 3 | **chills** (`#chill: 4`) |
| Laser (`laserVolley`) | laser (quadranid) | 6 | 18 | 7 | 4 | 54 | 16 (about 450 px) | 0.76 | 55 | 137 | even 6-16, stagger 1, no jitter | **pierces** 2 (`#pierce: 2`) |

"Enemy shot" and "Merlin's" are one projectile's damage (an exploding one hitting directly). Freeze
lengths on an inertia-0 target (`freezeTicksAfter`, the push after inertia): a frost burst freezes for
about 190-380 ticks and an ice boulder about 200-235 (the original bullets' own `freezeMultiplier` 3 and
pushes; the freeze halves the walk speed); a blue flame chills for about 30 ticks a flame. Sounds: the
enemy's own fire sound where it has one (the shrouder and frosty monk have none: `spell_release`).

Remake decisions (owner, 2026-10-25):
- **Chill** (`attack.volley.chill`, engine default 0): a chilling volley's projectiles carry
  `#takeFreeze` before their own payload functions, with `freezeMultiplier` = chill and the teal glow
  (`volleyProjectileAttack` in `src/sim/volley.ts`), so the hit freezes as the arctic blast's does:
  `(|push x| + |push y|) x chill x 4` ticks, the push after the victim's inertia. Blue flame: 4.
- **Pierce** (`attack.volley.pierce`, engine default 0): a projectile flies on through that many
  hostiles after hitting them, each hit once (`piercesLeft` and `piercedIds` on the bullet,
  `pierceThrough` in `src/sim/tick-combat.ts`); it stops at the next one. Laser: 2 (three enemies in
  all). Arrows do not pierce, as in the engine.
- Smoke is a blast as in the engine (no lingering cloud); the freeze blast and ice boulder freeze
  from their own payloads (no new code).
- Object tiles: merlinOpenObjects 19, 20, 54-60, 100, 102, 109, 110 (slots 18 and 53 are `none` in
  the key but have art on the sheet), merlin4Objects 181-193. Themed floors: see "Spell pools" below. The scroll writings needed four new glyphs (D, I, c, g); the ice boulder's fly frame is
  named `anm_iceboulder_*`, so the art tool matches it in any case.
- `?map=test_maps/spell_test` (from `tools/make-spells-test-map.mjs`, which now also writes the
  layout that had been hand-edited): longbow, dragon fire and boulder lob left of the first batch in
  the row below Merlin, dark rock, poison smoke, acid splash and lightning right of it; bunny lob,
  skull toss, frost burst, ice boulder, blue flame and laser in the top row.
- **Acid and laser retune (owner, 2026-10-25):** acid rangeFactor 2.65 (about 255 px, almost 2x),
  fan 15-50, landed splash 15 ticks; laser 30% slower per laser (chargeSpeed 0.1556) and 7 at most (chargePerShot 6, full
  charge still at tier 18), damage x0.7 for the pierce (damageMultiplier 0.532, about 1.75x the
  quadranid's laser). Frost burst / ice boulder freezes and lightning's push stay original.
- **Spell pools (owner, 2026-10-26; replaces the 2026-10-25 rule below):** no themed spells. Every
  floor's start scroll pool holds every spell its objects tileset has a tile for, the original
  spells at weight 2 (`ORIGINAL_SPELL_WEIGHT`) and the volleys at 1, unscaled: about 49 % originals
  on merlinOpen tiles (10 at 2 against 21 at 1), 43 % on merlin4's (no arctic blast or energy beam).
- **Spell pools (owner, 2026-10-25, superseded):** every floor's start scroll pool holds every spell at weight 1
  (themed ones +3), and the volleys' weights are scaled so they make up half the pool's weight, the
  original spells the other half (`spellWeights` in `src/gen/themes.ts`). A volley is themed where the
  floor's own enemies (units, dwellings and their residents, bosses) fire its projectile: arrow rain,
  bolt fan, acid in the Goblin Forest; arrow rain, skull toss, laser in the Undead Marsh; dragon fire,
  boulder lob, dark rock, needle spray, acid in the Dragon Canyon; bomb volley, thunder burst, pin
  storm, poison smoke, lightning, longbow, skull toss, arrow rain in the Magic Maze. The roguelite
  biomes: arrow rain, needle spray, bunny lob, shuriken fan in the Deep Forest; acid, laser, needle
  spray in the Hydra Marsh; boulder lob, dark rock, lava lob, ice boulder, lightning in Golem
  Mountain; longbow, bomb volley, thunder burst, pin storm, poison smoke, shuriken fan, lava lob in
  the Golden Palace. Only blue flame and frost burst have no floor whose enemies fire them.
- **Dragon fire pierces (owner, 2026-10-25):** `#pierce: 2` like the laser, damage x0.7
  (damageMultiplier 0.7).
- **Golem lobs stronger (owner, 2026-10-25):** boulder lob and ice boulder x1.6 (damageMultiplier
  2), dark rock x1.4 (3.64).
- **Bunny lob, many more (owner, 2026-10-25):** 18 at most (was 8), still full at tier 15
  (chargeMaxModifier 4.8, chargePerShot 4); chargeSpeed x1.8 (2.25x for the count, 20% slower), so
  each spark charges 25% slower than before and the full volley takes 1.25x as long.
- **Skull toss, more heads (owner, 2026-10-25):** 9 at most (was 5), each head charging as before
  (chargePerShot 8, chargeSpeed unchanged), so the full volley takes 1.8x as long; still full at tier
  18 (chargeMaxModifier 4).
- **Charge icon rows (owner, 2026-10-25):** up to 10 icons, 5 per diagonal row; each next row starts
  over at the first icon's place shifted +2 x, +1 y (`ICON_ROW_SHIFT`), the box centred on the ball;
  the skull icons sit 1 px further right (`ICON_NUDGE`).
- **Blank army summon calls the reserve (owner, 2026-10-25):** with `attack.blankSummonsReserve`
  (`assets/tuning.json`, armySummon; engine false), a blank army summon of Merlin's that lands while
  none of his army is in play summons the whole reserve where it lands, as R does (`summonWholeReserve`).
  R itself and the charged summon stages are unchanged; `player.armyKeySummons` (engine true) can turn
  R's summon off if insta-summon is banned later (R still sends the army back).

### Retune (owner, 2026-10-25, round 4)

- **Range:** every volley's `rangeFactor` x1.2. Friction is a share of the speed, so the landing
  travel (`landingTravel`, the most an exploding projectile can reach too) grows by 1.21-1.26x.
- **Piercing:** lightning, blue flame, shuriken fan and longbow get `#pierce: 2` (as laser and dragon
  fire) at 0.7x their `damageMultiplier`; their charge speed stays (blue flame: below). Laser and
  dragon fire keep their damage and charge.
- **The rest:** `damageMultiplier` x1.2 and `chargeSpeed` x1.2 (about 17 % less time to the full
  count; `chargeMaxModifier` unchanged, so every full count stays at its capacity tier).
- **Blue flame** freezes about 3 s a hit: `#chill` 9 (was 4) gives 92 frozen ticks for a flame hitting
  an inertia-0 target 48 px away (push 2.5 x 9 x 4 + 1), about 75 at 100 px and 59 at 160 px (the
  flame slows); a unit with inertia i is frozen (100 - i) % of that. It charges 1.3x faster.
- **Bunny lob's sparks** lie on the ground 15 ticks after landing (`fangBunnyBabyBullet.landedTicks`
  in `assets/tuning.json`, as laser, fire ball, blue flame and acid; the fang bunny baby's own shots
  too).
- **Charge icons:** rows of five up to the volley's `maxShots` (bunny lob's 18: four rows), each
  next row shifted +2 x, +1 y; no other cap. The ball still holds every stack (`fullBallPx`).
- The push of a non-exploding projectile (and so its damage and a chill's freeze) is its speed at
  the hit times its power, so the faster launch adds to the hit too: measured one-projectile damage
  (Merlin's, inertia-0 target 48 px away, as above) rises about 1.4-1.5x for the 1.2x spells, about
  0.85x for the new piercers, and 1.2-1.25x for laser and dragon fire (more for high-friction
  bullets; exploding ones' blasts do not depend on the speed).

| Spell | Range px | damageMultiplier | chargeSpeed | Pierce | One hit at 48 px |
|---|---|---|---|---|---|
| Acid splash | 256 -> 313 | 1.68 -> 2.016 | 0.1852 -> 0.2222 | 0 | 296 -> 426 |
| Arrow rain | 153 -> 190 | 2.195 -> 2.634 | 0.667 -> 0.8004 | 0 | 107 -> 154 |
| Bolt fan | 116 -> 145 | 1.3 -> 1.56 | 0.2288 -> 0.2746 | 0 | 90 -> 137 |
| Bomb volley (explodes) | 92 -> 112 | 2.7 -> 3.24 | 0.0838 -> 0.1006 | 0 | 111 -> 137 |
| Boulder lob | 212 -> 263 | 2 -> 2.4 | 0.2222 -> 0.2666 | 0 | 167 -> 241 |
| Bunny lob | 193 -> 240 | 1 -> 1.2 | 0.2666 -> 0.3199 | 0 | 49 -> 73 |
| Blue flame | 240 -> 299 | 1.09 -> 0.763 | 0.1852 -> 0.2408 | 0 -> 2 | 133 -> 117 |
| Dark rock (explodes) | 162 -> 199 | 3.64 -> 4.368 | 0.1389 -> 0.1667 | 0 | 299 -> 538 |
| Dragon fire | 193 -> 240 | 0.7 | 0.5 | 2 | 29 -> 36 |
| Frost burst (explodes) | 454 -> 558 | 1.24 -> 1.488 | 0.1778 -> 0.2134 | 0 | 87 -> 101 |
| Ice boulder | 212 -> 263 | 2 -> 2.4 | 0.1778 -> 0.2134 | 0 | 167 -> 241 |
| Laser | 454 -> 558 | 0.532 | 0.1556 | 2 | 96 -> 115 |
| Lava lob (explodes) | 192 -> 233 | 1.9 -> 2.28 | 0.18 -> 0.216 | 0 | 219 -> 284 |
| Lightning | 454 -> 558 | 1.2 -> 0.84 | 0.1667 | 0 -> 2 | 245 -> 212 |
| Longbow | 342 -> 419 | 0.94 -> 0.658 | 0.2667 | 0 -> 2 | 305 -> 257 |
| Needle spray | 161 -> 199 | 1.225 -> 1.47 | 0.5 -> 0.6 | 0 | 73 -> 105 |
| Pin storm | 162 -> 199 | 0.27 -> 0.324 | 0.3125 -> 0.375 | 0 | 94 -> 151 |
| Poison smoke (explodes) | 295 -> 373 | 1.6 -> 1.92 | 0.162 -> 0.1944 | 0 | 122 -> 147 |
| Shuriken fan | 991 -> 1229 | 0.85 -> 0.595 | 0.5006 | 0 -> 2 | 98 -> 83 |
| Skull toss | 259 -> 324 | 1.03 -> 1.236 | 0.1852 -> 0.2222 | 0 | 124 -> 184 |
| Thunder burst (explodes) | 608 -> 743 | 1.3 -> 1.56 | 0.2 -> 0.24 | 0 | 187 -> 209 |

Range is `landingTravel` at Merlin's strength 8 x `rangeFactor`; an exploding projectile lands on
the aim within it.
- **Number keys pick melee weapons too (owner, 2026-10-25):** 1-9 pick the n-th weapon Merlin holds
  other than his natural punch, spells and melee weapons alike, in the order collected (the original's
  selectSpell counted only #magic weapons). Q's palettes are unchanged.

### Playtest retune (owner, 2026-10-26)

- **Merlin's energy blast charges 20 % slower:** `player.attack.chargeSpeed` 0.8 (engine 1) in
  `assets/tuning.json`, so at mana_flow 3 it gains 2.4 a tick. The player's attack tuning is his own:
  goblin mages wield the same `energyBlast` weapon but take the raw scroll attack (the overlay is per
  actor). In the roguelite Merlin starts without the blast and gets it from its scroll;
  `collectScroll` gives the starting weapon's own scroll the player's tuned attack (`scrollAttack`),
  so the retune applies there too (spells test).
- **Big blasts hit harder (`attack.chargeDamageBonus`, remake field; engine default no bonus):** the
  spell's damage is multiplied by m(c) = clamp(1 + (c - from) x perCharge, 1, max) for its charge c
  at release (before chargeExplodeFactor), on top of the engine's damage, which already grows
  linearly with the charge through the push, and Merlin's damageDealtMultiplier (`explodeSpell`,
  `chargeDamageMultiplier`). Merlin's: from 13, perCharge 0.09, max 2, from two points: the full
  charge is (mana_capacity x 0.75 + 6), mana_capacity 13 + 0.75 a Max Blast potion, so 15.75 with no
  potion, 18.56 with 5 (m 1.50) and 24.19 with 15 (m 2.00, the cap); with no potion a full blast
  gets m 1.25, and charges up to 13 none.
- **Energy pulse blast 2 px wider:** `energyPulse.attack.explodeCharge` 12 (engine 10), so its
  radius is 6 (was 5) plus the victim's half width. Done with the engine field rather than a separate
  hit-area field: the engine's push falls off to 0 at the blast's edge, so a ring that hits without
  more push would deal almost nothing; the cost is 1 px more push (and damage x5 of it) everywhere
  inside. The bullet is shared with Ochre (ochreInGame's energyPulseSpell).
- **Smaller volley balls for small projectiles:** `chargeSize` bunny lob 0.938 -> 0.6, skull toss
  0.75 -> 0.39, bolt fan 0.606 -> 0.6, arrow rain 0.417 -> 0.41. Full ball 67.5 -> 43.2 px, 54 ->
  28.1, 30 -> 29.7, 30 -> 29.5; the least that holds their icon stacks in time (`fullBallPx` with no
  chargeSize) is 42, 27, 28.7 and 28.7. Bolts and arrows were already near it, so they barely shrink;
  smaller would need the icon rule loosened (icons growing out of the ball early in the charge).
- **Renames (owner, 2026-10-26):** Bunny Lob -> Particle Spray, Lava Lob -> Lava Shot (now Fireball, below), Bolt Fan -> Bolt
  Spray, Acid Splash -> Acid Burst, Boulder Lob -> Boulder Toss, Ice Boulder -> Frost Boulder (the
  scroll writings, `tools/volley-scroll-art.ts`; the actor keys stay).

### Fireball and Lava Toss (owner, 2026-10-26)

- **Lava Shot (`lavaLob`) is now Fireball:** one flaming rock per cast, whose blast grows with the
  charge. Three remake fields on `attack.volley` (engine defaults off; `src/sim/volley.ts`):
  - `fullCharge` (default 0 = `maxShots x chargePerShot`): the charge at which the volley is full,
    so the charge max (`chargeLimits`, `volleyFullCharge`) can go past its one projectile.
  - `blastFromCharge: [#base, #perCharge]` (default none = the bullet's own): each projectile's
    `explodeCharge` is `base + charge x perCharge` for the spell's charge as it fires (for one shot,
    the charge at release), carried on its attack copy (`volleyProjectileAttack`); the blast is the
    engine's (radius explodeCharge / 2, push `(R + r - d) x power`, damage the push's Manhattan
    length x the multipliers). The contact push of an #explode bullet now also takes the bullet's own
    copy (`explosionPushOn`), and the explode strip is drawn scaled by its explodeCharge over the
    bullet's own (`explosionScale` in `src/render/scene.ts`), keeping the engine's art-to-blast ratio.
  - `lob` (default false): the projectiles fly over every unit and go off only where they land.
    Needed because the flamingRock explodes on contact (`#bulletCollidedWithTarget`): aimed at an
    enemy it touched it about 20 px short of its centre, so a tap's small blast missed it entirely,
    while a full one hit three times (the engine's contact push twice, then the blast): 253 damage.
  - No `explodesOnLanding` field: the flamingRock already has `#bulletLanded` in its explodeEvents,
    so it lands on the aim (`launchToLand`) and explodes like the bombs.
- **Data** (`assets/remake-actors/lavaLob.txt`): `chargePerShot` 2 (the rock comes after about 2
  ticks), `maxShots` 1, `fullCharge` 39 (the old full charge: the capacity-15 tier with
  `chargeMaxModifier` 2.6 unchanged; 33.8 at Merlin's start, capacity 13), `blastFromCharge`
  [12.4, 3.78], `damageMultiplier` 0.63, `minLandingSpeedShare` 0.1 (lands on aims from about 28 px;
  range about 233 px as before), no fan. Charge speed unchanged: 0.648 a tick at flow 3, about 2 s to
  the full charge. The ball still grows linearly to 30 px (`chargeSize` x fullCharge), one icon.
- **Numbers** (Merlin's damageDealtMultiplier 2, an inertia-0 goblin-sized target, half width 7.5, at
  the blast's centre; measured in the sim within 1 px):

| Charge | explodeCharge | Radius px | Centre damage | Centre push |
|---|---|---|---|---|
| 2 (tap) | 20 (the enemy bomb's) | 10 | 22 | 17.5 |
| 33.8 (full at capacity 13) | 140 | 70 | 98 | 77.6 |
| 39 (full at capacity 15) | 160 | 80 (2.5 tiles) | 110 | 87.4 |

  For comparison, Merlin's energy blast at full charge with chargeDamageBonus: 73 centre damage at
  capacity 13 (charge 15.75, radius 31.5, x1.25), 87 at capacity 15 (charge 17.25, radius 34.5,
  x1.38), push 29-32. The fireball's full blast hits about 1.3x harder at the centre over a 2.3x
  radius, and pushes about 2.8x as far (its power is the flamingRock's 1, the blast's 0.75).
- The lava golem's rock `reincarnateAs #fire`, but `act_fire` is not ported (and an exploding bullet
  does not reincarnate), so the fireball leaves no fire.
- **Dark Rock (`darkRockBurst`) is renamed Lava Toss** (writing only; the key stays). Writings
  regenerated by `tools/volley-scroll-art.ts`; names in `docs/notes/spell-names.csv`.
