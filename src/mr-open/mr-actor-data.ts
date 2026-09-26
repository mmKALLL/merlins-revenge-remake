// Port of actorMaster.retrieveActorData (inheritance), structMaster.structAttack (attack defaults),
// AttackSetTypeFromAnimType, and the object/module defaults from objGameObject, modEnergy,
// objMoveXY, modPathFinding, modMoveToLoc that the data files rely on.
import { isIdent, isSymbol, parseLingo, type LingoValue } from './mr-lingo-plist'
import type { Vec } from './mr-geometry'

export type AttackType = 'melee' | 'ranged' | 'magic' | 'bullet' | 'none'

export interface AttackDef {
  name: string // weapon or spell name, e.g. goblinSword, energyBlast
  type: AttackType // melee, ranged, magic or bullet; derived from animType when the data says #auto
  animType: string // character strip played while attacking (weaponMelee, weaponRanged, magic, naturalMelee)
  animFrame: number | null // 1-based strip frame on which the hit lands or the bullet is spawned
  collisionLoc: Vec // offset from the reg point (x mirrored by facing): melee strike point or bullet spawn point
  idealAttackLoc: Vec // where an AI wants to stand relative to its target (melee: beside it)
  /** a point for the player's natural punch (act_player); a number everywhere else */
  reach: number | Vec // AI trigger distance for ranged/magic attacks in px; unused for melee
  cooldown: number // counter length between attacks; advanced per tick by agility/dexterity/mana_regeneration
  power: number | Vec // melee: push vector applied to the victim (x mirrored); bullet/spell: scalar push factor
  damageMultiplier: number // damage = (|push.x| + |push.y|) * damageMultiplier after the victim's inertia scaling
  bullet: string | null // actor key spawned by a ranged attack (goblinArrow)
  firingType: 'proportional' | 'fullstrength' // bullet velocity: distance/10, or a vector of length strength
  hits: string[] // team roles that can be hit (teamMembers, teamBuildings)
  chargeStart: number // spell charge at the first tick (plus the caster's mana_burst)
  chargeMax: number // hard cap on charge; the effective max is mana_capacity * chargeMaxModifier + chargeMaxBasic
  chargeMaxBasic: number // flat part of the effective charge max
  chargeMaxModifier: number // multiplier on mana_capacity for the effective charge max
  chargeSpeed: number // charge gained per tick (times the caster's mana_flow)
  chargeSize: number // sprite pixels per unit of charge while charging
  chargeExplodeFactor: number // charge is multiplied by this on impact; explosion radius = charge / 2 afterwards
  chargeColour: { r: number; g: number; b: number } // tint of the charging/flying spell sprite
  spellSpeed: number // spell flight speed in px per tick
  limitMagic: boolean // whether the magic limiter percentage scales the charge max
  sound: string | null // sound played on attack
  releaseSound: string | null // sound on spell release
  explodeSound: string | null // sound on spell impact
}

export interface ActorDef {
  key: string // actor file key, e.g. goblinWarrior (act_goblinWarrior.txt)
  name: string // sprite/character name used for animation strips (anm_<name>_*), e.g. gar
  objType: string // Lingo object class: objCPUCharacter, objPlayerMerlinCharacter, objBullet, objSpell, ...
  aiType: string | null // Lingo AI class (objAiCPU for enemies, objAiPlayer for Merlin)
  team: string // team name used for allegiance and targeting (goblins, aldevar)
  layerZ: string // engine draw-layer global name; bullets and spells draw above characters
  startOffset: Vec // offset from the spawn tile's bottom-right corner to the reg point; (-16,-16) = tile centre
  energy: number // starting and maximum health
  energyRecoverDelay: number // ticks between +1 passive health regeneration
  friction: Vec // percent of speed lost per tick per axis while walking
  frictionReel: Vec // percent of speed lost per tick while reeling from a hit
  inertia: number // percent of an incoming push that is absorbed; 0 = pushed with full force
  damageSpeed: number // wall-impact speed threshold while reeling before extra damage applies
  walkSpeed: number // AI walking speed in px per tick (velocity is overwritten each tick)
  walkAcceleration: number // player acceleration per tick per axis while a key is held
  strength: number // scales melee push and fullstrength bullet speed
  agility: number // cooldown progress per tick for melee attacks
  dexterity: number // cooldown progress per tick for ranged attacks
  eyestrain: number // max aiming error in px at full reach for ranged attacks
  mana_burst: number // added to the spell's starting charge
  mana_capacity: number // scales the spell's maximum charge
  mana_flow: number // multiplies the spell's charge speed
  mana_regeneration: number // cooldown progress per tick for magic attacks
  weapon: string | null // starting weapon actor key whose attack is installed (goblinSword, goblinBow)
  experienceImWorth: number // experience awarded on death (never granted in this engine build)
  attack: AttackDef // the installed current attack (from weapon, or the natural attack)
  /**
   * Every resolved raw property for later slices, tuning overlay included. Keys in the canonical
   * list keep their camelCase spelling; every other key is lowercased (Lingo symbols are
   * case-insensitive). `raw.attack` is the actor's own natural attack (e.g. the player's punch),
   * while `attack` is the installed weapon's.
   */
  raw: Record<string, unknown>
}

