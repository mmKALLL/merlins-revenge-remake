# Engine mechanics: potions and medikits

How Merlin Open's pickups work: the four potions, the medikit and the maxikit, their pickup, what
they do to Merlin, and what the HUD shows. Lingo paths are under the archive's `casts/`
(`script_objects/`, `master_objects/`, `data/`); line numbers count the file's lines as exported
(CR line ends).

## 1. The actors

- `act_powerUp` (data): `#objType: #objPotion`, `#AiType: #objAiPowerUp`, `#collectSound:
  "collect_powerup_02"`, `#counterColour: rgb(255,255,255)`, `#frictionReel: point(20,20)`,
  `#minimapStatus: #clr`, `#team: #collectables`, `#weight: 0`.
- The potions inherit it and set `#character`, `#counterColour` and `#member`:
  `act_manaBurst` (magenta `rgb(255,0,255)`, `manaBurst_potion`), `act_manaCapacity` (red
  `rgb(255,0,0)`), `act_manaFlow` (blue `rgb(100,100,255)`), `act_walkSpeed` (green `rgb(0,200,0)`).
- `act_medikit` and `act_maxikit` inherit it too but switch to `#objType: #objMedikit` with
  `#collectSound: "collect_powerup_01"` and `#member: member("medikit_potion" / "maxikit_potion")`.
- `act_horriblePotion` and `act_blackPotion` are not pickups: `#inherit: #actorPlayer`,
  `#character: #prop`, cut scene props. Not ported here.
- Object tiles: merlinOpenObjects row 5 is `#manaCapacity #manaBurst #manaFlow #walkSpeed #medikit
  #maxikit` (tiles 41-46); merlin4Objects has the first five (13-17, no maxikit); merlinObjects
  (MR3) has the first five too. Original maps that place these tiles now get the pickups.
- The gfx members (archive `gfx/potions/`, `gfx/medikit/`): `<name>_potion` 16x16 (the pickup and
  its HUD icon), `<name>_writing` (the name in letters, shown once collected), `medikit_on` /
  `medikit_off` 16x16 (the HUD icon). The maxikit's `maxikit_potion` (14x12, reg 7,6) and
  `maxikit_writing` (44x12) are not in `gfx/`, only in the engine movie's gfx cast (members 679,
  680; `dump_bitmaps.py maxikit_` writes them); see the port section.

## 2. Pickup

- Class chain: `objPotion` / `objMedikit` -> `objPowerUpWriting` -> `objPowerUp` ->
  `objAiGameObject`. `objPowerUpWriting.new` adds modFader and modReel (`objPowerUpWriting.txt:9-20`).
- `objAiPowerUp.update` (`objAiPowerUp.txt:26-36`): in `#norm`, if
  `checkForCollisionWithPlayer()` then `collected(player)` and the AI goes `#dead` (no second
  collection). `objGameObject.checkForCollisionWithPlayer` (`objGameObject.txt:269-271`) is
  `CollisionCheck(me, player)`: the player's reg point inside the pickup's collision rect grown by
  the player's collision rect offsets (the same test as a bullet's hit, `CollisionCheck().txt`).
  It does not look at the player's mode.
