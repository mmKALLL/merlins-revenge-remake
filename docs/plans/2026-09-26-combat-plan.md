# Combat Slice Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Goblin warriors and archers spawn from the map, chase and attack Merlin with the original AI and numbers; Merlin fights back with the energy blast; hits knock back and damage; enemies die into graves; exits open when the room's hostiles are dead; Merlin has an energy bar and the map restarts when he dies.

**Architecture:** Actors are plain records in the pure 30 Hz simulation (`src/sim`), driven by resolved actor definitions converted from the original `act_*.txt` files. Behaviour is ported one Lingo object per file into `src/mr-open` as pure functions. Randomness comes from a seeded generator in the sim state so tests are deterministic. Rendering stays in `src/render` and only reads state.

**Tech Stack:** unchanged (Vite, strict TypeScript, PixiJS 8, Vitest, tsx tools).

**Read first:** `docs/plans/2026-09-26-combat-design.md` (approved design) and `docs/notes/engine-mechanics-combat.md` (engine behaviour with Lingo line references; section numbers below refer to it). Also skim `docs/plans/2026-09-26-walk-and-rooms-plan.md` conventions and `src/sim/tick.ts` as it stands.

**Conventions (same as the first slice):**
- Nothing under `src/` or `tools/convert-assets.ts` reads `assets-mr-original/`; only `tools/copy-assets.ts` does.
- `src/mr-open/*` files start with a comment naming the Lingo source they port. Keep them pure: no PixiJS, no DOM, no mutation of inputs.
- Shared geometry types come from `src/mr-open/mr-geometry.ts` (`Vec`, `Rect`, `TILE_PX`).
- Commit after every task; messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Tests pin a representative set of numbers (design §6), not every actor.
- TDD per task: failing test, run, implement, run, commit.

