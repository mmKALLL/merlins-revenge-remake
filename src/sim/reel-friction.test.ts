// Remake (owner request): walking against a knockback cuts the slide short (frictionReelAgainstWalk).
import { describe, expect, it } from 'vitest'
import type { MapDefinition } from '../mr-open/mr-map-format'
import { playerOf } from './actors'
import { NO_INPUT, type InputSnapshot, type SimState } from './state'
import { anims, defs, teams } from './test-data'
import { createSim, stepSim } from './tick'
import { buildWorldGrid } from './world-grid'

function world(againstWalk: { x: number; y: number } | null): SimState {
  const fill = (v: number) => Array.from({ length: 9 }, () => Array<number>(18).fill(v))
  const map: MapDefinition = {
    mapSize: { x: 1, y: 1 }, roomSize: { x: 18, y: 9 }, startRoom: { x: 1, y: 1 },
    layers: [{ name: 'backgroundPassive', tileSet: 'p' }, { name: 'backgroundActive', tileSet: 'a' }, { name: 'objects', tileSet: 'o' }],
    rooms: [{ num: 1, layers: { backgroundActive: fill(0), backgroundPassive: fill(1), objects: fill(0) } }],
  }
  const tuned = { ...defs, player: { ...defs['player']!, frictionReelAgainstWalk: againstWalk } }
  const s = createSim(buildWorldGrid(map, () => false, ['none']), tuned, teams, anims, 1, { x: 300, y: 144 }, 'rooms')
  // a hit has just pushed Merlin to the left
  return { ...s, actors: s.actors.map((a) => (a.id === s.playerId ? { ...a, knockback: { x: -6, y: 0 } } : a)) }
}

const slideAfter = (s: SimState, input: InputSnapshot, ticks: number): number => {
  for (let i = 0; i < ticks; i++) s = stepSim(s, input)
  return Math.abs(playerOf(s).knockback.x)
}

describe('knockback friction against the walk', () => {
  const walkRight: InputSnapshot = { ...NO_INPUT, move: { x: 1, y: 0 } }
  const walkLeft: InputSnapshot = { ...NO_INPUT, move: { x: -1, y: 0 } }

  it('fades the slide faster while Merlin walks against it', () => {
    const s = world({ x: 30, y: 30 })
    expect(slideAfter(s, walkRight, 5)).toBeLessThan(slideAfter(s, NO_INPUT, 5))
  })

  it('leaves a slide he walks along, or does not fight, as the engine does', () => {
    const s = world({ x: 30, y: 30 })
    const engine = world(null)
    expect(slideAfter(s, walkLeft, 5)).toBeCloseTo(slideAfter(engine, walkLeft, 5), 10)
    expect(slideAfter(s, NO_INPUT, 5)).toBeCloseTo(slideAfter(engine, NO_INPUT, 5), 10)
  })
})
