# Volley spells, second batch

## Built (2026-10-25)

Thirteen of the fifteen are in, on the first batch's rules (count from 0, full count at a capacity
tier, each projectile about 2.5x the enemy's shot, slow charge for most). Numbers, the chill and
pierce decisions and the test map layout: `docs/notes/engine-mechanics-spells.md`, "Volley spells,
second batch".

- Data only: Longbow, Dragon Fire, Boulder Lob, Dark Rock, Poison Smoke, Acid Splash, Lightning,
  Bunny Lob, Skull Toss (the skeleton thrower's head is an ordinary bullet), Frost Burst (the freeze
  blast freezes from its own payload) and Ice Boulder (also its own freeze payload; the art tool now
  finds its lower-case `anm_iceboulder` frames).
- Blue Flame chills: a new volley field `#chill` (a freezeMultiplier; 0 by default) adds `#takeFreeze`
  before the projectile's payload, with the teal glow. Blue flame: 4, about a second of halved speed.
- Laser pierces: a new volley field `#pierce` (0 by default); each laser flies on through 2 hostiles,
  hitting each once, and stops at the third.
- Changes from the draft: dragon fire is the only fast-charging one (owner rule: only small fast
  projectiles); the poison smoke and bunny lob charge slowly too; lightning, frost burst and ice
  boulder reach their full count at the hard tier (21), longbow too (few, strong, far).

Dropped: lizard and ostrich eggs (they hatch units: the open question below).

Owner's answers (2026-10-25):
- Eggs: build them; the hatched units fight for Merlin (as allies, like a summon). Not built yet.
- Frost burst and ice boulder keep the original freeze; lightning keeps its big push.
- Acid: almost 2x the range (rangeFactor 2.65, about 255 px), fan 15-50 (was 25-60), and its landed
  splash stays 15 ticks (was 30, `landedTicks` in `assets/tuning.json`).
- Laser: charge 30% slower (chargeSpeed 0.1815) and 7 at most (was 6; the owner first wrote 20%
  fewer, then meant more), the full charge still at tier 18 (chargePerShot 6).

Open: skull toss is a plain, solid volley (5 heads, power 1, 2.5x the thrower's damage); anything
sillier can come later.

## The draft (as reviewed)

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
| Longbow | scArcherArrow (Scarlet archers, goblin tower) | 0.9 / 5 / 5 | the high-power, few-count, accurate, far-reaching option (owner) | medium charge, max 4, even, very narrow fan, short stagger, no jitter |
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