/** Object types drawn with an animation atlas. */
const SPRITE_OBJ_TYPES = new Set(['objCPUCharacter', 'objPlayerMerlinCharacter', 'objBullet', 'objSpell'])

/**
 * Whether an actor is drawn with its own atlas (`anm_<name>_*`). Abstract bases such as `bullet`
 * have a drawable objType but never set `#name`; only concrete actors that name themselves have art.
 */
export function needsSprite(def: ActorDef): boolean {
  return SPRITE_OBJ_TYPES.has(def.objType) && typeof def.raw['name'] === 'string'
}

// structMaster.structAttack (only the fields this port reads; others stay in raw)
const ATTACK_DEFAULTS = {
  animFrame: 2, animType: 'none', bullet: null, chargeColour: { r: 255, g: 255, b: 255 }, chargeExplodeFactor: 4,
  chargeMax: 5, chargeMaxBasic: 0, chargeMaxModifier: 1, chargeSize: 1, chargeSpeed: 1, chargeStart: 1,
  collisionLoc: { x: 25, y: 0 }, idealAttackLoc: 'collisionLoc', cooldown: 0, damageMultiplier: 1,
  explodeSound: null, firingType: 'proportional', hits: ['teamMembers'], limitMagic: false, name: 'none',
  power: { x: 5, y: -1 }, reach: 25, releaseSound: null, sound: null, spellSpeed: 2, type: 'auto',
} as const

// Object-level defaults by objType. '*' applies to everything; entries marked "act_actor" /
// "act_character" mirror what those data files set (a fallback in case a file skips the chain),
// the rest are engine object defaults (objGameObject / modEnergy / objMoveXY / modMoveToLoc).
const OBJECT_DEFAULTS: Record<string, Plain> = {
  '*': {
    energy: 100, energyRecoverDelay: 1000, // modEnergy
    friction: { x: 50, y: 50 }, frictionReel: { x: 10, y: 10 }, inertia: 0, damageSpeed: 5, // objMoveXY
    walkSpeed: 0, walkAcceleration: 0.5, // modMoveToLoc
    strength: 1, agility: 1, dexterity: 1, eyestrain: 0, // act_character fallbacks
    mana_burst: 1, mana_capacity: 10, mana_flow: 1, mana_regeneration: 1, // act_character fallbacks
    experienceImWorth: 0, // objGameObject
    startOffset: { x: -16, y: -16 }, team: 'chatters', layerZ: 'gGameObjectLayer', // act_actor fallbacks
  },
  objCharacter: { energyRecoverDelay: 30 },
  objCPUCharacter: { energyRecoverDelay: 300 },
  objPlayerMerlinCharacter: { energyRecoverDelay: 30 },
}

/** Canonical camelCase spellings; Lingo symbols are case-insensitive. Keys not listed here are lowercased. */
const CANONICAL = new Map<string, string>()
for (const k of [...Object.keys(ATTACK_DEFAULTS), 'objType', 'AiType', 'inherit', 'attack', 'team', 'name', 'layerZ',
  'startOffset', 'energy', 'energyRecoverDelay', 'friction', 'frictionReel', 'inertia', 'damageSpeed', 'walkSpeed',
  'walkAcceleration', 'strength', 'agility', 'dexterity', 'eyestrain', 'mana_burst', 'mana_capacity', 'mana_flow',
  'mana_regeneration', 'weapon', 'experienceImWorth', 'character', 'weight', 'miniMapStatus',
  'teamName', 'category', 'hates', 'friends']) {
  CANONICAL.set(k.toLowerCase(), k)
}
export function canonicalKey(k: string): string {
  const lower = k.toLowerCase()
  return CANONICAL.get(lower) ?? lower
}

export type Plain = Record<string, unknown>

