// AI spell casters (objAiCPUSpellCaster, the goblin mage; engine notes enemies-2 §2a). objAiCPU's
// target handling stays: retarget on #findTarget, a dead target or every RETARGET_TICKS. A spell's
// reach (9999) is always met, so #moveToAttack charges one step per tick once the cooldown is ready
// (objAiAttack.attackMagic -> chargeMagic, the AI mode stays #moveToAttack) and releases at the
// target's current position when the charge counter finishes (#spellCharged -> releaseMagic; no
// eyestrain, no lead). The release strip is the attack: when it loops, finishAttack re-picks the
// nearest target (objAiCPUSpellCaster.attackFin). On top runs the movement layer
// (updateMoveToOptimumPosition, mr-spell-caster.ts), so the caster walks while it charges.
import type { ActorDef } from '../mr-open/mr-actor-data'
import { RETARGET_TICKS } from '../mr-open/mr-ai-cpu'
import { cooldownReady } from '../mr-open/mr-attack'
import { arrived, frameMove } from '../mr-open/mr-pathfinding'
import { tileOfPx } from '../mr-open/mr-collision'
import { tileCentre, type Vec } from '../mr-open/mr-geometry'
import { chargeLimits, chargeStep, payloadFor, randomSummonMax } from '../mr-open/mr-spell'
import { randomInt } from './rng'
import { optimumMoveGoal, UNLIMITED_REACH, type Nearby } from '../mr-open/mr-spell-caster'
import { friendlyTeams, hatedTeams } from '../mr-open/mr-targeting'
import { defOf, faceAlong, isAlive, isBullet, isCharacter, isSpell } from './actors'
import type { ActorState } from './state'
import { actorIn, type Tick } from './tick-context'
import { nearestHostileId } from './tick-ai'
import { teamHasRoomFor } from './tick-dwelling'
import { alignSpell, chargingSpellOf, releaseMagic, startSpell, SUMMON_UNIT } from './tick-spell'

export const SPELL_CASTER_AI = 'objAiCPUSpellCaster'
/** Character modes the caster AI acts in; #reel (dazed) and the death modes leave it idle. */
const ACTIVE_MODES = new Set(['walk', 'stand', 'charge', 'release'])

export function stepSpellCasters(t: Tick): void {
  for (const a of t.actors) {
    if (t.removed.has(a.id)) continue
    const def = defOf(t.s, a)
    if (def.aiType !== SPELL_CASTER_AI || !ACTIVE_MODES.has(a.mode)) continue
    if (a.ai.mode === 'dazed') a.ai.mode = 'findTarget'
    // during the release strip the AI is in #attack; stepAttackFrames finishes it on the loop
    if (a.ai.mode !== 'attack') stepCasting(t, a, def)
    if (typeof def.attack.reach === 'number' && def.attack.reach === UNLIMITED_REACH) moveToOptimumPosition(t, a, def)
  }
}

/** objAiCPU #findTarget / #moveToAttack with a spell: retarget, then charge and release. */
function stepCasting(t: Tick, a: ActorState, def: ActorDef): void {
  const current = a.ai.targetId === null ? undefined : actorIn(t, a.ai.targetId)
  if (a.ai.mode === 'findTarget' || !current || !isAlive(current) || a.ai.retargetCounter >= RETARGET_TICKS) {
    a.ai.retargetCounter = 0
    a.ai.targetId = def.attack.targetAllegiance === 'friendly' ? mostHurtFriendId(t, a, def) : nearestHostileId(t, a)
    if (a.ai.targetId === null) {
      cancelAttack(t, a)
      return
    }
    a.ai.mode = 'moveToAttack'
  } else {
    a.ai.retargetCounter++
  }
  if (!cooldownReady(a.cooldown)) return // objAiAttack.attack: nothing until the cooldown is done
  const target = actorIn(t, a.ai.targetId!)!
  const limits = chargeLimits(def)
  let spell = chargingSpellOf(t, a)
  if (!spell) {
    // ensureSpell: the charge counter runs to calcAttackChargeMax, drawn afresh for a random summoner
    spell = startSpell(t, a, def)
    spell.chargeMax = randomSummonMax(limits.max, def.attack, (n) => draw(t, n))
  } else {
    a.mode = 'charge' // ensureMode(#charge), e.g. after a reel with the spell half charged
    spell.charge = chargeStep(spell.charge, limits.speed, spell.chargeMax)
  }
  const reinedIn = !holdSummonSlot(t, spell, def)
  if (!reinedIn && spell.charge < spell.chargeMax) return
  releaseMagic(t, a, def, spell, spellTargetLoc(t, spell, def, target))
  a.ai.mode = 'attack'
}

/** Lingo random(n) on the tick's RNG. */
function draw(t: Tick, n: number): number {
  const [v, rng] = randomInt(t.rng, n)
  t.rng = rng
  return v
}

