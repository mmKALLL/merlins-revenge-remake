// Port of actorMaster.retrieveActorData (inheritance), structMaster.structAttack (attack defaults),
// AttackSetTypeFromAnimType, and the object/module defaults from objGameObject, modEnergy,
// objMoveXY, modPathFinding, modMoveToLoc that the data files rely on.
import { isIdent, isSymbol, parseLingo, type LingoValue } from './mr-lingo-plist'
import type { Vec } from './mr-geometry'
import { DEFAULT_CHARGE_VOLUME_MAP, DEFAULT_VOLUME, musicTrackFromName, type ChargeVolumeMap } from './mr-sound'

export type AttackType = 'melee' | 'ranged' | 'magic' | 'bullet' | 'explode' | 'none'

export interface AttackDef {
  name: string // weapon or spell name, e.g. goblinSword, energyBlast
  type: AttackType // melee, ranged, magic or bullet; derived from animType when the data says #auto
  animType: string // character strip played while attacking (weaponMelee, weaponRanged, magic, naturalMelee)
  /** 1-based strip frames on which the hit lands or the bullet is spawned (a list strikes on each: orcSword [6,10,12]); null for spells (#none) */
  animFrame: number[] | null
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
  chargeSpeedMax: number | null // cap on that product; null = #unlimited
  chargeSize: number // sprite pixels per unit of charge while charging
  chargeExplodeFactor: number // charge is multiplied by this on impact; explosion radius = charge / 2 afterwards
  explodeCharge: number // an #explode bullet's charge when it goes off (radius explodeCharge / 2)
  chargeColour: { r: number; g: number; b: number } // tint of the charging/flying spell sprite
  spellSpeed: number // spell flight speed in px per tick
  explodeFunction: string | null // what the spell does on exploding besides the blast: summonUnit (depositMines not ported)
  multistage: { payload: string; chargeRequired: number }[] // summon stages in order: the unit a charge of at least chargeRequired summons
  randomSummon: boolean // an AI caster's charge max is randomised per cast (calcAttackChargeMax), so it summons a random stage
  targetTileWhenNotBlank: boolean // a spell carrying a payload is aimed at the centre of the target's tile
  targetAllegiance: 'enemy' | 'friendly' // teamMaster.calcTargetTeamsByAllegiance: hated teams, or friends plus the own team
  targetCriteria: 'closestDistance' | 'lowestHealth' // findTargetInTeam: nearest, or lowest energy percentage (healers)
  payloadFunction: string[] // what an impact calls on each unit hit: takeHit (push and damage), takeHeal, takeFreeze
  limitMagic: boolean // whether the magic limiter percentage scales the charge max
  sound: string | null // sound played on attack
  releaseSound: string | null // sound on spell release
  explodeSound: string | null // sound on spell impact
  volume: number // 0-255 volume of `sound` for melee and ranged attacks (structAttack #volume, default 150)
  chargeVolumeMap: ChargeVolumeMap // spell release/explode volume from charge (VarMapRange charge -> vol)
}

/** modResidents #residentGroups entry: what a dwelling produces, with [min, max] ranges rolled per group. */
export interface ResidentGroup {
  typ: string // actor key of the resident
  buildTime: [number, number] // ticks to build one resident
  groupSize: [number, number] // residents per group
  releaseInterval: [number, number] // ticks between releases of a finished group
}

