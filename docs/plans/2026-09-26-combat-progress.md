# Combat slice: execution progress

Plan: `docs/plans/2026-09-26-combat-plan.md` (deviations recorded at its end). Design: `docs/plans/2026-09-26-combat-design.md`. Engine notes: `docs/notes/engine-mechanics-combat.md` (port decisions at its end). Branch: `combat`.

## Status

| Task | What | Commits |
| --- | --- | --- |
| 1 | Actor, team and goblin sprite data; combat test map | 9c49f5e, 7d46b69 (goblin cluster in room 2, generator moved to `tools/`) |
| 2 | Lingo parser: identifiers, generic calls, bare decimals | 63b2c36 |
| 3 | Actor definition resolver and team data | b724628, 3675ea9, d368566, 56b30b9 |
| 4 | Converter: actors, teams, tuning overlay, combat atlases | 2bdc18d, 7b42c4c, fde2042 |
| 5 | Sim state with actors, seeded RNG, room spawning | 5a7000f |
| 6 | Nearest-hostile targeting | 53fce75 |
| 7 | CPU pathfinding and attack-seeking AI | 1c698ec |
| 8 | Attacks, hit scaling, reeling, regeneration | 835fc03 |
| 9 | Bullets and energy blast | 9ff56a0 |
| 10 | Combat tick | 06a0d2a |
| 11 | Loaders, rendering and HUD | 4e9d1b5, 9ee9299, 51b8754 |
| 12 | Notes, readme, tuning overlay docs | this commit |

Playtest fixes after Task 11: 834dcb9 (direct blast hits, eyestrain rounding, waiting AI), 62612b0 (hit while charging, grave loss, reel timing, arrows through walls, release strip end), 2dc3005 (nav mode), de15e02 (tick order and deviations), bdf9940 (vertical wall hits zero the player's vertical speed; a charging spell survives a room change).

## Verified in the browser by the user

- Movement and room changes on `mriv_small` and `combat_test` still behave as in the walk-and-rooms slice.
- Combat feel on `combat_test` is "quite accurate" compared with the original.
- Five playtest corrections, each fixed and re-checked: a hit while charging keeps the spell and holding resumes it; arrows fly through walls, as in the original; the exits open only after the last goblin's grave is down, so leaving at once no longer loses a grave; the release strip ends on its fourth frame; cleared rooms use the faster nav-mode walk.

## Open items

Engine quirks noted but not ported (the port keeps the simpler behaviour):

- The first frame shown after a strip reset lasts one tick less in the engine than its delay; the port shows every frame for its full delay.
- A one-frame strip never reports looped in the engine; the port sets `animLooped` on its last tick like any other strip.
- `VarRoughly(var, slack)` covers `[-slack+1, slack]` in the engine; the port's `roughly` is symmetric `[-slack, slack]` (eyestrain, scenic waypoints).

Next slice candidates:

- Goblin mage and the wizard (spell-casting enemies).
- Dwelling spawners (goblin huts releasing residents, `modResidents`).
- Pickups, including the `energyBlast` scroll, so the tuning overlay no longer has to grant the blast.
- Sounds (the list is in the combat notes, section 10).
- Experience and level-ups, once it is clear how the engine attributes kills (combat notes, Open questions).
