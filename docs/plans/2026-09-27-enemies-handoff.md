# Handoff: enemy slice (goblin mage, dwellings, orcs)

Date: 2026-09-27. Written for a Claude Code cloud session continuing overnight without the owner.
Read `CLAUDE.md` first.

## Scope agreed with the owner

Port the goblin mage, goblin dwelling (goblin hut), orc archer (bowOrc), orc fighter (swordOrc) and
orc dwelling (orcHouse). The orc mage and other summoners wait (orcHouse may spawn `mageOrc`: skip
those residents or substitute, and note it).

## Inputs already in the repo

- Engine behaviour: `docs/notes/engine-mechanics-enemies-2.md` (read fully; it has the port plan
  hints and open questions), plus `docs/notes/engine-mechanics-combat.md` for what is already ported.
- Actor and team data: `assets/extracted/actors/*.txt`, `assets/extracted/teams/orcs.txt`. Move
  them into `assets/actors/` and `assets/teams/` as their sprites get wired in, and update
  `tools/copy-assets.ts` accordingly (its staged list).
- Sprites: `assets/extracted/bitmaps/*.png` (white = transparent) with `regpoints.tsv`. The
  converter currently decodes BMP frames only; add PNG frame support (pngjs is a dependency).

## Known work (from the notes)

1. Multi-frame attacks: `animFrame` can be a list (crossBow `[2,4,6]`, orcSword `[6,10,12]`);
   `buildAttack` turns lists into null today, so these enemies would never attack.
2. Per-actor `stallSpeed` (hard-coded 0.2 in `src/mr-open/mr-take-hit.ts`).
3. AI spell caster for the goblin mage (energyBlast weapon, casts at its target, dodges spells and
   bullets within 100 px, keeps ~100 px from enemies). Spell must carry the mage's team so it does
   not hurt goblins.
4. Dwelling object type: spawns residents in groups under the team cap, one per release interval,
   levels up, self-destructs after `totalResidents`; hittable (inertia 80), keeps exits closed
   (`exitsOpenFor` must count dwellings), leaves rubble/grave.
5. Test content: a map patch or a new generated map showing each new enemy.

## Decisions to make without the owner

Follow the engine where the notes are clear. Where unclear (e.g. the modResidents spawn delay bug,
orcHouse being on the goblins team), pick the engine's evident intent, make it tunable, and list
each such decision at the top of a new `docs/plans/2026-09-27-enemies-progress.md` for the owner to
review in the morning. Do not merge into `main` if anything is left half-done; leave the branch
with a clear status in that progress file.
