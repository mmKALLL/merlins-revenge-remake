import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { hostileTeamsTo, parseTeams } from './mr-team-data'

function loadFiles(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const f of readdirSync('assets/teams')) out[f.replace(/\.txt$/, '')] = readFileSync(`assets/teams/${f}`, 'utf8')
  return out
}

describe('parseTeams', () => {
  const teams = parseTeams(loadFiles())

  it('reads the real team files', () => {
    expect(teams['aldevar']!.teamName).toBe('aldevar')
    expect(teams['aldevar']!.category).toBe('friends')
    expect(teams['aldevar']!.hates[0]).toContain('goblins')
    expect(teams['aldevar']!.hates).toHaveLength(2)
    expect(teams['goblins']!.friends).toEqual(['orcs']) // bare identifier in the original
    expect(teams['goblins']!.hates[0]).toContain('aldevar')
    expect(teams['goblins']!.maxMembers).toBe(16)
    expect(teams['orcs']!.friends).toEqual(['goblins'])
  })

  it('lists the teams hostile to the player team', () => {
    const hostile = hostileTeamsTo('aldevar', teams)
    expect(hostile).toEqual(expect.arrayContaining(['goblins', 'orcs', 'undead']))
    expect(hostile).not.toContain('village')
    expect(hostile).not.toContain('aldevar')
    expect(hostileTeamsTo('goblins', teams)).toContain('aldevar')
  })

  it('treats a first-priority "all" hate group as hostile to everyone', () => {
    const t = parseTeams({ z: '[#name: "tem_z", #type: #field]\n[#teamName: #z, #category: #enemies, #hates: [[#all]]]' })
    expect(hostileTeamsTo('anyone', t)).toEqual(['z'])
  })

  it('identifies teams by their file key, not by teamName', () => {
    const t = parseTeams({ zed: '[#name: "tem_zed", #type: #field]\n[#teamName: #Zeds, #category: #enemies, #hates: [[#aldevar]]]' })
    expect(hostileTeamsTo('aldevar', t)).toEqual(['zed'])
  })

  it('prefixes Lingo parse errors with the team key', () => {
    expect(() => parseTeams({ bad: '[#name: "tem_bad", #type: #field]\n[#teamName: ' })).toThrow(/^team bad: /)
  })
})