/**
 * modSpellMultistage.obtainPermissionOrHalt, once the charge reaches a summon stage: reserve one team
 * slot, or rein the charge in below the first stage (a plain blast) and report #chargeLimited, which
 * releases the spell at once. Returns false when it reined in.
 */
function holdSummonSlot(t: Tick, spell: ActorState, def: ActorDef): boolean {
  const atk = def.attack
  if (atk.explodeFunction !== SUMMON_UNIT || spell.summonReserved > 0 || payloadFor(spell.charge, atk) === null) return true
  if (teamHasRoomFor(t, spell.team, 1)) {
    spell.summonReserved = 1
    return true
  }
  spell.charge = atk.multistage[0]!.chargeRequired - 1
  return false
}

/** objAiCPU.calcSpellTargetLoc: the target's position, or its tile's centre when the spell carries a payload and targetTileWhenNotBlank. */
function spellTargetLoc(t: Tick, spell: ActorState, def: ActorDef, target: ActorState): Vec {
  if (!def.attack.targetTileWhenNotBlank || payloadFor(spell.charge, def.attack) === null) return { ...target.pos }
  return tileCentre(tileOfPx(target.pos.x), tileOfPx(target.pos.y))
}

/** Full health for teamMaster's #lowestHealth (getHealth is a percentage). */
const FULL_HEALTH_PERCENT = 100

/**
 * teamMaster.findTarget with targetAllegiance #friendly and targetCriteria #lowestHealth: the living
 * member of a friendly team (the caster itself included) with the lowest energy percentage; none when
 * that is full (objAiCPU.refreshTarget's healBlast rule).
 */
function mostHurtFriendId(t: Tick, a: ActorState, def: ActorDef): number | null {
  const teams = friendlyTeams(a.team, t.s.teams)
  let best: ActorState | null = null
  let bestHealth = Infinity
  for (const o of t.actors) {
    if (t.removed.has(o.id) || !teams.includes(o.team) || !isCharacter(t.s, o) || !isAlive(o)) continue
    const od = defOf(t.s, o)
    if (!def.attack.hits.includes(od.teamRole)) continue
    const health = (o.energy / od.maxEnergy) * FULL_HEALTH_PERCENT
    if (health < bestHealth) {
      bestHealth = health
      best = o
    }
  }
  return best && bestHealth < FULL_HEALTH_PERCENT ? best.id : null
}

/** #noTargetFound -> objAiAttack.cancelAttack: the charging spell is finished and the caster walks. */
function cancelAttack(t: Tick, a: ActorState): void {
  const spell = chargingSpellOf(t, a)
  if (spell) t.removed.add(spell.id)
  if (a.mode === 'charge') a.mode = 'walk'
  a.ai.mode = 'findTarget'
  a.vel = { x: 0, y: 0 }
}

/**
 * updateMoveToOptimumPosition: moveToLoc toward the goal at walkSpeed (friction and tiles apply in
 * the move step), or stop. Hostile bullets are the #teamBullets of hated teams: flying bullets and
 * spells, a spell still charging over its caster's head included.
 */
function moveToOptimumPosition(t: Tick, a: ActorState, def: ActorDef): void {
  const hated = hatedTeams(a.team, t.s.teams)
  const live = t.actors.filter((o) => !t.removed.has(o.id) && hated.includes(o.team))
  const bullets = live.filter((o) => (isBullet(t.s, o) && o.mode === 'fly') || (isSpell(t.s, o) && (o.mode === 'fly' || o.mode === 'charge')))
  const enemies = live.filter((o) => isCharacter(t.s, o) && isAlive(o))
  const asEnemy = (o: ActorState): Nearby => {
    const reach = defOf(t.s, o).attack.reach
    return typeof reach === 'number' ? { pos: o.pos, reach } : { pos: o.pos }
  }
  const target = a.ai.targetId === null ? undefined : actorIn(t, a.ai.targetId)
  const [goal, rng] = optimumMoveGoal(
    a.pos,
    bullets.map((o) => ({ pos: o.pos })),
    enemies.map(asEnemy),
    target && isAlive(target) ? target.pos : null,
    t.rng,
  )
  t.rng = rng
  if (!goal || arrived(a.pos, goal)) {
    a.vel = { x: 0, y: 0 }
    a.ai.moveTarget = null
    return
  }
  a.vel = frameMove(a.pos, goal, def.walkSpeed)
  a.ai.moveTarget = goal
  faceAlong(a, a.vel.x)
}

/** A charging spell of a CPU caster follows its caster after the move step (the player's is aligned in stepPlayerAttack). */
export function alignCasterSpell(t: Tick, spell: ActorState): void {
  const owner = spell.ownerId === null ? undefined : actorIn(t, spell.ownerId)
  if (!owner || owner.id === t.s.playerId) return
  alignSpell(spell, owner, defOf(t.s, owner))
}