function isPlain(v: unknown): v is Plain {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Lingo value -> plain data: symbols and identifiers become strings (TRUE/FALSE become booleans), calls (random(), member()) become null. */
export function toPlain(v: LingoValue): unknown {
  if (Array.isArray(v)) return v.map(toPlain)
  if (isSymbol(v)) return v.sym
  if (isIdent(v)) {
    const lower = v.ident.toLowerCase()
    return lower === 'true' ? true : lower === 'false' ? false : v.ident
  }
  if (typeof v === 'object' && v !== null && 'call' in v) return null // random(), member(): not data we use
  if (typeof v === 'object' && v !== null && !('x' in v) && !('r' in v)) {
    const out: Plain = {}
    for (const [k, val] of Object.entries(v)) out[canonicalKey(k)] = toPlain(val)
    return out
  }
  return v
}

/** The data field's second Lingo list (the first line is the cast member header). Accepts LF or CRLF. */
export function parseDataField(text: string): Plain {
  const body = text.slice(text.indexOf('\n') + 1)
  const v = toPlain(parseLingo(body))
  if (!isPlain(v)) throw new Error('data field is not a property list')
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
    out[k] = isPlain(v) && isPlain(cur) ? deepMerge(cur, v) : v
  }
  return out
}

const ATTACK_TYPES: ReadonlySet<string> = new Set<AttackType | 'auto'>(['melee', 'ranged', 'magic', 'bullet', 'none', 'auto'])

function attackTypeFromAnim(animType: string, explicit: unknown, ctx: string): AttackType {
  if (typeof explicit !== 'string' || !ATTACK_TYPES.has(explicit)) {
    throw new Error(`${ctx}: attack.type must be one of ${[...ATTACK_TYPES].join('|')}, got ${JSON.stringify(explicit)}`)
  }
  if (explicit !== 'auto') return explicit as AttackType
  if (animType === 'magic') return 'magic'
  if (['naturalMelee', 'weaponMelee', 'magicMelee'].includes(animType)) return 'melee'
  if (['naturalRanged', 'weaponRanged'].includes(animType)) return 'ranged'
  return 'none'
}

// Field guards: every read of a typed field goes through one of these, so a mistyped data file or
// tuning overlay fails with `actor <key>: <field> must be <type>, got <json>` instead of NaN/undefined.
function bad(ctx: string, field: string, type: string, v: unknown): never {
  throw new Error(`${ctx}: ${field} must be ${type}, got ${JSON.stringify(v)}`)
}
function isVec(v: unknown): v is Vec {
  return isPlain(v) && typeof v['x'] === 'number' && typeof v['y'] === 'number'
}
function num(obj: Plain, field: string, ctx: string): number {
  const v = obj[field]
  return typeof v === 'number' ? v : bad(ctx, field, 'a number', v)
}
function vec(obj: Plain, field: string, ctx: string): Vec {
  const v = obj[field]
  return isVec(v) ? { x: v.x, y: v.y } : bad(ctx, field, 'a point', v)
}
function numOrVec(obj: Plain, field: string, ctx: string): number | Vec {
  const v = obj[field]
  return typeof v === 'number' ? v : isVec(v) ? { x: v.x, y: v.y } : bad(ctx, field, 'a number or point', v)
}
function str(obj: Plain, field: string, ctx: string): string {
  const v = obj[field]
  return typeof v === 'string' ? v : bad(ctx, field, 'a string', v)
}
function strList(obj: Plain, field: string, ctx: string): string[] {
  const v = obj[field]
  return Array.isArray(v) && v.every((s): s is string => typeof s === 'string') ? [...v] : bad(ctx, field, 'a list of symbols', v)
}
function rgb(obj: Plain, field: string, ctx: string): { r: number; g: number; b: number } {
  const v = obj[field]
  if (isPlain(v) && typeof v['r'] === 'number' && typeof v['g'] === 'number' && typeof v['b'] === 'number') {
    return { r: v['r'], g: v['g'], b: v['b'] }
  }
  return bad(ctx, field, 'an rgb colour', v)
}
function strOrNull(v: unknown): string | null { return typeof v === 'string' && v !== 'none' ? v : null }

function buildAttack(rawAttack: Plain | undefined, ctx: string): AttackDef {
  const a: Plain = { ...ATTACK_DEFAULTS, ...(rawAttack ?? {}) }
  if (a['idealAttackLoc'] === 'collisionLoc') a['idealAttackLoc'] = a['collisionLoc']
  const f = (field: string): string => `attack.${field}`
  const animType = str(a, 'animType', ctx)
  return {
    name: str(a, 'name', ctx), animType,
    type: attackTypeFromAnim(animType, a['type'], ctx),
    animFrame: typeof a['animFrame'] === 'number' ? a['animFrame'] : null, // #none for spells
    collisionLoc: vec(a, 'collisionLoc', ctx), idealAttackLoc: vec(a, 'idealAttackLoc', ctx),
    reach: numOrVec(a, 'reach', ctx),
    cooldown: num(a, 'cooldown', ctx), power: numOrVec(a, 'power', ctx),
    damageMultiplier: num(a, 'damageMultiplier', ctx),
    bullet: strOrNull(a['bullet']),
    firingType: a['firingType'] === 'fullstrength' ? 'fullstrength' : 'proportional',
    hits: strList(a, 'hits', ctx),
    chargeStart: num(a, 'chargeStart', ctx), chargeMax: num(a, 'chargeMax', ctx), chargeMaxBasic: num(a, 'chargeMaxBasic', ctx),
    chargeMaxModifier: num(a, 'chargeMaxModifier', ctx), chargeSpeed: num(a, 'chargeSpeed', ctx), chargeSize: num(a, 'chargeSize', ctx),
    chargeExplodeFactor: num(a, 'chargeExplodeFactor', ctx), chargeColour: rgb(a, 'chargeColour', ctx),
    spellSpeed: num(a, 'spellSpeed', ctx), limitMagic: a['limitMagic'] === true,
    sound: strOrNull(a['sound']), releaseSound: strOrNull(a['releaseSound']), explodeSound: strOrNull(a['explodeSound']),
  }
}

