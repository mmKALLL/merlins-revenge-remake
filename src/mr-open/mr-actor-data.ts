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
  'mana_regeneration', 'weapon', 'experienceImWorth', 'character', 'weight', 'minimapStatus', 'miniMapStatus',
  'teamName', 'category', 'hates', 'friends']) {
  CANONICAL.set(k.toLowerCase(), k)
}
export function canonicalKey(k: string): string { return CANONICAL.get(k.toLowerCase()) ?? k }

export type Plain = Record<string, unknown>

/** Lingo value -> plain data: symbols and identifiers become strings, calls (random(), member()) become null. */
export function toPlain(v: LingoValue): unknown {
  if (Array.isArray(v)) return v.map(toPlain)
  if (isSymbol(v)) return v.sym
  if (typeof v === 'object' && v !== null && 'ident' in v) return v.ident
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
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error('data field is not a property list')
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

function isPlain(v: unknown): v is Plain {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function deepMerge(a: Plain, b: Plain): Plain {
  const out: Plain = { ...a }
  for (const [k, v] of Object.entries(b)) {
    const cur = out[k]
    out[k] = isPlain(v) && isPlain(cur) ? deepMerge(cur, v) : v
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
    bullet: strOrNull(a['bullet']),
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
  for (const [k, text] of Object.entries(files)) parsed[k] = parseDataField(text)
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
    const overlay = tuning[key]
    if (overlay) {
      r = deepMerge(r, overlay)
      if (isPlain(overlay['attack'])) rawAttack = deepMerge(rawAttack ?? {}, overlay['attack'])
    }
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