export interface ActorDef {
  // --- engine: identity, allegiance and drawing (actorMaster, objGameObject)
  key: string // actor file key, e.g. goblinWarrior (act_goblinWarrior.txt)
  name: string // sprite/character name used for animation strips (anm_<name>_*), e.g. gar
  objType: string // Lingo object class: objCPUCharacter, objPlayerMerlinCharacter, objBullet, objSpell, ...
  aiType: string | null // Lingo AI class (objAiCPU for enemies, objAiPlayer for Merlin)
  team: string // team name used for allegiance and targeting (goblins, aldevar)
  layerZ: string // engine draw-layer global name; bullets and spells draw above characters
  startOffset: Vec // offset from the spawn tile's bottom-right corner to the reg point; (-16,-16) = tile centre
  experienceImWorth: number // experience awarded on death (never granted in this engine build)
  // --- engine: energy and physics (modEnergy, objMoveXY)
  energy: number // starting and maximum health
  energyRecoverDelay: number // ticks between +1 passive health regeneration
  friction: Vec // percent of speed lost per tick per axis while walking
  frictionReel: Vec // percent of speed lost per tick while reeling from a hit
  inertia: number // percent of an incoming push that is absorbed; 0 = pushed with full force
  damageSpeed: number // wall-impact speed threshold while reeling before extra damage applies
  stallSpeed: number // objMoveXY: a tick moving |dx| + |dy| <= this counts as stalled (ends a reel after 10)
  reelProof: boolean // modReel: a hit still pushes and damages but never starts a reel
  collisionDetection: boolean // objGameObject: false = ignores tiles (bats, ghosts), still kept in the room
  minEnergy: number // modEnergy: dies at energy <= this (multistage enemies: hydra3 dies at 1000 into a hydra2)
  maxEnergy: number // modEnergy: regeneration cap; #auto = the starting energy
  teamRole: string // teamMembers (characters), teamBuildings (dwellings), teamBullets (bullets, spells)
  // --- engine: movement (modMoveToLoc, modNavMode, modPathFinding)
  walkSpeed: number // AI walk vector length in px per tick, set each tick before friction (50 % friction -> half of it moved)
  walkAcceleration: number // player acceleration per tick per axis while a key is held
  navModeAcceleration: number // player walk acceleration in a cleared room (modNavMode); 0 = no nav mode
  pathFindingStallTime: number // stalled ticks before a #beeline walker takes a #scenic detour (and back); also ends a remake detourMove
  // --- engine: character stats (act_character)
  strength: number // scales melee push and fullstrength bullet speed
  agility: number // cooldown progress per tick for melee attacks
  dexterity: number // cooldown progress per tick for ranged attacks
  eyestrain: number // max aiming error in px at full reach for ranged attacks
  mana_burst: number // added to the spell's starting charge
  mana_capacity: number // scales the spell's maximum charge
  mana_flow: number // multiplies the spell's charge speed
  mana_regeneration: number // cooldown progress per tick for magic attacks
  // --- engine: weapon and attack (modWeaponManager, modWeaponTechnique)
  weapon: string | null // starting weapon actor key whose attack is installed (goblinSword, goblinBow)
  weaponTechnique: number // modWeaponTechnique rating; negative values lengthen attack strips
  attack: AttackDef // the installed current attack (from weapon, or the natural attack)
  naturalAttack: AttackDef // the actor's own #attack (modWeaponManager.initNaturalAttack, weapon 1)
  multiAttack: boolean // objAiCPU: on each retarget pick the natural attack or the weapon by distance
  bufferDist: number // modWeaponManager: beyond this the multiAttack picks the natural (ranged) attack
  // --- engine: sound (modEnergy, objCharacter, objMusic)
  takeHitSound: string | null // modEnergy.loseEnergy plays it on every energy loss (the player's wizard_hit)
  takeHitVolume: number // 0-255; modEnergy #takeHitVolume, #none -> 150 (the player's #takeHitSoundVolume is never read)
  dieSound: string | null // objCharacter.goMode(#die)
  dieVolume: number // 0-255; objCharacter #dieVolume, default 100
  graveOn: boolean // modGrave: false = no grave strip and no grave stamp on death
  reincarnateAs: string[] // modReincarnate: actor keys created on the spot when killed
  runReload: boolean // objCPUCharacter: after an attack, move away from the target until the cooldown is done
  chargeLoc: Vec // objCharacter: where a charging spell sits, from the reg point (x mirrored by facing)
  // --- engine: exploding bullets (modExploder)
  explodeEvents: string[] // bullet events that set it off: bulletCollidedWithTarget, bulletLanded
  exploderSound: string | null // modExploder #explodeSound (the actor's own, not the attack's)
  exploderVolume: number // modExploder #explodeVolume, default 50
  /** objMusic only: the track its room activation plays (#musicName), null for musicOff ("stopMusic"); null on other actors. */
  musicTrack: string | null
  // --- engine: dwellings (modResidents)
  residentGroups: ResidentGroup[] // groups a dwelling picks from at random; empty for everything else
  totalResidents: number // residents a dwelling releases before it destroys itself
  // --- remake additions (not in the engine; the defaults keep engine behaviour where noted)
  collisionRectScale: number // scales the collision rect about the reg point (1 = engine size)
  scenicMaxTicks: number // a #scenic detour also ends (back to #beeline) after this many ticks
  detourChance: number // chance of a spreading detour after a melee attack and every detourMoveTicks of walking; 0 = off
  detourMoveTicks: number // ticks of continuous walking between detour rolls
  detourMoveMaxTicks: number // a detourMove that has not arrived or stalled ends (and retargets) after this many ticks
  detourPauseTicks: number // ticks a detour stands still before walking off
  detourDistance: number // px a detour walks in a random direction before retargeting
  detourMinTargetDistance: number // no walking detour roll while the target is closer than this (px)
  projectileSpreadDeg: number // fired bullets turn by a random angle in [-s, s] degrees (on top of eyestrain); 0 = engine
  knockbackSpreadDeg: number // this caster's spell explosion pushes turn by a random angle in [-k, k] degrees; 0 = engine
  productionTimeScale: number // dwelling group production time = groupSize * buildTime * this (see engine notes enemies-2 §7)
  // idle wander of sleeping CPU characters near the view in the continuous world (engine notes walking-and-rooms)
  idleWanderIntervalTicks: number // roll interval the chance is scaled to: each roll succeeds with chancePerSecond * this / 30
  idleWanderChancePerSecond: number // chance per second of starting a wander when rolled every idleWanderIntervalTicks; 0 = off
  idleWanderRadius: number // px: a wander walks to a random point within this of the unit's home (spawn position)
  // continuous world (?camera=follow; read from the player's definition only; engine notes walking-and-rooms, "Continuous world")
  wakeDistance: number // px, reg point to reg point: a sleeping unit closer than this to Merlin wakes
  sleepDistance: number // px: an awake unit this far or farther from Merlin falls asleep (hysteresis above wakeDistance)
  hitWakeTicks: number // a unit hit this far or farther stays awake for at least this many ticks
  navModeClearRadius: number // px: nav mode is on while no awake living hostile unit is within this of Merlin
  activationVerticalScale: number // the four ranges above reach this fraction as far up and down as sideways (ellipses)
  idleWanderMarginTiles: number // sleepers within the follow camera's view grown by this many tiles on each side may idle wander
  idleWanderScanTicks: number // those sleepers are found, and roll for a wander, every this many ticks
  /**
   * Every resolved raw property for later slices, tuning overlay included. Keys in the canonical
   * list keep their camelCase spelling; every other key is lowercased (Lingo symbols are
   * case-insensitive). `raw.attack` is the actor's own natural attack (e.g. the player's punch),
   * while `attack` is the installed weapon's.
   */
  raw: Record<string, unknown>
}