/** Runs `fn`, rethrowing any error with `<ctx>: ` prefixed so data errors name the file they came from. */
export function withContext<T>(ctx: string, fn: () => T): T {
  try {
    return fn()
  } catch (err) {
    throw new Error(`${ctx}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/**
 * files: actor key (e.g. "goblinWarrior") -> raw text of act_<key>.txt.
 * tuning: optional deep overlay per actor key. Everything but `attack` is merged into the resolved
 * properties before the weapon is derived (so an overlay can swap `weapon`); `attack` is then merged
 * on top of the installed attack.
 * A character's starting weapon (`#weapon`) supplies its attack (modWeaponManager.initStartingWeapon);
 * any actor file with an `#attack` list qualifies (the player's energyBlast is an objScroll).
 */
export function resolveActors(files: Record<string, string>, tuning: Record<string, Plain> = {}): Record<string, ActorDef> {
  const parsed: Record<string, Plain> = {}
  for (const [k, text] of Object.entries(files)) parsed[k] = withContext(`actor ${k}`, () => parseDataField(text))
  const out: Record<string, ActorDef> = {}
  for (const key of Object.keys(parsed)) {
    const ctx = `actor ${key}`
    let r = resolveChain(key, parsed)
    const objType = String(r['objType'] ?? 'objGameObject')
    r = { ...OBJECT_DEFAULTS['*'], ...(OBJECT_DEFAULTS[objType] ?? {}), ...r }
    const { attack: attackOverlay, ...overlay } = tuning[key] ?? {}
    r = deepMerge(r, overlay)
    // starting weapon installs its attack (modWeaponManager.start)
    const weapon = typeof r['weapon'] === 'string' ? r['weapon'] : null
    let rawAttack = isPlain(r['attack']) ? r['attack'] : undefined
    if (weapon) {
      if (!parsed[weapon]) throw new Error(`${ctx}: unknown weapon ${weapon}`)
      const weaponAttack = resolveChain(weapon, parsed)['attack']
      if (!isPlain(weaponAttack)) throw new Error(`${ctx}: weapon ${weapon} has no attack list`)
      rawAttack = weaponAttack
    }
    if (attackOverlay !== undefined) {
      if (!isPlain(attackOverlay)) bad(ctx, 'tuning attack', 'a property list', attackOverlay)
      rawAttack = deepMerge(rawAttack ?? {}, attackOverlay)
    }
    out[key] = {
      key, name: String(r['name'] ?? key), objType, aiType: strOrNull(r['AiType']), team: str(r, 'team', ctx),
      layerZ: str(r, 'layerZ', ctx), startOffset: vec(r, 'startOffset', ctx), energy: num(r, 'energy', ctx),
      energyRecoverDelay: num(r, 'energyRecoverDelay', ctx), friction: vec(r, 'friction', ctx), frictionReel: vec(r, 'frictionReel', ctx),
      inertia: num(r, 'inertia', ctx), damageSpeed: num(r, 'damageSpeed', ctx), walkSpeed: num(r, 'walkSpeed', ctx),
      walkAcceleration: num(r, 'walkAcceleration', ctx), strength: num(r, 'strength', ctx), agility: num(r, 'agility', ctx),
      dexterity: num(r, 'dexterity', ctx), eyestrain: num(r, 'eyestrain', ctx), mana_burst: num(r, 'mana_burst', ctx),
      mana_capacity: num(r, 'mana_capacity', ctx), mana_flow: num(r, 'mana_flow', ctx), mana_regeneration: num(r, 'mana_regeneration', ctx),
      weapon, experienceImWorth: num(r, 'experienceImWorth', ctx), attack: buildAttack(rawAttack, ctx), raw: r,
    }
  }
  return out
}
