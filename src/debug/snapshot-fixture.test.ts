// Example of a regression test from a pasted snapshot (readme "Reporting bugs"): save the paste as
// a fixture, rebuild the sim at that moment, step it and check what went wrong.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { NO_INPUT } from '../sim/state'
import { stepSim } from '../sim/tick'
import { simFromSnapshot } from './snapshot-test-data'

const fixture = readFileSync('src/debug/fixtures/combat-test-room2.json', 'utf8')

describe('snapshot fixture: combat_test, mid-fight in room 2', () => {
  it('rebuilds the moment and keeps the goblins inside the room', () => {
    const { sim, snapshot } = simFromSnapshot(fixture)
    expect(sim.tick).toBe(snapshot.tick)
    expect(sim.room).toEqual({ x: 2, y: 1 })
    let s = sim
    for (let i = 0; i < 150; i++) s = stepSim(s, NO_INPUT)
    const room = s.grid.roomRectPx(s.room)
    for (const a of s.actors.filter((x) => x.def.startsWith('goblin'))) {
      expect(a.pos.x).toBeGreaterThanOrEqual(room.left)
      expect(a.pos.x).toBeLessThanOrEqual(room.right)
    }
  })
})