/** Object types drawn with an animation atlas. */
const SPRITE_OBJ_TYPES = new Set(['objCPUCharacter', 'objPlayerMerlinCharacter', 'objBullet', 'objSpell', 'objDwelling'])

/**
 * Whether an actor is drawn with its own atlas (`anm_<name>_*`). Abstract bases such as `bullet`
 * have a drawable objType but never set `#name`; only concrete actors that name themselves have art.
 */
export function needsSprite(def: ActorDef): boolean {
  return SPRITE_OBJ_TYPES.has(def.objType) && typeof def.raw['name'] === 'string'
}

// structMaster.structAttack (only the fields this port reads; others stay in raw)
const ATTACK_DEFAULTS = {
  name: 'none', type: 'auto', animType: 'none', animFrame: 2,
  collisionLoc: { x: 25, y: 0 }, idealAttackLoc: 'collisionLoc', reach: 25, cooldown: 0,
  power: { x: 5, y: -1 }, damageMultiplier: 1, bullet: null, firingType: 'proportional', hits: ['teamMembers'],
  chargeStart: 1, chargeMax: 5, chargeMaxBasic: 0, chargeMaxModifier: 1, chargeSpeed: 1, chargeSpeedMax: 'unlimited', chargeSize: 1,
  chargeExplodeFactor: 4, explodeCharge: 10, chargeColour: { r: 255, g: 255, b: 255 }, spellSpeed: 2, limitMagic: false,
  sound: null, releaseSound: null, explodeSound: null, volume: DEFAULT_VOLUME, chargeVolumeMap: DEFAULT_CHARGE_VOLUME_MAP,
  explodeFunction: 'none', multistage: 'none', randomSummon: false, targetTileWhenNotBlank: false,
  targetAllegiance: 'enemy', targetCriteria: 'closestDistance', payloadFunction: ['takeHit'],
} as const

