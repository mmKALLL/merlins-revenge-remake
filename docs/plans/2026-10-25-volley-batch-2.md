# Volley spells, second batch: draft for the owner to review

Each volley keeps its projectile's original stats: push (`power`), damage per hit (`damageMultiplier`)
and friction, which sets its range. On top of those it is tuned only through the volley data, which
keeps it close to the original. The data knobs are:
- charge speed
- maximum count
- fan style (even or random; a random fan's first shot is exact)
- fan width
- stagger between shots
- speed jitter

Two signature behaviours were agreed (2026-10-25): **blue flame chills** and **laser pierces**. Everything
else behaves as the original projectile does: smoke is a blast, and arrows do not pierce.

| Spell | Projectile (fired by) | Original push / dmg x / friction | Feel to aim for | Draft knobs |
|---|---|---|---|---|
| Boulder lob | boulder (boulder monster) | 2 / 1 / 4.5 | few heavy rocks, big knockback, medium range | slow charge, max 4, random, wide fan, long stagger |
| Dark rock | darkRock (dark golems), explodes | 1 / 1 / 10 | short-range bursting rocks, crowd control | slow charge, max 5, random, medium fan |
| Poison smoke | smoke (shrouder), explodes | 0.25 / 6 / 2 | long-range lingering-looking blasts, low push | medium charge, max 5, random, narrow-medium fan |
| Longbow | scArcherArrow (Scarlet archers, goblin tower) | 0.9 / 5 / 5 | few, fast, accurate | medium charge, max 4, even, very narrow fan, short stagger, no jitter |
| Dragon fire | fireBall (dragon flamethrower) | 0.2 / 6 / 4 | a fast, wide spray, low push | fast charge, max 10, random, widest fan, minimal stagger, high jitter |
| Blue flame | blueFlame (undead dragon) | 0.2 / 15 / 4 | fewer, heavy flames that **chill** | slow charge, max 5, random, medium fan; adds a short freeze |
| Fang bunny lob | fangBunnyBabyBullet (fang bunny babies) | 0.5 / 3 / 4 | cheap lobbed sparks, bouncy feel | fast charge, max 8, random, wide fan, high jitter |
| Freeze blast | freezeBlast (frosty monk), explodes, freezes | 0.25 / 1 / 3 | freezing area shots, low damage | slow charge, max 4, random, medium fan |
| Ice boulder | iceBoulder (ice rock) | (check) | heavy cold rocks | slow charge, max 4, random |
| Lightning | lightning (vulture guard) | 3.5 / 1 / 3 | huge push, long range, few | slow charge, max 3, even, narrow fan |
| Acid | acid (hydra) | 0.6 / 4 / 7 | short-range splashy push, many | medium charge, max 8, random, wide fan |
| Laser | laser (quadranid) | 0.3 / 10 / 3 | long, straight, **pierces** 2-3 enemies | medium charge, max 6, even, narrow fan, short stagger |
| Lizard eggs | lizardEgg, hatches | 0.5 / 5 / 2 | lobbed eggs that hatch allies | slow charge, max 3, random |
| Ostrich eggs | ostrichEgg, hatches | 0.3 / 6 / 5 | lobbed eggs that hatch allies | slow charge, max 3, random |
| Skull toss | skeletonHead (skeleton thrower), comedic | 1 / 3.5 / 3 | silly but solid | medium charge, max 5, random |

Open questions for the owner:
- Should the hatched units fight for Merlin, like a summon?
- What should the skull toss feel like?
- Should acid and laser be told apart further, beyond range, push and the pierce?
