// Remake difficulty settings (owner request, 2026-10-25). Hard is the game as tuned; Normal and Easy
// give Merlin more energy and a head start of medikits (Easy: potions too). Only runs on Hard count
// towards best scores and the roguelite statistics.
import type { ActorDef } from '../mr-open/mr-actor-data'
import { POTION_CHARACTERS, drinkPotion } from '../mr-open/mr-pickup'
import { playerOf } from './actors'
import { VOID_SCORE } from './score'
import type { SimState } from './state'

export const DIFFICULTIES = ['hard', 'normal', 'easy'] as const
export type Difficulty = typeof DIFFICULTIES[number]
export const DEFAULT_DIFFICULTY: Difficulty = 'hard'

interface DifficultyBonus {
  maxEnergyFactor: number // Merlin's energy and maximum x this
  medikits: number // medikits in stock at the start of a run
  potionsOfEach: number // potions of every type drunk at the start of a run
}

export const DIFFICULTY_BONUS: Readonly<Record<Difficulty, DifficultyBonus>> = {
  hard: { maxEnergyFactor: 1, medikits: 0, potionsOfEach: 0 },
  normal: { maxEnergyFactor: 1.25, medikits: 3, potionsOfEach: 0 },
  easy: { maxEnergyFactor: 1.5, medikits: 9, potionsOfEach: 4 },
}

/** Whether a run at this difficulty counts towards best scores and statistics (Hard only). */
export const countsForRecords = (d: Difficulty): boolean => d === 'hard'

/** The actor definitions with Merlin's energy and maximum scaled for the difficulty. */
export function withDifficultyDefs(defs: Record<string, ActorDef>, d: Difficulty): Record<string, ActorDef> {
  const player = defs['player']
  const factor = DIFFICULTY_BONUS[d].maxEnergyFactor
  if (!player || factor === 1) return defs
  return { ...defs, player: { ...player, energy: Math.round(player.energy * factor), maxEnergy: Math.round(player.maxEnergy * factor) } }
}

/** A run's first sim with the difficulty's head start: medikits and potions; an easier run keeps no score. */
export function withDifficultyStart(s: SimState, d: Difficulty): SimState {
  const bonus = DIFFICULTY_BONUS[d]
  let potionsDrunk = s.pickups.potionsDrunk
  for (const character of POTION_CHARACTERS) for (let i = 0; i < bonus.potionsOfEach; i++) potionsDrunk = drinkPotion(potionsDrunk, character)
  const medikits = { ...s.pickups.medikits, stock: s.pickups.medikits.stock + bonus.medikits }
  const p = playerOf(s)
  return {
    ...s,
    pickups: { ...s.pickups, potionsDrunk, medikits },
    score: countsForRecords(d) ? s.score : VOID_SCORE,
    actors: s.actors.map((a) => (a.id === p.id ? { ...a, energy: s.defs['player']!.maxEnergy } : a)),
  }
}