/** objCharacter #dieVolume default. */
const DEFAULT_DIE_VOLUME = 100

// Object-level defaults by objType, grouped like ActorDef. '*' applies to everything; entries marked
// "act_actor" / "act_character" mirror what those data files set (a fallback in case a file skips
// the chain), the rest are engine object defaults or remake additions.
const OBJECT_DEFAULTS: Record<string, Plain> = {
  '*': {
    // engine: identity, allegiance and drawing
    startOffset: { x: -16, y: -16 }, team: 'chatters', layerZ: 'gGameObjectLayer', // act_actor fallbacks
    experienceImWorth: 0, // objGameObject
    // engine: energy and physics
    energy: 100, energyRecoverDelay: 1000, // modEnergy
    friction: { x: 50, y: 50 }, frictionReel: { x: 10, y: 10 }, inertia: 0, damageSpeed: 5, // objMoveXY
    stallSpeed: 0.2, teamRole: 'teamMembers', collisionDetection: true, // objGameObject
    reelProof: false, // modReel
    minEnergy: 0, maxEnergy: 'auto', // modEnergy
    graveOn: true, // modGrave
    reincarnateAs: [], // modReincarnate ([#none, #none, #none])
    runReload: false, // objCPUCharacter
    chargeLoc: { x: 0, y: -8 }, // objCharacter
    explodeEvents: [], exploderVolume: 50, // modExploder
    // engine: movement
    walkSpeed: 0, walkAcceleration: 0.5, // modMoveToLoc
    navModeAcceleration: 0, // only Merlin installs modNavMode
    pathFindingStallTime: 5, // modPathFinding.addModParams
    // engine: character stats
    strength: 1, agility: 1, dexterity: 1, eyestrain: 0, // act_character fallbacks
    mana_burst: 1, mana_capacity: 10, mana_flow: 1, mana_regeneration: 1, // act_character fallbacks
    // engine: weapon
    weaponTechnique: 0, // modWeaponTechnique.addModParams
    multiAttack: false, bufferDist: 100, // modWeaponManager.addModParams
    // engine: sound
    takeHitSound: 'none', takeHitVolume: 'none', // modEnergy.addModParams
    dieSound: 'none', dieVolume: DEFAULT_DIE_VOLUME, // objCharacter.addModParams (objDwelling reads the same fields)
    // engine: dwellings
    residentGroups: [], totalResidents: 10, // modResidents.addModParams
    // remake additions
    collisionRectScale: 1, // engine-sized rect
    scenicMaxTicks: 60, // cutoff on #scenic detours (none in the engine)
    detourChance: 0.15, detourMoveTicks: 90, detourMoveMaxTicks: 60, detourPauseTicks: 15, detourDistance: 50, detourMinTargetDistance: 50, // spreading detour
    projectileSpreadDeg: 0, knockbackSpreadDeg: 0, // angular spread, off as in the engine
    productionTimeScale: 1, // groupSize * buildTime, the evident intent of modResidents.startProduction
    idleWanderIntervalTicks: 5, idleWanderChancePerSecond: 0.1, idleWanderRadius: 32, // idle wander (none in the engine)
    wakeDistance: 192, sleepDistance: 256, hitWakeTicks: 180, navModeClearRadius: 256, // continuous world: 6 and 8 tiles, 6 s
    activationVerticalScale: 0.75, // continuous world: ranges a quarter shorter vertically
    idleWanderMarginTiles: 8, idleWanderScanTicks: 5, // continuous world: sleepers' idle wander area and scan period
  },
  objCharacter: { energyRecoverDelay: 30 },
  objCPUCharacter: { energyRecoverDelay: 300 },
  objPlayerMerlinCharacter: { energyRecoverDelay: 30, navModeAcceleration: 6 }, // modNavMode.addModParams
}

