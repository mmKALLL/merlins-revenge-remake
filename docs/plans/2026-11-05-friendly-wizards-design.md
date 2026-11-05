# Friendly wizards, slice 1: allies (design, 2026-11-05)

The eight friendly wizards of Merlin Open (Amotonlin, Berlin, Flaetorlin, Foelin, Garonlin,
Prestotolin, Ulin, Verdanlin) as Merlin's allies. Slice 2, enemy wizards (palette swaps with boss
HP, used in the roguelite), gets its own design round later.

## How the original works

- `act_<name>InGame` (casts/data): `#objCPUCharacter`, `#objAiCPUSpellCaster`, team `#aldevar`,
  `#character #friendlyCharacter`, 200 energy, `#wizard: true`, `#leaveWhenFinished: true`, a punch
  as the natural attack and one of Merlin's spells as `#weapon`:

  | Wizard | Sprite name | Weapon |
  | --- | --- | --- |
  | Amotonlin | amo | arcticBlast |
  | Berlin | ber | energyBlast |
  | Flaetorlin | flaeto | cBlastAi |
  | Foelin | foe | monsterSummonAi |
  | Garonlin | garo | darkBlast |
  | Prestotolin | presto | energyPulseSpell |
  | Ulin | uli | healBlast |
  | Verdanlin | verdan | energyMines |

- Found: `objGameObject.init` calls `wizardMaster.newWizardFound` for any `#wizard` actor that
  enters play (objGameObject.txt:141). The first one found becomes the selected wizard.
- Reserve: as every `leaveWhenFinished` ally, the wizard teleports out into the reserve army
  (`armyTeleportOut`) once no target is found (objAiCPU.txt:232-236).
- Summon (`modSummonWizard.summonWizard`, key `#wizard`, bnd_wasd 3 = F): one wizard at a time.
  The selected wizard is created at the mouse if the reserve holds it, else the next one that is
  there; pressing again while one is out sends it home. `#wizardSelector` (bnd_wasd 15 = R) steps to
  the next found wizard. `modAutoSummon.summonArmy` (the C key) never includes wizards.
- HUD: `prg_wizardmaster` (top strip 72,0) shows the selected wizard's `<name>_off` bar, lit while
  one is out (`objWizardDisplayer`).
- Maps: about 25 original maps place wizards. Berlin is on most of them; Ulin is on mriiidemoii and
  roads_to_aldevar; Foelin and Flaetorlin are on tvsDemo; all eight are on very_big_map.

## Owner decisions (2026-11-05)

- Allies first; enemy wizards are slice 2.
- **R calls every wizard** (remake change): R calls the reserve army as now plus every wizard in
  the reserve, so several wizards can be out at once. No selector key, no wizard bar.
- Found wizards show in the reserve army display.
- Roguelite: a wizard is a floor-end reward.

## Design

1. **Data and sprites.**
   - `tools/copy-assets.ts` copies the eight `act_*linInGame` actors, `act_cBlastAi` and
     `act_monsterSummonAi` (the AI variants: a slower cBlast, and the random-stage monster summon,
     `randomSummon`, already ported).
   - It also copies the wizards' animation sets. Garonlin's `anm_garo_*` frames are only in the
     re-extracted reference bundle, so they come from there.
   - The wizard tiles of the original tile keys then resolve, and the original maps get their
     wizards.
2. **Found and in the reserve.**
   - As in the original, a wizard is found when it enters play.
   - It fights beside Merlin and, once no target is left, teleports into the reserve, as summoned
     allies already do.
   - A wizard that dies is gone.
3. **R** (remake decision, engine notes spells):
   - R summons the reserve army as now plus every wizard in the reserve, at the same spot.
   - After the fight R sends them all home together; the touch army button does the same.
   - Wizards do not count against the 12-member army cap, as the original's separate wizard call
     bypassed it.
4. **HUD.** Wizards in the reserve show first in the reserve army display (Right/Top), each as its
   stand frame.
5. **Roguelite.**
   - A new floor-end reward: a random wizard Merlin has not found yet joins the reserve. It is
     offered at low weight, like the reserved weapon rewards, and only while a wizard is still
     unfound.
   - Wizards carry over between floors with the army, and the run summary lists them.
6. **Testing.**
   - Tests: a wizard joins the reserve after its fight; R brings out every reserve wizard and sends
     them home; wizards leave the army cap alone; a dead wizard is not in the reserve.
   - A wizard room on a test map, for a manual look.