- `objPowerUpWriting.collected` (`objPowerUpWriting.txt:37-43`): `pCollected = true`,
  `displayWriting` (member -> `<character>_writing` by `#nameBased`, `goMode(#writing)`,
  `startFade`), `setRecordInRoomState(false)` ("make sure the powerup doesn't reappear if player
  exits before writing fully fades"), `playSound(pCollectSound)`. It does not call
  `objPowerUp.collected` ("powerup will disappear immediately").
- `modFader.startFade` = `startTransBlend(2, #out)` (`modFader.txt:85-87, 113-131`): an
  objTransBlend moves the sprite blend from 100 toward 0 by 2 per update
  (`objTransformer.update`, `VarToward(pCurr, pTarget, pSpeed)`, skipping its first frame), so the
  writing fades over about 51 ticks; `transBlendFin` -> `faderFin` -> `setDead(true)`.
- Hits: `objPowerUpWriting.takeHit` would reel the pickup (`frictionReel 20`), but nothing hits
  one: teamMaster drops `#collectables` from every hated-team list it searches
  (`teamMaster.txt:269, 659, 723`), so spells and bullets never target or splash a pickup.
  `objPotion.checkDead` returns false "for getting hit by energy blast", a leftover.
- `objPotion.collected` (`objPotion.txt:26-29`): the above, then
  `collector.potionCollected(character, me)`. `objMedikit.collected` (`objMedikit.txt:10-13`):
  the above, then `collector.medikitCollected(character)`.
- **Owner request (2026-10-22), as the engine does it:** a collected potion or kit disappears at once
  and its name fades out in its place (the writing). For a while the remake removed collected
  pickups outright (`vanishOnCollect`), because the writing was not drawn and the potion's own
  picture faded instead; with the writing drawn, the engine's behaviour is what the owner asked for
  and the setting is gone.

## 3. Potions on Merlin

`objPlayerMerlinCharacter.potionCollected` (`objPlayerMerlinCharacter.txt:183-203`):

| character | call | effect |
| --- | --- | --- |
| `#manaBurst` | `incManaBurstPotion` | `pManaBurst += pManaBurstInc` = 0.75 (`modCharacterAttackProperties.txt:41, 163-165`) |
| `#manaCapacity` | `incManaCapacityPotion` | `pManaCapacity += pManaCapacityInc` = 0.75 (`:42, 178-180`) |
| `#manaFlow` | `incManaFlowPotion` | `pManaFlow += pManaFlowInc` = 0.5 (`:43, 193-195`) |
| `#walkSpeed` | `incWalkAcceleration(#potion)` | `pNavModeNormalAcceleration += pPotionAccelerationInc` = 0.3 (`modNavMode.txt:21, 58-69`) |

then, for every potion, `startTempInvince()`, `increaseEnergy(pBonusEnergy)` with `pBonusEnergy =
25` (`:54`) and `g.potionMaster.potionCollected(thePotion)`.

- Mana stats feed the spell (engine-mechanics-combat.md §5): burst is added to the charge start,
  capacity scales the charge max (`capacity * chargeMaxModifier + chargeMaxBasic`), flow
  multiplies the charge speed. Merlin starts at burst 1, capacity 10, flow 1 (`act_player`).
- Walk speed: `pNavModeNormalAcceleration` is the walk acceleration outside nav mode (starts at
  `#walkAcceleration` 2); `implementChanges` applies it at once unless nav mode is on, which keeps
  `navModeAcceleration` 6. `modMoveToLoc.incWalkSpeedPotion` (`modMoveToLoc.txt:263`) exists but
  Merlin's potion never calls it.
- `increaseEnergy` caps at `pMaxEnergy` (`modEnergy.txt:133-147`); Merlin's is 200.

## 4. Medikits on Merlin

`objPlayerMerlinCharacter.medikitCollected(medType)` (`objPlayerMerlinCharacter.txt:152-160`):
`startTempInvince()`, then for `#medikit` `modMedikit.medikitCollected` (one more kit in stock)
and `increaseEnergy(25)`; for anything else (the `#maxikit`, and the M cheat, which passes no
type) `increaseEnergy(getMaxEnergy() - getEnergy())`, full energy at once.

`modMedikit` (`modMedikit.txt`) heals from the stock:

- `update` (`:119-128`): while energy is below max, `attemptHeal`; at max the kit is inactive.
- `attemptHeal` (`:50-68`): `Counter(pHealDelayCounter)` (`tim [1,5]`); when it finishes: if the
  current kit has hitpoints left, take `pHealAmount` 1 from it and add 1 energy (active); else
  inactive and `nextMedikit`. `Counter` (`general_functions/Counter ().txt`) runs 1..5 and finishes
  on the 4th call, then resets on the next, so a heal comes every 5 ticks while hurt (6 energy a
  second), and an empty kit costs one finish to swap.
- `nextMedikit` (`:92-99`): if the stock has one, take it and fill the current kit with
  `getMedikitMaxHitpoints()` = Merlin's max energy (200).
- `getNumOfMedikits` (`:82-90`): the stock, plus one while the current kit has hitpoints.

So a medikit is a 200 energy reserve that refills Merlin 1 per 5 ticks whenever he is hurt, plus 25
at once on pickup.

## 5. Temporary invincibility

`modInvince` (`modInvince.txt`): `startTempInvince` (`:81-87`) resets `pTempInvinceCounter`
(`tim [1, 200]`) and turns invincibility on (`pulseWhite`) unless the cheat lock is on; `update`
counts it with `CounterOnce` and turns it off (`pulseWhiteStop`) when it finishes, 199 ticks later
(`:89-107`). While on, `modEnergy.loseEnergy` does nothing (`modEnergy.txt:187-209`): no damage,
no take-hit sound, no flick; the hit's push still applies (`objGameObject.takeHit`).

## 6. HUD

- `potionMaster` (`master_objects/potionMaster.txt`): a list of records, one per potion character
  in order of the first drink (`getPotionRecord`, `:139-165`), each with the potion's
  `counterColour`, its non-writing member as the icon and `numCollected`. `display`
  (`:81-137`, right-aligned): from the right edge of its rect, for the records last to first, the
  count (in the record's colour, 3 px lower) then the icon to its left; then the title "POTIONS
  DRUNK" (`#smallgrey` font, 5 px lower) left of them all. Nothing shows before the first potion.
- `medikitMaster` / `objMedikitDisplayer` (`objMedikitDisplayer.txt`): at its display loc the icon
  (`medikit_on` while a kit is healing, else `medikit_off`), 1 px right of it a vertical green
  (`rgb(0,200,0)`) energy bar 6 px wide and as tall as the icon with a 1 px border, showing the
  current kit's hitpoints out of the max, then 1 px right a counter (3 px lower) with
  `getNumOfMedikits`.
- Where both sit comes from the game screen's marks in the Director score (`objScreen.startPrgs`;
  engine-mechanics-hud.md): `prg_potionmaster` is the rect (470, 0)-(608, 16), so the potions are
  right-aligned at the **top right**, in the 16 px strip above the room and flush with its right
  edge; `prg_medikitmaster` is (32, 0), the **top left** of that strip. They sit above the room,
  not over it.

## Port

- `src/mr-open/mr-pickup.ts`: the rules above as pure functions (potion boosts, the medikit heal
  counter, temp invincibility length, the writing fade). `src/sim/tick-pickup.ts`: the tick step
  (collision with Merlin, collection, the writing fade, the medikit heal, the invincibility
  countdown). `SimState.pickups` holds what potionMaster, modMedikit and modInvince keep for
  Merlin; `playerStatsOf` (src/sim/actors.ts) gives Merlin's definition with the potions drunk.
- The collection runs right after Merlin's move, with the other AI. Pickups are not units: they
  keep no exits closed, are never targeted or hit, and a room stores its uncollected pickups when
  Merlin leaves (a collected one fading out is dropped, as `setRecordInRoomState(false)`).
- A collected pickup plays its `writing` strip while it fades (`stripNameFor` maps the `collected`
  mode to it); until the spells slice (2026-10) it faded out on its stand frame.
- Temporary invincibility skips `loseEnergy` for Merlin; the renderer pulses his sprite's alpha in
  place of `pulseWhite`.
- **Remake decision (owner request, 2026-10): the M cheat gives one medikit.** The original's
  `#medikit` cheat calls `medikitCollected()` without a type: invincibility and full energy. The
  remake's M calls it with `#medikit`, as collecting a medikit does (`medikitCollected` in
  `src/sim/tick-pickup.ts`): the temporary invincibility, one more kit in stock and +25 energy at
  once, without the pickup's collect sound or writing.
- Sprites: each pickup's folder under `assets/sprites/<name>/` holds `stand` (the `_potion` member)
  and `writing` strips; the medikit's also `hudOn` / `hudOff`. **Remake decisions:** the maxikit's
  stand frame is cut from its merlinOpenObjects tile (46), the editor's picture of the same item,
  and it shows the medikit's writing (stand-ins from before the cast members were found; open item).
- HUD (`src/render/pickups.ts`): the potions drunk and the medikit display as above, at their
  marks in the strip above the play view (until 2026-10 both were right-aligned in the strip below).
- Starting charge (owner decision, 2026-10-22): `player.mana_capacity` 13 and `mana_flow` 3 in
  `assets/tuning.json` stay. They began as stand-ins for 4 Max Blast and 4 Quick Charge potions;
  without them (the engine's capacity 10 and flow 1) a full charge took about 13 ticks instead of
  5 and felt worse. To compensate, the random floors' start rooms give 3 potions instead of 4.
