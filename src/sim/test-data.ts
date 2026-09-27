// Engine data for integration tests: assets/actors (the remake's detour and idle wander off), the converted teams
// and the converted atlases in public/generated/sprites (pnpm assets:convert). Node only.
import { readdirSync, readFileSync } from 'node:fs'
import { resolveActors, type ActorDef } from '../mr-open/mr-actor-data'
import type { TeamDef } from '../mr-open/mr-team-data'
import type { AnimationSet } from './state'

const actorFiles = Object.fromEntries(readdirSync('assets/actors').map((f) => [f.replace(/\.txt$/, ''), readFileSync(`assets/actors/${f}`, 'utf8')]))
// engine data; the remake's detour and idle wander are off
export const defs: Record<string, ActorDef> = resolveActors(actorFiles, {
  player: { weapon: 'energyBlast' },
  goblinWarrior: { detourChance: 0 }, goblinArcher: { detourChance: 0 }, bowOrc: { detourChance: 0 }, swordOrc: { detourChance: 0 },
})
for (const d of Object.values(defs)) d.idleWanderChancePerSecond = 0
// resident groups of unported actors are dropped, as convert-assets does (goblinHouse's goblinBuilder)
for (const d of Object.values(defs)) d.residentGroups = d.residentGroups.filter((g) => defs[g.typ])
export const teams = JSON.parse(readFileSync('public/generated/teams.json', 'utf8')) as Record<string, TeamDef>

type AtlasJson = { animations: Record<string, { delay: number; frames: { w: number; h: number; delay: number; reg?: { x: number; y: number } }[] }> }
/** The converted atlases as the loader reads them (loadSprite, minus textures). */
export const anims: Record<string, AnimationSet> = Object.fromEntries(
  readdirSync('public/generated/sprites').filter((f) => f.endsWith('.json')).map((f) => {
    const atlas = JSON.parse(readFileSync(`public/generated/sprites/${f}`, 'utf8')) as AtlasJson
    const set: AnimationSet = {}
    for (const [name, a] of Object.entries(atlas.animations)) {
      const first = a.frames[0]!
      const delays = a.frames.map((fr) => fr.delay)
      set[name] = { frames: a.frames.length, delay: a.delay, w: first.w, h: first.h, ...(delays.some((d) => d !== a.delay) ? { delays } : {}), ...(first.reg ? { reg: first.reg } : {}) }
    }
    if (!set['stand'] && set['walk']) set['stand'] = { ...set['walk'], frames: 1 }
    return [f.replace(/\.json$/, ''), set]
  }),
)