**Engine facts used throughout (from the combat notes):**
- Actor data resolves parent -> child by shallow overwrite; a child's `#attack` list replaces the parent's wholesale; then `structAttack` defaults fill attack gaps (§1). Lingo symbols are case-insensitive: `#animframe` and `#animFrame` are the same key.
- Object-level defaults not in the data files (§1, §4): `energy 100` (player data sets 200), `maxEnergy = energy`, `friction (50,50)`, `frictionReel (10,10)`, `inertia 0`, `damageSpeed 5`, `energyRecoverDelay 300` for CPU characters and `30` for the player, `stallSpeed 0.2`, stall counter length `10`, `pathFindingStallTime 5`, `pathFindingDistance 100`, `moveToLocArrivalDistance 5`, retarget every `30` ticks.
- Walking AI: velocity is overwritten each tick with a vector of length `walkSpeed` toward the move target, no overshoot (§3). Friction does not apply to that walk; it applies while reeling.
- Melee: strike point = reg point + `collisionLoc` with x mirrored by facing; hit iff inside the target's sprite rect; push = `power * strength` with x mirrored; victim scales the push by `(100 - inertia)/100`, adds it to velocity; damage = `(|px| + |py|) * attacker.damageMultiplier` (§4).
- Ranged: fires when `dist² < reach²`; on the attack frame spawns the bullet at the mirrored `collisionLoc`; target point gets eyestrain error `±e` per axis where `e = eyestrain * dist / reach`; `#fullstrength` velocity has length `strength` toward that point; bullet push = velocity * `power` (0.5); one `takeHit` per hit (the engine's double call is a recorded quirk, not ported) (§4).
- Cooldown: counter of length `cooldown`, advanced per tick by `agility` (melee), `dexterity` (ranged) or `mana_regeneration` (magic); ready when it reaches the end; reset on attack (§3).
- Spell (§5): `chargeMax = min(chargeMax, mana_capacity * chargeMaxModifier + chargeMaxBasic)`; `chargeStart = min(chargeStart + mana_burst, chargeMax)`; `chargeSpeed = chargeSpeed * mana_flow`; release = velocity of length `spellSpeed` toward the target point; arrival = passed the target on both axes; explode: `charge *= chargeExplodeFactor`; `radius = charge / 2`; victims within `radius + targetRadius` (`targetRadius` = sprite width / 2); push length `(radius + targetRadius - dist) * power` toward the victim.
- Reel (§6): friction becomes 10%; the reel ends when the stall counter (advanced when `|vx| + |vy| <= 0.2`, reset otherwise) reaches 10; tile collision applies while reeling; the AI is dazed. The player never reels: full push, back to walk.
- Death (§7): energy <= 0 -> `die` (one tick) -> `dead` (grave strip plays once) -> `finish` (grave recorded on the room, actor removed). Exits open iff every team whose first-priority hate group contains the player's team has no living members in the room.
- Characters never block each other (§8).

---

### Task 1: Copy actor data, team data and combat sprites into assets; add a combat test map

**Files:**
- Modify: `tools/copy-assets.ts`
- Create: `assets/maps/combat_test.txt`
- Modify: `assets/README.md`

**Step 1: Extend `tools/copy-assets.ts`**

Add copies (keep the existing table style with a `why` per entry):
- `casts/data/act_<name>.txt` -> `assets/actors/<name>.txt` for: `actor`, `actorPlayer`, `character`, `CPUCharacter`, `player`, `goblinWarrior`, `goblinArcher`, `goblinSword`, `goblinBow`, `goblinArrow`, `weapon`, `bullet`, `energyBlast`, `spell`.
- `casts/data/tem_goblins.txt` -> `assets/teams/goblins.txt`, `casts/data/tem_aldevar.txt` -> `assets/teams/aldevar.txt`.
- Every `anm_*.bmp` from `gfx/goblinWarrior/` -> `assets/sprites/goblinWarrior/`; every `anm_gar_*.bmp` from `gfx/goblinArcher/` -> `assets/sprites/gar/`; `anm_gobarrow_*.bmp` from `gfx/goblinArcher/` -> `assets/sprites/gobarrow/`; `gfx/goblinArcher/goblin_grave.bmp` -> `assets/sprites/goblinWarrior/anm_goblinWarrior_grave_3_01.bmp` AND `assets/sprites/gar/anm_gar_grave_3_01.bmp` (the engine registers one cast member under both names; the copy step makes that explicit, say so in the `why`); `gfx/spells/anm_spell_charge_03_01.bmp` -> `assets/sprites/spell/anm_spell_charge_03_01.bmp`.

Write a small helper `copyGlob(fromDir, pattern: RegExp, toDir, why)` so the sprite loops are one line each.

**Step 2: Write `assets/maps/combat_test.txt`**

A hand-written map in the original Lingo format, 2x1 rooms of 18x9 tiles using the merlin4 tilesets. Passive layer: every tile `12` (the grass used by mriv_small room 1). Active layer: a ring of `1` (solid) around each room's edge, plus `1` at rows 3-6 of column 9 in room 1 (a short wall in the middle), and everything else `0`. The ring must leave a gap on the shared edge between the rooms at rows 4 and 5 (columns 18 of room 1 and 1 of room 2 set to `0`) so Merlin can cross. Objects layer (merlin4Objects indices: `player` = 1, `goblinArcher` = 21, `goblinWarrior` = 22): room 1: player at column 4 row 5, goblinWarrior at column 15 row 5; room 2: goblinArcher at column 10 row 4 and goblinWarrior at column 14 row 7.

Generate the text with a short throwaway script rather than by hand (18x9 arrays), keeping the exact syntax of `assets/maps/tvsDemo.txt`: `[#map: [#mapSize: point(2, 1), #roomSize: point(18, 9), #startRoom: point(1, 1), #endRoom: #none, #layerDefinitions: [[#name: #backgroundPassive, #tileSet: #merlin4Passive, #displayScale: 1], [#name: #backgroundActive, #tileSet: #merlin4Active, #displayScale: 1], [#name: #objects, #tileSet: #merlin4Objects, #displayScale: 1]], #rooms: [[#num: 1, #layers: [[#name: #backgroundPassive, #map: [...]], [#name: #backgroundActive, #map: [...]], [#name: #objects, #map: [...]]]], [#num: 2, ...]]]]`. Verify it parses with the existing parser (`pnpm assets:convert` must print `map combat_test: 2x1 rooms`).

**Step 3: Update `assets/README.md`** with `actors/`, `teams/`, the new sprite folders, and `combat_test.txt` (hand-made test map, not from the archive).

**Step 4: Verify**

Run: `pnpm assets:copy && pnpm assets:convert`
Expected: the new files exist; converter prints `map combat_test: 2x1 rooms`. (Sprites for the new folders are not yet converted; that is Task 4.)

**Step 5: Commit**

```bash
git add tools/copy-assets.ts assets
git commit -m "Copy actor, team and goblin sprite data; add combat test map"
```

---

### Task 2: Lingo parser extensions

The actor files use syntax the parser rejects: bare identifiers (`gGameObjectLayer`, `gPlayerLayer`), calls with non-numeric or nested arguments (`random(450)`, `member("energyBlast_scroll", "gfx")`, `point(random(450), 300)`), and numbers written `.5`.

**Files:**
- Modify: `src/mr-open/mr-lingo-plist.ts`, `src/mr-open/mr-lingo-plist.test.ts`

**Step 1: Failing tests** (append to the existing describe)

```ts
  it('parses bare identifiers as references', () => {
    expect(parseLingo('[#layerZ: gGameObjectLayer]')).toEqual({ layerZ: { ident: 'gGameObjectLayer' } })
  })

  it('parses generic calls with nested arguments', () => {
    expect(parseLingo('point(random(450), 300)')).toEqual({ call: 'point', args: [{ call: 'random', args: [450] }, 300] })
    expect(parseLingo('member("a", "gfx")')).toEqual({ call: 'member', args: ['a', 'gfx'] })
  })

  it('still returns plain points and colours for numeric point() and rgb()', () => {
    expect(parseLingo('point(1, 2)')).toEqual({ x: 1, y: 2 })
  })

  it('parses numbers without a leading zero', () => {
    expect(parseLingo('[#a: .5, #b: -.25]')).toEqual({ a: 0.5, b: -0.25 })
  })
```

**Step 2: Run** `pnpm vitest run src/mr-open/mr-lingo-plist.test.ts` -> the new tests fail.

**Step 3: Implement**

- Add `LingoIdent = { ident: string }` and `LingoCall = { call: string; args: LingoValue[] }` to the `LingoValue` union.
- In `value()`, when the next char is a letter: read the identifier; skip whitespace; if the next char is `(` parse a comma-separated list of `value()` (not only numbers) until `)`; if the name is `point` with two numeric args return `{x, y}`, if `rgb` with three numeric args return `{r, g, b}`, otherwise return `{ call, args }`. If there is no `(`, return `{ ident: name }`.
- In `number()`, accept an optional `-` then digits and/or a `.`; `Number('.5')` already works, so just allow the leading `.` in the start test (`/[-0-9.]/` is already there; make sure `-.25` is accepted by allowing `.` right after `-`).
- Add `isIdent`/`isCall` guards next to `isSymbol`.

**Step 4: Run** the file -> all pass. Run `pnpm test` -> everything else still passes (the map and tile-key parsers only ever see numeric points).

**Step 5: Commit** `git commit -m "Extend Lingo parser with identifiers, generic calls and bare decimals"`

---

### Task 3: Actor definition resolver and team data

Port of `actorMaster.retrieveActorData` (§1) plus `structMaster.structAttack` defaults and the object-level defaults listed at the top of this plan.

**Files:**
- Create: `src/mr-open/mr-actor-data.ts`, `src/mr-open/mr-actor-data.test.ts`, `src/mr-open/mr-team-data.ts`, `src/mr-open/mr-team-data.test.ts`

**Step 1: Failing tests `mr-actor-data.test.ts`**

```ts
import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { resolveActors, type ActorDef } from './mr-actor-data'

function loadFiles(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const f of readdirSync('assets/actors')) out[f.replace(/\.txt$/, '')] = readFileSync(`assets/actors/${f}`, 'utf8')
  return out
}

describe('resolveActors', () => {
  const defs = resolveActors(loadFiles())

  it('resolves the goblin warrior through CPUCharacter, character and actor', () => {
    const w = defs['goblinWarrior']!
    expect(w.objType).toBe('objCPUCharacter')
    expect(w.aiType).toBe('objAiCPU')
    expect(w.team).toBe('goblins')
    expect(w.name).toBe('goblinWarrior')
    expect(w.walkSpeed).toBe(4)
    expect(w.strength).toBe(4)
    expect(w.inertia).toBe(30)
    expect(w.energy).toBe(100) // object default, not in the data files
    expect(w.frictionReel).toEqual({ x: 10, y: 10 })
    expect(w.weapon).toBe('goblinSword')
    expect(w.energyRecoverDelay).toBe(300)
  })

  it('installs the starting weapon attack with struct defaults filled in', () => {
    const a = defs['goblinWarrior']!.attack
    expect(a.type).toBe('melee')          // derived from animType weaponMelee
    expect(a.animFrame).toBe(7)           // from #animframe (case-insensitive key)
    expect(a.collisionLoc).toEqual({ x: 15, y: 0 })
    expect(a.idealAttackLoc).toEqual({ x: 15, y: 0 })
    expect(a.power).toEqual({ x: 0.7, y: 0 })
    expect(a.damageMultiplier).toBe(2)
    expect(a.cooldown).toBe(0)
    expect(a.reach).toBe(25)              // struct default, unused for melee
  })

  it('resolves the archer with a ranged attack', () => {
    const g = defs['goblinArcher']!
    expect(g.energy).toBe(50)
    expect(g.attack.type).toBe('ranged')
    expect(g.attack.bullet).toBe('goblinArrow')
    expect(g.attack.reach).toBe(100)
    expect(g.attack.cooldown).toBe(200)
    expect(g.attack.firingType).toBe('fullstrength')
  })

  it('resolves the player with the energy blast as its current attack', () => {
    const p = defs['player']!
    expect(p.energy).toBe(200)
    expect(p.energyRecoverDelay).toBe(30)
    expect(p.mana_capacity).toBe(10)
    expect(p.attack.type).toBe('magic')
    expect(p.attack.chargeMaxBasic).toBe(5)
    expect(p.attack.spellSpeed).toBe(20)
    expect(p.attack.power).toBe(0.75)
  })

  it('resolves the arrow as a bullet with power 0.5 and friction 5%', () => {
    const b = defs['goblinArrow']!
    expect(b.objType).toBe('objBullet')
    expect(b.attack.power).toBe(0.5)
    expect(b.attack.damageMultiplier).toBe(3)
    expect(b.friction).toEqual({ x: 5, y: 5 })
    expect(b.name).toBe('gobarrow')
  })

  it('applies a tuning overlay last', () => {
    const tuned = resolveActors(loadFiles(), { goblinArcher: { attack: { reach: 120 } } })
    expect(tuned['goblinArcher']!.attack.reach).toBe(120)
    expect(tuned['goblinArcher']!.attack.cooldown).toBe(200)
  })

  it('fails loudly on a missing parent', () => {
    expect(() => resolveActors({ x: '[#name: "act_x", #type: #field]\n[#inherit: #nope]' })).toThrow(/x.*nope/)
  })
})
```

**Step 2: Run** -> fails (module missing).

**Step 3: Implement `src/mr-open/mr-actor-data.ts`**

```ts
// Port of actorMaster.retrieveActorData (inheritance), structMaster.structAttack (attack defaults),
// AttackSetTypeFromAnimType, and the object/module defaults from objGameObject, modEnergy,
// objMoveXY, modPathFinding, modMoveToLoc that the data files rely on.
import { isSymbol, parseLingo, type LingoValue } from './mr-lingo-plist'
import type { Vec } from './mr-geometry'

export type AttackType = 'melee' | 'ranged' | 'magic' | 'bullet' | 'none'

export interface AttackDef {
  name: string
  type: AttackType
  animType: string
  animFrame: number | null
  collisionLoc: Vec
  idealAttackLoc: Vec
  reach: number
  cooldown: number
  power: number | Vec
  damageMultiplier: number
  bullet: string | null
  firingType: 'proportional' | 'fullstrength'
  hits: string[]
  chargeStart: number
  chargeMax: number
  chargeMaxBasic: number
  chargeMaxModifier: number
  chargeSpeed: number
  chargeSize: number
  chargeExplodeFactor: number
  chargeColour: { r: number; g: number; b: number }
  spellSpeed: number
  limitMagic: boolean
  sound: string | null
  releaseSound: string | null
  explodeSound: string | null
}

export interface ActorDef {
  key: string
  name: string
  objType: string
  aiType: string | null
  team: string
  layerZ: string
  startOffset: Vec
  energy: number
  energyRecoverDelay: number
  friction: Vec
  frictionReel: Vec
  inertia: number
  damageSpeed: number
  walkSpeed: number
  walkAcceleration: number
  strength: number
  agility: number
  dexterity: number
  eyestrain: number
  mana_burst: number
  mana_capacity: number
  mana_flow: number
  mana_regeneration: number
  weapon: string | null
  experienceImWorth: number
  attack: AttackDef
  /** every resolved raw property, canonical-cased, for later slices */
  raw: Record<string, unknown>
}

// structMaster.structAttack (only the fields this port reads; others stay in raw)
const ATTACK_DEFAULTS = {
  animFrame: 2, animType: 'none', bullet: null, chargeColour: { r: 255, g: 255, b: 255 }, chargeExplodeFactor: 4,
  chargeMax: 5, chargeMaxBasic: 0, chargeMaxModifier: 1, chargeSize: 1, chargeSpeed: 1, chargeStart: 1,
  collisionLoc: { x: 25, y: 0 }, idealAttackLoc: 'collisionLoc', cooldown: 0, damageMultiplier: 1,
  explodeSound: null, firingType: 'proportional', hits: ['teamMembers'], limitMagic: false, name: 'none',
  power: { x: 5, y: -1 }, reach: 25, releaseSound: null, sound: null, spellSpeed: 2, type: 'auto',
} as const

// Object-level defaults (objGameObject / modEnergy / objMoveXY / modMoveToLoc) by objType
const OBJECT_DEFAULTS: Record<string, Partial<Record<string, unknown>>> = {
  '*': { energy: 100, friction: { x: 50, y: 50 }, frictionReel: { x: 10, y: 10 }, inertia: 0, damageSpeed: 5,
         walkSpeed: 0, walkAcceleration: 0.5, strength: 1, agility: 1, dexterity: 1, eyestrain: 0,
         mana_burst: 1, mana_capacity: 10, mana_flow: 1, mana_regeneration: 1, experienceImWorth: 0,
         energyRecoverDelay: 300, startOffset: { x: -16, y: -16 }, team: 'chatters', layerZ: 'gGameObjectLayer' },
  objPlayerMerlinCharacter: { energyRecoverDelay: 30 },
}

/** Canonical camelCase spellings; Lingo symbols are case-insensitive. */
const CANONICAL = new Map<string, string>()
for (const k of [...Object.keys(ATTACK_DEFAULTS), 'objType', 'AiType', 'inherit', 'attack', 'team', 'name', 'layerZ',
  'startOffset', 'energy', 'energyRecoverDelay', 'friction', 'frictionReel', 'inertia', 'damageSpeed', 'walkSpeed',
  'walkAcceleration', 'strength', 'agility', 'dexterity', 'eyestrain', 'mana_burst', 'mana_capacity', 'mana_flow',
  'mana_regeneration', 'weapon', 'experienceImWorth', 'character', 'weight', 'minimapStatus', 'miniMapStatus']) {
  CANONICAL.set(k.toLowerCase(), k)
}
export function canonicalKey(k: string): string { return CANONICAL.get(k.toLowerCase()) ?? k }

type Plain = Record<string, unknown>

function toPlain(v: LingoValue): unknown {
  if (Array.isArray(v)) return v.map(toPlain)
  if (isSymbol(v)) return v.sym
  if (typeof v === 'object' && v !== null && 'ident' in v) return (v as { ident: string }).ident
  if (typeof v === 'object' && v !== null && 'call' in v) return null // random(), member(): not data we use
  if (typeof v === 'object' && v !== null && !('x' in v) && !('r' in v)) {
    const out: Plain = {}
    for (const [k, val] of Object.entries(v as Plain)) out[canonicalKey(k)] = toPlain(val as LingoValue)
    return out
  }
  return v
}

/** The data field's second Lingo list (the first line is the field header). */
function parseActorFile(text: string): Plain {
  const body = text.slice(text.indexOf('\n') + 1)
  const v = toPlain(parseLingo(body))
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error('actor file is not a property list')
  return v as Plain
}

function resolveChain(key: string, files: Record<string, Plain>, seen: string[] = []): Plain {
  const own = files[key]
  if (!own) throw new Error(`actor ${seen[seen.length - 1] ?? key}: unknown parent ${key}`)
  if (seen.includes(key)) throw new Error(`actor ${key}: inheritance cycle`)
  const parentKey = own['inherit'] as string | undefined
  const base = parentKey ? resolveChain(parentKey, files, [...seen, key]) : {}
  // shallow overwrite; #attack replaces wholesale (retrieveActorData)
  return { ...base, ...own }
}

function deepMerge(a: Plain, b: Plain): Plain {
  const out: Plain = { ...a }
  for (const [k, v] of Object.entries(b)) {
    const cur = out[k]
    out[k] = typeof v === 'object' && v !== null && !Array.isArray(v) && typeof cur === 'object' && cur !== null && !Array.isArray(cur)
      ? deepMerge(cur as Plain, v as Plain) : v
  }
  return out
}

function attackTypeFromAnim(animType: string, explicit: string): AttackType {
  if (explicit !== 'auto') return explicit as AttackType
  if (animType === 'magic') return 'magic'
  if (['naturalMelee', 'weaponMelee', 'magicMelee'].includes(animType)) return 'melee'
  if (['naturalRanged', 'weaponRanged'].includes(animType)) return 'ranged'
  return 'none'
}

function buildAttack(rawAttack: Plain | undefined): AttackDef {
  const a: Plain = { ...ATTACK_DEFAULTS, ...(rawAttack ?? {}) }
  if (a['idealAttackLoc'] === 'collisionLoc') a['idealAttackLoc'] = a['collisionLoc']
  const animType = String(a['animType'])
  return {
    name: String(a['name']), animType,
    type: attackTypeFromAnim(animType, String(a['type'])),
    animFrame: typeof a['animFrame'] === 'number' ? a['animFrame'] : null,
    collisionLoc: a['collisionLoc'] as Vec, idealAttackLoc: a['idealAttackLoc'] as Vec,
    reach: typeof a['reach'] === 'number' ? a['reach'] : 25,
    cooldown: Number(a['cooldown']), power: a['power'] as number | Vec,
    damageMultiplier: Number(a['damageMultiplier']),
    bullet: typeof a['bullet'] === 'string' && a['bullet'] !== 'none' ? a['bullet'] : null,
    firingType: a['firingType'] === 'fullstrength' ? 'fullstrength' : 'proportional',
    hits: a['hits'] as string[],
    chargeStart: Number(a['chargeStart']), chargeMax: Number(a['chargeMax']), chargeMaxBasic: Number(a['chargeMaxBasic']),
    chargeMaxModifier: Number(a['chargeMaxModifier']), chargeSpeed: Number(a['chargeSpeed']), chargeSize: Number(a['chargeSize']),
    chargeExplodeFactor: Number(a['chargeExplodeFactor']), chargeColour: a['chargeColour'] as AttackDef['chargeColour'],
    spellSpeed: Number(a['spellSpeed']), limitMagic: a['limitMagic'] === true,
    sound: strOrNull(a['sound']), releaseSound: strOrNull(a['releaseSound']), explodeSound: strOrNull(a['explodeSound']),
  }
}
function strOrNull(v: unknown): string | null { return typeof v === 'string' && v !== 'none' ? v : null }

/**
 * files: actor key (e.g. "goblinWarrior") -> raw text of act_<key>.txt.
 * tuning: optional deep overlay applied after resolution.
 * A character's starting weapon (`#weapon`) supplies its attack (modWeaponManager.initStartingWeapon);
 * the player uses energyBlast's attack in this slice (granted at start, no pickup yet).
 */
export function resolveActors(files: Record<string, string>, tuning: Record<string, Plain> = {}): Record<string, ActorDef> {
  const parsed: Record<string, Plain> = {}
  for (const [k, text] of Object.entries(files)) parsed[k] = parseActorFile(text)
  const out: Record<string, ActorDef> = {}
  for (const key of Object.keys(parsed)) {
    let r = resolveChain(key, parsed)
    const objType = String(r['objType'] ?? 'objGameObject')
    r = { ...OBJECT_DEFAULTS['*'], ...(OBJECT_DEFAULTS[objType] ?? {}), ...r }
    // starting weapon installs its attack (modWeaponManager.start)
    const weapon = typeof r['weapon'] === 'string' ? r['weapon'] : null
    let rawAttack = r['attack'] as Plain | undefined
    if (weapon && parsed[weapon]) rawAttack = resolveChain(weapon, parsed)['attack'] as Plain
    if (key === 'player' && parsed['energyBlast']) rawAttack = resolveChain('energyBlast', parsed)['attack'] as Plain
    r = deepMerge(r, tuning[key] ?? {})
    if (tuning[key]?.['attack']) rawAttack = deepMerge(rawAttack ?? {}, tuning[key]!['attack'] as Plain)
    const vec = (k: string): Vec => r[k] as Vec
    out[key] = {
      key, name: String(r['name'] ?? key), objType, aiType: strOrNull(r['AiType']), team: String(r['team']),
      layerZ: String(r['layerZ']), startOffset: vec('startOffset'), energy: Number(r['energy']),
      energyRecoverDelay: Number(r['energyRecoverDelay']), friction: vec('friction'), frictionReel: vec('frictionReel'),
      inertia: Number(r['inertia']), damageSpeed: Number(r['damageSpeed']), walkSpeed: Number(r['walkSpeed']),
      walkAcceleration: Number(r['walkAcceleration']), strength: Number(r['strength']), agility: Number(r['agility']),
      dexterity: Number(r['dexterity']), eyestrain: Number(r['eyestrain']), mana_burst: Number(r['mana_burst']),
      mana_capacity: Number(r['mana_capacity']), mana_flow: Number(r['mana_flow']), mana_regeneration: Number(r['mana_regeneration']),
      weapon, experienceImWorth: Number(r['experienceImWorth']), attack: buildAttack(rawAttack), raw: r,
    }
  }
  return out
}
```

Note: `toPlain` turns `point(random(450), 300)` into `null` for `initLoc`, which nothing reads. The `weapon` files inherit from `weapon` -> `actor`, which is why all parents are copied.

**Step 4: Run** `pnpm vitest run src/mr-open/mr-actor-data.test.ts` -> pass. If `reach` for the sword comes out as something other than 25, check `#reach` is absent in `act_goblinSword.txt` (it is) and that the defaults merge order is right.

**Step 5: Team data.** `src/mr-open/mr-team-data.ts` parses `tem_*.txt` the same way (`parseActorFile` style) into `{ teamName, category, hates: string[][], friends: string[] }` and exports `parseTeams(files): Record<string, TeamDef>` and `hostileTeamsTo(playerTeam, teams): string[]` = teams whose `hates[0]` includes `playerTeam` or `'all'` (§7). Test with the two real files: `hostileTeamsTo('aldevar', teams)` equals `['goblins']` and `teams['aldevar'].hates[0]` contains `'goblins'`.

**Step 6: Commit** `git commit -m "Port actor data resolution and team data"`

---

### Task 4: Converter outputs actors, teams, tuning overlay and the new atlases

**Files:**
- Modify: `tools/convert-assets.ts`
- Create: `assets/tuning.json` (`{}`)

**Steps:**
1. Read every `assets/actors/*.txt` into `{ key: text }`, read `assets/tuning.json`, call `resolveActors(files, tuning)`, write `public/generated/actors.json`. Log `actors: N resolved (M tuned)`.
2. Read `assets/teams/*.txt`, `parseTeams`, write `public/generated/teams.json`.
3. Build atlases for every folder under `assets/sprites/` (currently `merlin`, `goblinWarrior`, `gar`, `gobarrow`, `spell`) with the existing `buildAtlas`; the folder name is the sprite name. Log one line each.
4. Fail the conversion (non-zero exit) if any resolved actor with `objType` in `{objCPUCharacter, objPlayerMerlinCharacter}` has no atlas for its `name`, or a bullet/spell has none; print which.
5. `pnpm assets:convert` -> expected lines include `actors: 14 resolved`, `sprites goblinWarrior: 5 animations` (stand, walk, reel, weaponMelee, grave), `sprites gar: 5 animations`, `sprites gobarrow: 2 animations`, `sprites spell: 1 animations`. View `public/generated/sprites/goblinWarrior.png` with the Read tool.
6. Commit `git commit -m "Convert actors, teams, tuning overlay and combat sprite atlases"`

---

### Task 5: Sim state with actors, seeded RNG, and the player as an actor

Refactor the sim to hold an actor list. Behaviour for the player is unchanged; existing tests keep passing after updating accessors.

**Files:**
- Modify: `src/sim/state.ts`, `src/sim/tick.ts`, `src/sim/tick.test.ts`
- Create: `src/sim/rng.ts`, `src/sim/rng.test.ts`, `src/sim/actors.ts`

**Step 1: `src/sim/rng.ts`** (mulberry32; pure: returns next state and value)

```ts
export type Rng = { seed: number }
/** Returns [value in [0,1), next rng]. */
export function nextRandom(r: Rng): [number, Rng] {
  let t = (r.seed + 0x6d2b79f5) >>> 0
  let x = Math.imul(t ^ (t >>> 15), 1 | t)
  x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x
  return [((x ^ (x >>> 14)) >>> 0) / 4294967296, { seed: t }]
}
/** VarRoughly(0, e): uniform in [-e, e] (integer e). */
export function roughly(r: Rng, e: number): [number, Rng] {
  const [v, n] = nextRandom(r)
  return [Math.round(v * 2 * e - e), n]
}
```
Test: same seed gives the same sequence; values within range; `roughly(r, 0)` is 0.

**Step 2: State shapes in `src/sim/state.ts`** (replace `PlayerState`; keep `InputSnapshot`, `NO_INPUT`, `TICK_MS`, `AnimationSet`)

```ts
export type ActorMode = 'stand' | 'walk' | 'weaponMelee' | 'weaponRanged' | 'charge' | 'release' | 'reel'
  | 'die' | 'dead' | 'finish' | 'fly' | 'land' | 'explode'

export type AiMode = 'findTarget' | 'moveToAttack' | 'attack' | 'dazed' | 'none'

export interface AiState {
  mode: AiMode
  targetId: number | null
  retargetCounter: number       // ticks since last retarget (retarget at 30)
  pathMode: 'beeline' | 'scenic'
  waypoint: Vec | null
  pathStall: number             // consecutive stalled ticks (pathFindingStallTime 5)
  moveTarget: Vec | null        // modMoveToLoc target; null = not moving
}

export interface ActorState {
  id: number
  def: string                   // key into defs
  team: string
  pos: Vec
  prevPos: Vec
  vel: Vec
  facingLeft: boolean
  mode: ActorMode
  anim: string
  animFrame: number
  animCounter: number
  animLooped: boolean           // set on the tick the strip wrapped
  energy: number
  regenCounter: number
  cooldown: number              // remaining counter units; ready when <= 0
  stall: number                 // objMoveXY stall counter (reel end at 10)
  frictionPercent: Vec
  ai: AiState
  // projectiles and spells
  ownerId: number | null
  targetId: number | null
  targetPoint: Vec | null
  charge: number
  age: number
}

export interface RoomState {
  spawned: boolean
  actors: ActorState[]          // survivors stored when the player leaves
  graves: { def: string; pos: Vec }[]
  clear: boolean
}

export interface SimState {
  tick: number
  grid: WorldGrid
  defs: Record<string, ActorDef>
  teams: Record<string, TeamDef>
  anims: Record<string, AnimationSet>   // sprite name -> strips
  room: Vec
  rooms: Record<string, RoomState>      // key `${x},${y}`
  exitsOpen: boolean
  actors: ActorState[]
  nextId: number
  rng: Rng
  playerId: number
  restartRequested: boolean
  events: SimEvent[]            // per-tick, for rendering/sound (cleared each tick)
}

export type SimEvent =
  | { kind: 'explode'; pos: Vec; radius: number }
  | { kind: 'hit'; id: number }
  | { kind: 'died'; id: number }
  | { kind: 'exitsOpened' }
```

`SimConfig` keeps `collisionRect` for the player only until Task 8 moves collision rects onto actors (via frame size from the atlas); leave a TODO comment.

**Step 3: `src/sim/actors.ts`**: `createActor(s, defKey, pos): [ActorState, SimState]` (allocates id, energy from def, friction from def, mode `walk` for characters, `fly` for bullets/spells, ai mode `findTarget` when `aiType === 'objAiCPU'` else `none`); `spawnRoomActors(s, room)` walks the room's objects layer (§2): tile symbol -> def key; `player` spawns only if no player exists; unknown or unsupported (objType not in `objCPUCharacter`) symbols are skipped and collected into `s.events`-independent `console.warn` once per key (keep a module-level Set); position = tile centre. `collisionRectFor(s, actor)` = `collisionRectForFrame(w, h)` from the atlas's current frame; add frame sizes to `AnimationSet` (extend the loader in Task 11 and the test fixtures: `{ frames, delay, w, h }`).

**Step 4: Refactor `tick.ts`**: `createSim(grid, defs, teams, anims, seed)` creates the player from `findStartPos` and spawns room actors; `stepSim` runs the player exactly as before but through the actor record (read `s.actors[s.playerId]`), then advances animation for every actor generically (shared `advanceAnim(actor, strip)` that also sets `animLooped`). Non-player actors do nothing yet. Room change: store survivors in `rooms[old].actors`, restore or spawn `rooms[new]`.

**Step 5: Update `tick.test.ts`** to the new constructor (a tiny `defs` fixture with a `player` def: `energy 200`, `walkAcceleration 2`, and `anims: { mer: {...} }`) and `s.actors[s.playerId]` accessors. Add `spawnRoomActors` tests: a map with a `goblinWarrior` object tile spawns one actor at the tile centre with team `goblins`, energy 100 and ai mode `findTarget`; an unknown symbol spawns nothing; the player is not spawned twice; leaving and re-entering a room keeps the same enemy (by id) rather than spawning again.

**Step 6:** `pnpm test`, `pnpm tsc --noEmit`, `pnpm build` green. Update `src/main.ts` and `src/render/scene.ts` minimally so they compile (render actor 0 as before; Task 11 does the real rendering).

**Step 7: Commit** `git commit -m "Hold actors in sim state with a seeded RNG; spawn room actors"`

---

### Task 6: Targeting

Port of `teamMaster.findTarget` / `findTargetInTeam` (§3), simplified to the full scan (the unit-map shell search is a performance path with the same result except ring ordering; note this in the file comment).

**Files:**
- Create: `src/mr-open/mr-targeting.ts`, `src/mr-open/mr-targeting.test.ts`

```ts
// Port of teamMaster.findTarget / calcTargetTeamsByAllegiance / findTargetInTeam (#closestDistance).
import type { Vec } from './mr-geometry'
export interface Targetable { id: number; team: string; pos: Vec; alive: boolean }
export function hatedTeams(myTeam: string, teams: Record<string, { hates: string[][] }>): string[] {
  return teams[myTeam]?.hates[0] ?? []
}
/** Nearest living member of any first-priority hated team by squared reg-point distance. */
export function findTarget(me: Targetable, candidates: Targetable[], hated: string[]): number | null {
  let best: number | null = null, bestD = Infinity
  for (const c of candidates) {
    if (c.id === me.id || !c.alive || !hated.includes(c.team)) continue
    const d = (c.pos.x - me.pos.x) ** 2 + (c.pos.y - me.pos.y) ** 2
    if (d < bestD) { bestD = d; best = c.id }
  }
  return best
}
```
Tests: picks the nearest hostile, ignores dead and friendly, returns null when none; ties keep the first.

Commit `git commit -m "Port nearest-hostile target selection"`

---

### Task 7: Pathfinding and the CPU AI mode machine

**Files:**
- Create: `src/mr-open/mr-pathfinding.ts` (+test), `src/mr-open/mr-ai-cpu.ts` (+test)

**`mr-pathfinding.ts`** (port of `modPathFinding`, `modMoveToLoc.moveTowardsLocSpeed`, `PointFrameMove`, `PointRoughly`):

```ts
import type { Vec } from './mr-geometry'
import { roughly, type Rng } from '../sim/rng'   // allowed: rng is a pure helper with no sim dependency

export const PATH_STALL_TICKS = 5
export const PATH_WANDER_DISTANCE = 100
export const ARRIVAL_DISTANCE = 5

/** PointFrameMove: vector of length `speed` toward target, never overshooting. */
export function frameMove(from: Vec, to: Vec, speed: number): Vec {
  const dx = to.x - from.x, dy = to.y - from.y
  const d = Math.hypot(dx, dy)
  if (d === 0) return { x: 0, y: 0 }
  const k = Math.min(1, speed / d)
  return { x: dx * k, y: dy * k }
}
export function arrived(from: Vec, to: Vec): boolean {
  return (to.x - from.x) ** 2 + (to.y - from.y) ** 2 <= ARRIVAL_DISTANCE ** 2
}
export interface PathState { pathMode: 'beeline' | 'scenic'; waypoint: Vec | null; pathStall: number }
/**
 * One tick of findPathToLoc + modMoveToLoc.update. Returns the velocity to set and the new path state.
 * `movedLastTick` is whether the previous tick's actual displacement was non-zero (a blocked move stalls).
 */
export function pathStep(p: PathState, pos: Vec, goal: Vec, walkSpeed: number, movedLastTick: boolean, rng: Rng):
  { vel: Vec; path: PathState; rng: Rng } {
  let path = { ...p, pathStall: movedLastTick ? 0 : p.pathStall + 1 }
  if (path.pathMode === 'beeline' && path.pathStall >= PATH_STALL_TICKS) {
    const [rx, r1] = roughly(rng, PATH_WANDER_DISTANCE); const [ry, r2] = roughly(r1, PATH_WANDER_DISTANCE)
    path = { pathMode: 'scenic', waypoint: { x: pos.x + rx, y: pos.y + ry }, pathStall: 0 }
    rng = r2
  }
  if (path.pathMode === 'scenic') {
    const wp = path.waypoint!
    if (arrived(pos, wp) || path.pathStall >= PATH_STALL_TICKS) path = { pathMode: 'beeline', waypoint: null, pathStall: 0 }
    else return { vel: frameMove(pos, wp, walkSpeed), path, rng }
  }
  return { vel: arrived(pos, goal) ? { x: 0, y: 0 } : frameMove(pos, goal, walkSpeed), path, rng }
}
```
Tests: `frameMove` length equals speed and does not overshoot; five stalled ticks switch to scenic with a waypoint within ±100; reaching the waypoint returns to beeline; a seeded rng gives a repeatable waypoint.

**`mr-ai-cpu.ts`** (port of `objAiCPU.update`, `updateMoveToAttack`, `targetInReach`, `calcIdealAttackLoc`, `objAiAttack.attack/updateAttack`):

```ts
import type { Rect, Vec } from './mr-geometry'
import type { AttackDef } from './mr-actor-data'
export const RETARGET_TICKS = 30
export interface AiView { pos: Vec; facingLeft: boolean; attack: AttackDef; cooldownReady: boolean; mode: string }
export interface TargetView { pos: Vec; rect: Rect /* sprite rect in world px */; alive: boolean }
export function dirXToTarget(me: Vec, target: Vec): 1 | -1 { return target.x < me.x ? -1 : 1 }
export function idealAttackLoc(me: Vec, target: Vec, a: AttackDef): Vec {
  if (a.type !== 'melee') return target
  const d = dirXToTarget(me, target)
  return { x: target.x + a.idealAttackLoc.x * -d, y: target.y + a.idealAttackLoc.y * -1 }
}
export function strikePoint(me: Vec, a: AttackDef, faceDir: 1 | -1): Vec {
  return { x: me.x + a.collisionLoc.x * faceDir, y: me.y + a.collisionLoc.y }
}
const insideRect = (r: Rect, p: Vec) => p.x >= r.left && p.x < r.right && p.y >= r.top && p.y < r.bottom
export function targetInReach(me: AiView, t: TargetView): boolean {
  if (me.attack.type === 'melee') return insideRect(t.rect, strikePoint(me.pos, me.attack, -1)) || insideRect(t.rect, strikePoint(me.pos, me.attack, 1))
  const d2 = (t.pos.x - me.pos.x) ** 2 + (t.pos.y - me.pos.y) ** 2
  return d2 < me.attack.reach ** 2
}
export type AiDecision =
  | { kind: 'retarget' }
  | { kind: 'move'; goal: Vec }
  | { kind: 'stop' }
  | { kind: 'startAttack'; faceLeft: boolean }
  | { kind: 'idle' }
/** One decision per tick for modes findTarget / moveToAttack. */
export function decide(aiMode: string, me: AiView, target: TargetView | null, retargetCounter: number): AiDecision {
  if (aiMode === 'dazed' || aiMode === 'attack') return { kind: 'idle' }
  if (aiMode === 'findTarget' || target === null || !target.alive || retargetCounter >= RETARGET_TICKS) return { kind: 'retarget' }
  if (targetInReach(me, target)) {
    return me.cooldownReady ? { kind: 'startAttack', faceLeft: target.pos.x < me.pos.x } : { kind: 'stop' }
  }
  return { kind: 'move', goal: idealAttackLoc(me.pos, target.pos, me.attack) }
}
```
Tests (representative): melee ideal loc is 15 px on the near side; melee in reach when the strike point is inside the target rect and not when 1 px outside; archer in reach at 99 px and not at 100; `decide` returns retarget every 30 ticks, `stop` when in reach but cooling down, `startAttack` facing the target when ready.

Commit `git commit -m "Port CPU pathfinding and attack-seeking AI"`

---

### Task 8: Attacks, hits, reeling and death

**Files:**
- Create: `src/mr-open/mr-attack.ts` (+test), `src/mr-open/mr-take-hit.ts` (+test)

**`mr-attack.ts`** (port of `modWeaponManager` cooldowns, `modAttack.calcAttackPowerMelee/calcCollisionVectMelee`, `calcAttackHitMelee`, `modifyLocWithEyestrain`, `performRangedAttack` firing vector):

```ts
import type { Rect, Vec } from './mr-geometry'
import type { ActorDef, AttackDef } from './mr-actor-data'
import { roughly, type Rng } from '../sim/rng'
export function cooldownIncrement(def: ActorDef): number {
  const t = def.attack.type
  return t === 'melee' ? def.agility : t === 'ranged' ? def.dexterity : t === 'magic' ? def.mana_regeneration : 1
}
export const tickCooldown = (remaining: number, inc: number) => Math.max(0, remaining - inc)
export const resetCooldown = (a: AttackDef) => a.cooldown
export const cooldownReady = (remaining: number) => remaining <= 0
/** calcAttackPowerMelee * strength: push vector applied to the victim, x mirrored by facing. */
export function meleePush(def: ActorDef, facingLeft: boolean): Vec {
  const p = def.attack.power
  if (typeof p === 'number') throw new Error(`${def.key}: melee power must be a point`)
  return { x: p.x * (facingLeft ? -1 : 1) * def.strength, y: p.y * def.strength }
}
export function meleeHits(attackerPos: Vec, def: ActorDef, facingLeft: boolean, targetRect: Rect): boolean {
  const s = { x: attackerPos.x + def.attack.collisionLoc.x * (facingLeft ? -1 : 1), y: attackerPos.y + def.attack.collisionLoc.y }
  return s.x >= targetRect.left && s.x < targetRect.right && s.y >= targetRect.top && s.y < targetRect.bottom
}
/** modifyLocWithEyestrain: error grows linearly with distance up to `eyestrain` at `reach`. */
export function aimWithEyestrain(from: Vec, target: Vec, def: ActorDef, rng: Rng): [Vec, Rng] {
  const dist = Math.hypot(target.x - from.x, target.y - from.y)
  const e = Math.floor(Math.min(1, dist / def.attack.reach) * def.eyestrain)
  const [ex, r1] = roughly(rng, e); const [ey, r2] = roughly(r1, e)
  return [{ x: target.x + ex, y: target.y + ey }, r2]
}
/** Bullet spawn point and velocity for a ranged attack. */
export function rangedShot(from: Vec, aimAt: Vec, def: ActorDef, facingLeft: boolean): { spawn: Vec; vel: Vec } {
  const a = def.attack
  const spawn = { x: from.x + a.collisionLoc.x * (facingLeft ? -1 : 1), y: from.y + a.collisionLoc.y }
  const dx = aimAt.x - spawn.x, dy = aimAt.y - spawn.y
  if (a.firingType === 'fullstrength') {
    const d = Math.hypot(dx, dy) || 1
    return { spawn, vel: { x: (dx / d) * def.strength, y: (dy / d) * def.strength } }
  }
  return { spawn, vel: { x: dx / 10, y: dy / 10 } }
}
/** Bullet impact push: velocity * power (scalar). */
export function bulletPush(vel: Vec, bulletDef: ActorDef): Vec {
  const p = bulletDef.attack.power
  if (typeof p !== 'number') throw new Error(`${bulletDef.key}: bullet power must be a number`)
  return { x: vel.x * p, y: vel.y * p }
}
```
Tests (representative numbers from §4): warrior sword push facing right is (2.8, 0) and facing left (-2.8, 0); bow cooldown 200 with dexterity 10 is ready after 20 ticks; eyestrain at point blank is 0 and at reach stays within ±eyestrain; fullstrength shot has length 8; a bullet with velocity (8,0) pushes (4,0).

**`mr-take-hit.ts`** (port of `objGameObject.takeHit`, `modEnergy.takeHit/loseEnergy/recoverEnergy`, `modReel`, `modStretchDeath`/`objCPUCharacter` death steps):

```ts
import type { Vec } from './mr-geometry'
import type { ActorDef } from './mr-actor-data'
export const STALL_SPEED = 0.2
export const REEL_STALL_TICKS = 10
export interface HitResult { push: Vec; damage: number }
/** Inertia-scaled push and Manhattan damage (objGameObject.takeHit + modEnergy.takeHit). */
export function resolveHit(victim: ActorDef, push: Vec, attackerMultiplier: number): HitResult {
  const k = (100 - victim.inertia) / 100
  const p = { x: push.x * k, y: push.y * k }
  return { push: p, damage: (Math.abs(p.x) + Math.abs(p.y)) * attackerMultiplier }
}
/** Stall counter update (objMoveXY.stallUpdate): counts ticks with |vx|+|vy| <= 0.2. */
export function stallStep(stall: number, moveVect: Vec): number {
  return Math.abs(moveVect.x) + Math.abs(moveVect.y) <= STALL_SPEED ? stall + 1 : 0
}
export const reelFinished = (stall: number) => stall >= REEL_STALL_TICKS
/** modEnergy.recoverEnergy: +1 every energyRecoverDelay ticks while alive and below max. */
export function regenStep(energy: number, max: number, counter: number, delay: number): [number, number] {
  if (energy <= 0 || energy >= max) return [energy, 0]
  return counter + 1 >= delay ? [Math.min(max, energy + 1), 0] : [energy, counter + 1]
}
```
Tests: warrior hit by push (2.8,0) with multiplier 2 gives push (1.96,0) and damage 3.92; player (inertia 0) hit by (4,0) with multiplier 3 takes 12; stall counter reaches 10 after ten slow ticks and resets on movement; regen adds 1 every 300 ticks.

Commit `git commit -m "Port attack resolution, hit scaling, reeling and regeneration"`

---

### Task 9: Bullets and spells

**Files:**
- Create: `src/mr-open/mr-bullet.ts` (+test), `src/mr-open/mr-spell.ts` (+test)

**`mr-bullet.ts`** (§4 arrow flight, §8 CollisionCheck):
```ts
import type { Rect, Vec } from './mr-geometry'
export const BULLET_STALL_SPEED = 2
/** Bullet vs its target: target reg point inside the bullet rect grown by the target rect (CollisionCheck). */
export function bulletHits(bulletRect: Rect, targetPos: Vec, targetCr: Rect): boolean {
  const grown = { left: bulletRect.left + targetCr.left, top: bulletRect.top + targetCr.top, right: bulletRect.right + targetCr.right, bottom: bulletRect.bottom + targetCr.bottom }
  return targetPos.x >= grown.left && targetPos.x < grown.right && targetPos.y >= grown.top && targetPos.y < grown.bottom
}
/** checkStalled: both axes below 2 px/tick -> landed. */
export const bulletStalled = (vel: Vec) => Math.abs(vel.x) < BULLET_STALL_SPEED && Math.abs(vel.y) < BULLET_STALL_SPEED
export const LANDED_TICKS = 30   // how long a landed arrow stays before removal (not in the export; keep short)
```
Bullets use the normal friction path with `friction (5,5)` percent and full tile collision (a wall stops them; use the existing `resolveTileCollision` and zero the velocity on any push).

**`mr-spell.ts`** (§5):
```ts
import type { Vec } from './mr-geometry'
import type { ActorDef } from './mr-actor-data'
export function chargeLimits(caster: ActorDef, magicLimitPercent = 100) {
  const a = caster.attack
  let max = Math.min(a.chargeMax, caster.mana_capacity * a.chargeMaxModifier + a.chargeMaxBasic)
  if (a.limitMagic) max = (max * magicLimitPercent) / 100
  return { start: Math.min(a.chargeStart + caster.mana_burst, max), max, speed: a.chargeSpeed * caster.mana_flow }
}
export const chargeStep = (charge: number, speed: number, max: number) => Math.min(max, charge + speed)
/** Charge sprite sits at chargeLoc = collisionLoc mirrored by facing (objCharacter.calcChargeLoc). */
export function chargeLoc(caster: Vec, casterDef: ActorDef, facingLeft: boolean): Vec {
  return { x: caster.x + casterDef.attack.collisionLoc.x * (facingLeft ? -1 : 1), y: caster.y + casterDef.attack.collisionLoc.y }
}
/** GeomMoveVector: length `speed` toward the target. */
export function releaseVelocity(from: Vec, to: Vec, speed: number): Vec {
  const dx = to.x - from.x, dy = to.y - from.y, d = Math.hypot(dx, dy) || 1
  return { x: (dx / d) * speed, y: (dy / d) * speed }
}
/** PointArrivedAtTarget: passed the target on every axis of travel. */
export function arrivedAtTarget(pos: Vec, target: Vec, vel: Vec): boolean {
  const px = vel.x === 0 || Math.sign(target.x - pos.x) !== Math.sign(vel.x)
  const py = vel.y === 0 || Math.sign(target.y - pos.y) !== Math.sign(vel.y)
  return px && py
}
export interface SplashVictim { id: number; pos: Vec; radius: number }
/** Explosion: charge *= factor; radius = charge/2; push (radius + r - dist) * power toward each victim in range. */
export function explode(center: Vec, chargeAtRelease: number, a: ActorDef['attack'], victims: SplashVictim[]): { radius: number; pushes: { id: number; push: Vec }[] } {
  const charge = chargeAtRelease * a.chargeExplodeFactor
  const radius = charge / 2
  const power = typeof a.power === 'number' ? a.power : 1
  const pushes: { id: number; push: Vec }[] = []
  for (const v of victims) {
    const dx = v.pos.x - center.x, dy = v.pos.y - center.y, dist = Math.hypot(dx, dy)
    if (dist * dist >= (radius + v.radius) ** 2) continue
    const speed = (radius + v.radius - dist) * power
    if (speed <= 0) continue
    const d = dist || 1
    pushes.push({ id: v.id, push: { x: (dx / d) * speed, y: (dy / d) * speed } })
  }
  return { radius, pushes }
}
```
Tests: player limits are start 1, max 12.5, speed 1; full charge 12.5 explodes to radius 25 and a victim of radius 8 at distance 10 gets a push of length (25+8-10)*0.75 = 17.25; a victim at distance 40 is untouched; `arrivedAtTarget` true once past on both axes; a bullet rect overlapping the target counts as a hit and one 1 px away does not.

Commit `git commit -m "Port bullet impact and energy blast charge, flight and explosion"`

---

### Task 10: Wire the combat tick

Bring Tasks 6-9 together in `src/sim/tick.ts` (or split into `src/sim/tick-ai.ts`, `tick-combat.ts` imported by `tick.ts` if the file exceeds ~300 lines). Order per tick, after the player's own input step:

1. **Player attacks.** From the input snapshot: `chargeHeld` (Space/left button) or `shootNearest` (E) or `shootShort` (F) held and cooldown ready and mode not `die` -> if no spell owned, create a `spell` actor (mode `charge`, `charge = start`) and set the player to mode `charge`; each held tick `charge = chargeStep`. On release: target point = mouse world for Space/click, nearest hostile pos for E, or for F the point on the line from the player to the nearest hostile 16 px short of it (if no hostile: fire at the mouse, or straight ahead 100 px if no mouse); spell mode `fly`, `vel = releaseVelocity(pos, target, spellSpeed)`, `targetPoint`; player mode `release` for the strip length then `walk`; cooldown reset. Player animation: `charge`/`chargewalk` and `release`/`releasewalk` per moving flag.
2. **CPU AI** for each actor with `aiType === 'objAiCPU'` and mode in `walk`/`stand`: build the `AiView`/`TargetView` (target sprite rect from atlas frame size around its pos), call `decide`; `retarget` -> `findTarget` over living actors with hostile teams, set `ai.mode = moveToAttack` (or stay `findTarget`); `move` -> `pathStep` with `movedLastTick = (pos != prevPos)` and set `vel` directly (walk overwrites velocity); `stop` -> vel 0; `startAttack` -> face, mode `weaponMelee`/`weaponRanged`, `ai.mode = attack`, reset anim; `idle` -> nothing. `ai.retargetCounter++` each tick.
3. **Movement** for every non-player actor: characters walking use the AI-set velocity as-is; reeling/landing/bullets use `stepVelocity(vel, {0,0}, 0, frictionPercent)`; spells keep velocity. Then `resolveTileCollision` for everything but spells (bullets: any push zeroes velocity), then `pos`/`prevPos`.
4. **Animation advance** for all actors (shared helper from Task 5); mode -> strip mapping per `modAnimSet.getAnimSym`: `walk` when moving else `stand`; `reel`, `weaponMelee`, `weaponRanged`, `charge`/`chargewalk`, `release`/`releasewalk`, `dead`/`finish` -> `grave`, `fly`, `land`, `explode` -> `charge` (spell). Missing strip -> `stand` (then first `walk` frame at render).
5. **Attack frames.** For actors in `ai.mode === 'attack'`: on the tick the strip is on a fresh frame equal to `attack.animFrame` (1-based): melee -> if `meleeHits` against the target's sprite rect: apply hit (below) with `meleePush`; ranged -> `aimWithEyestrain` then `rangedShot`, create the bullet actor (`def = attack.bullet`, `ownerId`, `targetId`, mode `fly`, friction from its def). Reset the cooldown on either. When `animLooped`: mode `walk`, `ai.mode = findTarget`, `targetId = null`.
6. **Bullets** in `fly`: if `bulletStalled` -> mode `land`, `age = 0`; else if target alive and `bulletHits(bulletRect, target.pos, targetCr)` -> apply hit with `bulletPush` once, remove the bullet. `land` -> remove after `LANDED_TICKS`.
7. **Spells** in `fly`: if `arrivedAtTarget` -> mode `explode`: `explode(...)` over living actors of hostile teams (victim radius = sprite width / 2), apply each push as a hit with the spell's `damageMultiplier`, push a `SimEvent explode`, `age = 0`; `explode` -> remove after 8 ticks (fade in render).
8. **Apply hit** (helper): `resolveHit(victimDef, push, multiplier)`; `vel += push`; if victim is the player: mode stays `walk`; else mode `reel`, `frictionPercent = frictionReel`, `stall = 0`, `ai.mode = dazed`; `energy -= damage`; event `hit`. If `energy <= 0` and mode not already `die`/`dead`/`finish`: mode `die`, event `died`.
9. **Reel/death progression.** `reel`: `stall = stallStep(stall, pos - prevPos)`; if `reelFinished` -> mode `walk`, friction back to def, `ai.mode = findTarget`. `die` -> `dead` next tick (grave strip from frame 0); `dead` -> when `animLooped` -> `finish`: record `{def, pos}` in `rooms[room].graves`, remove the actor. Player `die` -> after 30 ticks set `restartRequested = true`.
10. **Cooldowns and regen** for all characters: `cooldown = tickCooldown(cooldown, cooldownIncrement(def))`; `regenStep`.
11. **Exits**: `exitsOpen = hostile teams (from `hostileTeamsTo`) have no living actor in the room`; when it flips to true push `exitsOpened`. `rooms[room].clear` mirrors it. On room change the new room starts with `exitsOpen` evaluated the same way.
12. Clear `events` at the start of each tick.

**Tests (`src/sim/tick.test.ts`, integration, using the real `public/generated/actors.json` and `teams.json` read from disk in the test, and an `anims` fixture with the real frame sizes 16x16 / 15x20 / 20x16):**
- Scripted fight on a 1x1 open map: warrior at (300,144), player at (100,144). Run 200 ticks with no input: the warrior's x decreases every tick by 4 (beeline at walkSpeed) until it stops 15 px on the near side of the player; then within the next 22 ticks the player's energy drops by 5.6 (sword push 2.8, inertia 0, multiplier 2) and the player's velocity got +2.8 on x in the direction away from the goblin.
- Blast: player charges for 12 ticks (charge reaches 12.5), releases at the warrior's position; the spell reaches it in ceil(dist/20) ticks; the warrior enters `reel`, its energy drops by the computed damage, and roughly 30 ticks later it is back in `walk` with ai `findTarget`.
- Death and exits: set the warrior's energy to 1, blast it; it goes `die` -> `dead` -> removed; `rooms['1,1'].graves` has one entry; `exitsOpen` becomes true and the event fires.
- Archer: at 90 px it does not move and starts `weaponRanged`; on frame 21 a `gobarrow` actor exists with velocity length 8; it hits the stationary player within a few ticks for 12 damage and is removed.
- Restart: player energy 1, warrior strike -> player `die` -> `restartRequested` after 30 ticks.
- Determinism: two sims with the same seed produce identical actor positions after 300 ticks.

Commit `git commit -m "Wire AI, attacks, projectiles, spells, reeling, death and exits into the tick"`

---

### Task 11: Loaders, rendering and HUD

**Files:**
- Modify: `src/data/loaders.ts` (load `actors.json`, `teams.json`, all sprite atlases with frame sizes; validate shapes), `src/render/scene.ts`, `src/main.ts`

**Rendering rules:**
- One PixiJS `Sprite` per living actor, pooled by id; texture = atlas frame for `(sprite name = def.name, anim, animFrame)`; flip by `facingLeft`; anchor centre; position interpolated between `prevPos` and `pos` with the existing alpha.
- Sort order by layer: characters (`gGameObjectLayer`, `gPlayerLayer`) below bullets and spells (`gGameBulletLayer`). Use the `layerZ` string to assign z: `gGameObjectLayer` 0, `gPlayerLayer` 1, `gGameBulletLayer` 2.
- Graves: a container of static sprites rebuilt when the room changes or a grave is added (`rooms[room].graves`), drawn below characters.
- Spell: while `charge`/`fly`, draw the single spell frame scaled so its size equals `charge * chargeSize` px, tinted with `chargeColour`; while `explode`, size = `charge * chargeExplodeFactor` px and alpha falling from 1 to 0 over the 8 ticks (`age`).
- HUD: a `Graphics` bar at the bottom strip (y 288..320): background dark, fill proportional to the player's `energy / def.energy`, 200 px wide at x 32. Debug line moves to the right of it.
- `main.ts`: load actors, teams and every atlas listed in `actors.json` names; `createSim(grid, defs, teams, anims, seed)`; on `restartRequested` rebuild the sim from the start position with a new seed; mouse to world as before.

Verify with `pnpm build`, then `pnpm dev` and `http://localhost:3371/?map=combat_test`: the warrior walks to Merlin and swings; the arrow flies; charging shows a growing orange disc; the explosion knocks goblins back; dead goblins leave graves; exits open when both goblins in a room are dead (walk through the gap to room 2). Record what you saw; the browser checklist is for a human to confirm.

Commit `git commit -m "Render actors, spells, graves and the energy bar"`

---

### Task 12: Notes, readme, tuning example

**Files:**
- Modify: `readme.md` (controls: Space or left click charge and fire at the mouse; E nearest enemy; F short of the nearest enemy; `?map=combat_test`; `assets/tuning.json` explained), `docs/notes/engine-mechanics-combat.md` (append "Port decisions": single takeHit per arrow, no experience, LANDED_TICKS 30, magic limit fixed at 100%, energy blast granted at start, full-scan targeting), `docs/plans/2026-09-26-combat-progress.md` (status table like the first slice's).
- Add one commented example to `assets/tuning.json`? JSON has no comments; instead document the overlay shape in `assets/README.md` with the archer reach example.

Commit `git commit -m "Document combat controls, tuning overlay and port decisions"`

---

## Done criteria

- `pnpm test` and `pnpm build` pass.
- On `combat_test`, a human confirms: goblins approach and attack, arrows fly and hit, the blast charges, flies to the mouse, explodes and knocks goblins back, goblins die into graves, exits open only after both goblins in room 1 are dead, Merlin's bar drops and the map restarts on death.
- `mriv_small` still loads; unsupported object types are skipped with a single console warning each.
- `assets/tuning.json` overrides a value end to end (try `goblinArcher.attack.reach`).
