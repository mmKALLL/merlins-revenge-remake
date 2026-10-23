# Unused original enemies and factions (audit, 2026-10-24)

What the original Merlin Open data has that the random floors (`src/gen/themes.ts`) don't use yet,
for planning new biomes in a roguelike mode. Taken from all 263 `act_*.txt` and the `tem_*.txt` team files in the
archive, checked against `assets/actors` (copied), `assets/sprites` and the cast dump (sprites), and
`themes.ts` (used). "Indirect" units are not listed in themes.ts but are spawned by something that is.

## Coverage by faction

| Faction | Used / units | Unused (copied, with sprites unless noted) | Biome hint |
|---|---|---|---|
| goblins + orcs | 10 / 12 | goblinHouse (dwelling), garTower; goblinBuilder not copied | forest (in use) |
| undead | 10 / 10, plus 8 indirect | (skeleton lord parts, undeadDragon via summons) | marsh (in use) |
| monsters | 12 / 19 | druid (healer), powerOstrich (+babyOstrich via eggs), evilTv + tvBox (dwelling) | canyon (in use), "weird wilds" |
| swamp | 3 / 4 | (hydra2 indirect) | swamp |
| magicalAlliance | 4 / 5 | techMech (not copied) | maze (in use) |
| scarlet | 3 / 8 | fireDragon, fireLizard, lavaDarkGolem, lavaGolem; scarletInGame (being ported) | fire / lava temple |
| karate | 3 / 5 | speedyGuy (the dojo spawns `#SpeedyGuy`, capital S); sumo (not copied) | dojo |
| cave | 2 / 6 | caveBat, fangBunny, fangBunnyBaby, fangBunnyPortal (dwelling, boss-sized) | burrow / cave |
| **ice** | **0 / 2** | frostyMonk, iceRock; iceAura / snowAura mines as hazards | ice / snow |
| **ninja** | **0 / 4** | ninja, swordNinja, shurikenNinja, mysteriousCloud (dwelling) | shadow / bamboo |
| invisible | 0 / 2 | orcInvasion, undeadInvasion (hidden wave spawners) | ambush events |
| blackSorcerer | 0 / 1 | ochreInGame (being ported) | final boss |

## Most promising for new biomes
1. **Ninja:** a complete faction with its own generator (mysteriousCloud).
2. **Fire / lava:** Scarlet's army plus fireDragon, fireLizard and the two lava golems give a full weak-to-strong ladder and ready bosses.
3. **Burrow:** the fang bunnies with their portal, plus cave bats, fill out the cave team.
4. **Ice:** frostyMonk and iceRock with the aura hazards. Only two units, so it needs a partner faction, e.g. ninja, or brawls with the undead it hates.
5. **Weird wilds:** powerOstrich (egg layer), evil TVs with the tvBox, and the druid healer.
6. **Extras:** the invasion spawners as ambush waves; goblinHouse with garTower once goblinBuilder is ported; undeadDragon and the skeleton parts as undead upgrades.

## Caveats
- **Not copied, cast frames only (would need porting):** sumo, techMech, goblinBuilder, monkGhost, and the in-game wizard twins.
- **Shared sprites:** fireDragon, fireLizard, lavaGolem and swordNinja reuse another unit's sprite, so they would need a tint to look different.
- **Teams with no fighting units:** fire and pitMonsters have only mines; invisible has only spawners.