/** Canonical camelCase spellings; Lingo symbols are case-insensitive. Keys not listed here are lowercased. */
const CANONICAL = new Map<string, string>()
for (const k of [
  ...Object.keys(ATTACK_DEFAULTS),
  // engine properties read by the port
  'objType', 'AiType', 'inherit', 'attack', 'team', 'name', 'layerZ', 'startOffset', 'experienceImWorth',
  'energy', 'energyRecoverDelay', 'friction', 'frictionReel', 'inertia', 'damageSpeed', 'stallSpeed', 'teamRole',
  'reelProof', 'collisionDetection', 'minEnergy', 'maxEnergy', 'graveOn', 'reincarnateAs', 'runReload',
  'explodeEvents', 'exploderVolume', 'explodeVolume', 'chargeLoc',
  'walkSpeed', 'walkAcceleration', 'navModeAcceleration', 'pathFindingStallTime',
  'strength', 'agility', 'dexterity', 'eyestrain', 'mana_burst', 'mana_capacity', 'mana_flow', 'mana_regeneration',
  'weapon', 'weaponTechnique', 'multiAttack', 'bufferDist', 'takeHitSound', 'takeHitVolume', 'dieSound', 'dieVolume', 'musicName',
  'residentGroups', 'totalResidents', 'typ', 'buildTime', 'groupSize', 'releaseInterval',
  // engine properties kept in raw only
  'character', 'weight', 'miniMapStatus', 'teamName', 'category', 'hates', 'friends', 'maxMembers',
  // remake additions
  'collisionRectScale', 'scenicMaxTicks', 'detourChance', 'detourMoveTicks', 'detourMoveMaxTicks', 'detourPauseTicks',
  'detourDistance', 'detourMinTargetDistance', 'projectileSpreadDeg', 'knockbackSpreadDeg', 'productionTimeScale',
  'idleWanderIntervalTicks', 'idleWanderChancePerSecond', 'idleWanderRadius',
  'wakeDistance', 'sleepDistance', 'hitWakeTicks', 'navModeClearRadius', 'activationVerticalScale',
  'idleWanderMarginTiles', 'idleWanderScanTicks',
]) {
  CANONICAL.set(k.toLowerCase(), k)
}
function canonicalKey(k: string): string {
  const lower = k.toLowerCase()
  return CANONICAL.get(lower) ?? lower
}

export type Plain = Record<string, unknown>

function isPlain(v: unknown): v is Plain {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Lingo value -> plain data: symbols and identifiers become strings (TRUE/FALSE become booleans), calls (random(), member()) become null. */
function toPlain(v: LingoValue): unknown {
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

const ATTACK_TYPES: ReadonlySet<string> = new Set<AttackType | 'auto'>(['melee', 'ranged', 'magic', 'bullet', 'explode', 'none', 'auto'])

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
/** A 0-255 volume; #none (or missing) means soundMaster's default (calcVolumeDefault). */
function volumeOf(obj: Plain, field: string, ctx: string, fallback: number = DEFAULT_VOLUME): number {
  const v = obj[field]
  if (v === undefined || v === null || v === 'none') return fallback
  return typeof v === 'number' ? v : bad(ctx, field, 'a volume (number or #none)', v)
}
function pair(v: unknown): v is [number, number] {
  return Array.isArray(v) && v.length === 2 && typeof v[0] === 'number' && typeof v[1] === 'number'
}
/** #animframe: a frame number, a list of them, or #none (spells). */
function frameList(obj: Plain, field: string, ctx: string): number[] | null {
  const v = obj[field]
  if (v === null || v === 'none') return null
  if (typeof v === 'number') return [v]
  return Array.isArray(v) && v.every((n): n is number => typeof n === 'number') ? [...v] : bad(ctx, field, 'a frame number, a list of them or #none', v)
}
function bool(obj: Plain, field: string, ctx: string): boolean {
  const v = obj[field]
  return typeof v === 'boolean' ? v : bad(ctx, field, 'TRUE or FALSE', v)
}
/** A symbol or a list of them, #none entries dropped (modReincarnate's [#none, #none, #none] default). */
function symbolList(obj: Plain, field: string, ctx: string): string[] {
  const v = obj[field]
  const list = typeof v === 'string' ? [v] : v
  if (!Array.isArray(list) || !list.every((s): s is string => typeof s === 'string')) return bad(ctx, field, 'a symbol or a list of symbols', v)
  return list.filter((s) => s !== 'none')
}
/** #multistage: [#unit: chargeRequired, ...] in order, or #none. */
function stages(obj: Plain, field: string, ctx: string): { payload: string; chargeRequired: number }[] {
  const v = obj[field]
  if (v === 'none' || v === null) return []
  if (!isPlain(v)) return bad(ctx, field, 'a [#unit: charge, ...] list or #none', v)
  return Object.entries(v).map(([payload, c]) => (typeof c === 'number' ? { payload, chargeRequired: c } : bad(ctx, `${field}.${payload}`, 'a number', c)))
}
function range(obj: Plain, field: string, ctx: string): [number, number] {
  const v = obj[field]
  return pair(v) ? [v[0], v[1]] : bad(ctx, field, 'a [min, max] pair', v)
}
function residentGroups(obj: Plain, field: string, ctx: string): ResidentGroup[] {
  const v = obj[field]
  if (!Array.isArray(v)) return bad(ctx, field, 'a list of resident groups', v)
  return v.map((g, i) => {
    const f = `${field}[${i + 1}]`
    if (!isPlain(g)) return bad(ctx, f, 'a property list', g)
    const c = `${ctx}: ${f}`
    return { typ: str(g, 'typ', c), buildTime: range(g, 'buildTime', c), groupSize: range(g, 'groupSize', c), releaseInterval: range(g, 'releaseInterval', c) }
  })
}
function chargeVolumeMap(obj: Plain, field: string, ctx: string): ChargeVolumeMap {
  const v = obj[field]
  if (isPlain(v) && pair(v['charge']) && pair(v['vol'])) return { charge: [v['charge'][0], v['charge'][1]], vol: [v['vol'][0], v['vol'][1]] }
  return bad(ctx, field, 'a [#charge: [a,b], #vol: [c,d]] list', v)
}

function buildAttack(rawAttack: Plain | undefined, ctx: string): AttackDef {
  const a: Plain = { ...ATTACK_DEFAULTS, ...(rawAttack ?? {}) }
  if (a['idealAttackLoc'] === 'collisionLoc') a['idealAttackLoc'] = a['collisionLoc']
  const f = (field: string): string => `attack.${field}`
  const animType = str(a, 'animType', ctx)
  return {
    name: str(a, 'name', ctx), animType,
    type: attackTypeFromAnim(animType, a['type'], ctx),
    animFrame: frameList(a, 'animFrame', ctx),
    collisionLoc: vec(a, 'collisionLoc', ctx), idealAttackLoc: vec(a, 'idealAttackLoc', ctx),
    reach: numOrVec(a, 'reach', ctx),
    cooldown: num(a, 'cooldown', ctx), power: numOrVec(a, 'power', ctx),
    damageMultiplier: num(a, 'damageMultiplier', ctx),
    bullet: strOrNull(a['bullet']),
    firingType: a['firingType'] === 'fullstrength' ? 'fullstrength' : 'proportional',
    hits: strList(a, 'hits', ctx),
    chargeStart: num(a, 'chargeStart', ctx), chargeMax: num(a, 'chargeMax', ctx), chargeMaxBasic: num(a, 'chargeMaxBasic', ctx),
    chargeMaxModifier: num(a, 'chargeMaxModifier', ctx), chargeSpeed: num(a, 'chargeSpeed', ctx), chargeSize: num(a, 'chargeSize', ctx),
    chargeExplodeFactor: num(a, 'chargeExplodeFactor', ctx), explodeCharge: num(a, 'explodeCharge', ctx), chargeColour: rgb(a, 'chargeColour', ctx),
    spellSpeed: num(a, 'spellSpeed', ctx), limitMagic: a['limitMagic'] === true,
    chargeSpeedMax: a['chargeSpeedMax'] === 'unlimited' ? null : num(a, 'chargeSpeedMax', ctx),
    explodeFunction: strOrNull(a['explodeFunction']), multistage: stages(a, 'multistage', ctx),
    randomSummon: a['randomSummon'] === true, targetTileWhenNotBlank: a['targetTileWhenNotBlank'] === true,
    targetAllegiance: a['targetAllegiance'] === 'friendly' ? 'friendly' : 'enemy',
    targetCriteria: a['targetCriteria'] === 'lowestHealth' ? 'lowestHealth' : 'closestDistance',
    payloadFunction: symbolList(a, 'payloadFunction', ctx),
    sound: strOrNull(a['sound']), releaseSound: strOrNull(a['releaseSound']), explodeSound: strOrNull(a['explodeSound']),
    volume: volumeOf(a, 'volume', ctx), chargeVolumeMap: chargeVolumeMap(a, 'chargeVolumeMap', ctx),
  }
}

/** The attack with its bullet symbol resolved to an actor file key (act_iceBoulder for #iceboulder). */
function withBulletKey(a: AttackDef, actorKey: (sym: string) => string): AttackDef {
  const multistage = a.multistage.map((m) => ({ ...m, payload: actorKey(m.payload) }))
  return { ...a, bullet: a.bullet === null ? null : actorKey(a.bullet), multistage }
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
 * The raw attack list an actor ends up with: its starting weapon's (modWeaponManager.start installs
 * it), else its own natural attack, with the tuning overlay's `attack` merged on top.
 */
function installedRawAttack(r: Plain, weapon: string | null, parsed: Record<string, Plain>, overlay: unknown, ctx: string): Plain | undefined {
  let rawAttack = isPlain(r['attack']) ? r['attack'] : undefined
  if (weapon) {
    if (!parsed[weapon]) throw new Error(`${ctx}: unknown weapon ${weapon}`)
    const weaponAttack = resolveChain(weapon, parsed)['attack']
    if (!isPlain(weaponAttack)) throw new Error(`${ctx}: weapon ${weapon} has no attack list`)
    rawAttack = weaponAttack
  }
  if (overlay !== undefined) {
    if (!isPlain(overlay)) bad(ctx, 'tuning attack', 'a property list', overlay)
    rawAttack = deepMerge(rawAttack ?? {}, overlay)
  }
  return rawAttack
}

/** The actor's own #attack, with the tuning overlay's `attack` merged on when no weapon took it. */
function naturalRawAttack(r: Plain, overlay: unknown, weapon: string | null): Plain | undefined {
  const own = isPlain(r['attack']) ? r['attack'] : undefined
  return weapon === null && isPlain(overlay) ? deepMerge(own ?? {}, overlay) : own
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
  // actor symbols are case-insensitive in Lingo (dojo's #SpeedyGuy is act_speedyGuy)
  const keyByLower = new Map(Object.keys(parsed).map((k) => [k.toLowerCase(), k]))
  const actorKey = (sym: string): string => keyByLower.get(sym.toLowerCase()) ?? sym
  for (const key of Object.keys(parsed)) {
    const ctx = `actor ${key}`
    let r = resolveChain(key, parsed)
    const objType = String(r['objType'] ?? 'objGameObject')
    r = { ...OBJECT_DEFAULTS['*'], ...(OBJECT_DEFAULTS[objType] ?? {}), ...r }
    const { attack: attackOverlay, ...overlay } = tuning[key] ?? {}
    r = deepMerge(r, overlay)
    const weapon = typeof r['weapon'] === 'string' ? actorKey(r['weapon']) : null
    const rawAttack = installedRawAttack(r, weapon, parsed, attackOverlay, ctx)
    out[key] = {
      // engine: identity, allegiance and drawing
      key, name: String(r['name'] ?? key), objType, aiType: strOrNull(r['AiType']), team: str(r, 'team', ctx),
      // a few actors set a bare sprite channel as layerZ (act_cracks: 49)
      layerZ: typeof r['layerZ'] === 'number' ? String(r['layerZ']) : str(r, 'layerZ', ctx),
      startOffset: vec(r, 'startOffset', ctx), experienceImWorth: num(r, 'experienceImWorth', ctx),
      // engine: energy and physics
      energy: num(r, 'energy', ctx), energyRecoverDelay: num(r, 'energyRecoverDelay', ctx),
      friction: vec(r, 'friction', ctx), frictionReel: vec(r, 'frictionReel', ctx),
      inertia: num(r, 'inertia', ctx), damageSpeed: num(r, 'damageSpeed', ctx),
      stallSpeed: num(r, 'stallSpeed', ctx), teamRole: str(r, 'teamRole', ctx),
      reelProof: bool(r, 'reelProof', ctx), collisionDetection: bool(r, 'collisionDetection', ctx),
      minEnergy: num(r, 'minEnergy', ctx), maxEnergy: r['maxEnergy'] === 'auto' ? num(r, 'energy', ctx) : num(r, 'maxEnergy', ctx),
      // engine: movement
      walkSpeed: num(r, 'walkSpeed', ctx), walkAcceleration: num(r, 'walkAcceleration', ctx),
      navModeAcceleration: num(r, 'navModeAcceleration', ctx), pathFindingStallTime: num(r, 'pathFindingStallTime', ctx),
      // engine: character stats
      strength: num(r, 'strength', ctx), agility: num(r, 'agility', ctx), dexterity: num(r, 'dexterity', ctx), eyestrain: num(r, 'eyestrain', ctx),
      mana_burst: num(r, 'mana_burst', ctx), mana_capacity: num(r, 'mana_capacity', ctx),
      mana_flow: num(r, 'mana_flow', ctx), mana_regeneration: num(r, 'mana_regeneration', ctx),
      // engine: weapon (the attack is built last, below)
      weapon, weaponTechnique: num(r, 'weaponTechnique', ctx),
      // engine: sound
      takeHitSound: strOrNull(r['takeHitSound']), takeHitVolume: volumeOf(r, 'takeHitVolume', ctx),
      dieSound: strOrNull(r['dieSound']), dieVolume: volumeOf(r, 'dieVolume', ctx, DEFAULT_DIE_VOLUME),
      chargeLoc: vec(r, 'chargeLoc', ctx),
      graveOn: bool(r, 'graveOn', ctx), reincarnateAs: symbolList(r, 'reincarnateAs', ctx).map(actorKey), runReload: bool(r, 'runReload', ctx),
      // engine: exploding bullets (the actor-level #explodeSound / #explodeVolume, not the attack's)
      explodeEvents: symbolList(r, 'explodeEvents', ctx), exploderSound: strOrNull(r['explodeSound']),
      exploderVolume: volumeOf(r, r['explodeVolume'] !== undefined ? 'explodeVolume' : 'exploderVolume', ctx),
      musicTrack: objType === 'objMusic' && typeof r['musicName'] === 'string' ? musicTrackFromName(r['musicName']) : null,
      // engine: dwellings
      residentGroups: residentGroups(r, 'residentGroups', ctx).map((g) => ({ ...g, typ: actorKey(g.typ) })),
      totalResidents: num(r, 'totalResidents', ctx),
      // remake additions
      collisionRectScale: num(r, 'collisionRectScale', ctx), scenicMaxTicks: num(r, 'scenicMaxTicks', ctx),
      detourChance: num(r, 'detourChance', ctx), detourMoveTicks: num(r, 'detourMoveTicks', ctx),
      detourMoveMaxTicks: num(r, 'detourMoveMaxTicks', ctx), detourPauseTicks: num(r, 'detourPauseTicks', ctx),
      detourDistance: num(r, 'detourDistance', ctx), detourMinTargetDistance: num(r, 'detourMinTargetDistance', ctx),
      projectileSpreadDeg: num(r, 'projectileSpreadDeg', ctx), knockbackSpreadDeg: num(r, 'knockbackSpreadDeg', ctx),
      productionTimeScale: num(r, 'productionTimeScale', ctx),
      idleWanderIntervalTicks: num(r, 'idleWanderIntervalTicks', ctx), idleWanderChancePerSecond: num(r, 'idleWanderChancePerSecond', ctx),
      idleWanderRadius: num(r, 'idleWanderRadius', ctx),
      wakeDistance: num(r, 'wakeDistance', ctx), sleepDistance: num(r, 'sleepDistance', ctx),
      hitWakeTicks: num(r, 'hitWakeTicks', ctx), navModeClearRadius: num(r, 'navModeClearRadius', ctx),
      activationVerticalScale: num(r, 'activationVerticalScale', ctx),
      idleWanderMarginTiles: num(r, 'idleWanderMarginTiles', ctx), idleWanderScanTicks: num(r, 'idleWanderScanTicks', ctx),
      attack: withBulletKey(buildAttack(rawAttack, ctx), actorKey),
      naturalAttack: withBulletKey(buildAttack(naturalRawAttack(r, attackOverlay, weapon), ctx), actorKey),
      multiAttack: bool(r, 'multiAttack', ctx), bufferDist: num(r, 'bufferDist', ctx),
      raw: r,
    }
  }
  return out
}
