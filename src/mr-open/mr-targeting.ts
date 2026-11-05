// Port of teamMaster.findTarget / calcTargetTeamsByAllegiance / findTargetInTeam (#closestDistance).
// Simplified to the full scan (findATarget): the engine's unit-map shell search (searchUnitMap, used
// with >= 5 enemies alive) is a performance path that yields the same nearest member except for ring
// ordering, so it is not ported.
import type { Vec } from './mr-geometry'

export interface Targetable {
  id: number
  team: string
  pos: Vec
  alive: boolean
}

/** First-priority hate group of `myTeam` (hates[1] in Lingo); empty when the team is unknown or peaceful. */
export function hatedTeams(myTeam: string, teams: Record<string, { hates: string[][] }>): string[] {
  return teams[myTeam]?.hates[0] ?? []
}

/**
 * calcTargetTeamsByAllegiance #friendly: the team's friends plus itself (the first-priority group
 * for healers). A friends entry that is not a team key (goblins' bare `orcs`, void in Lingo) matches nothing.
 */
export function friendlyTeams(myTeam: string, teams: Record<string, { friends: string[] }>): string[] {
  return [...(teams[myTeam]?.friends ?? []), myTeam]
}

/** What decides a heal's teams: the remake's AttackDef healsNonHostile and healNeverTeams. */
export interface HealReach { healsNonHostile: boolean; healNeverTeams: readonly string[] }

/**
 * The teams a heal of `myTeam` aims at and lands on: friendlyTeams (the engine), or with
 * healsNonHostile (remake, owner: druids) those plus every team with no hate either way between it
 * and `myTeam`, but never the healNeverTeams.
 */
export function healTeams(myTeam: string, teams: Record<string, { friends: string[]; hates: string[][] }>, reach: HealReach): string[] {
  const friends = friendlyTeams(myTeam, teams)
  if (!reach.healsNonHostile) return friends
  const mine = hatedTeams(myTeam, teams)
  const peaceful = Object.keys(teams).filter((team) => !mine.includes(team) && !hatedTeams(team, teams).includes(myTeam))
  return [...new Set([...friends, ...peaceful])].filter((team) => !reach.healNeverTeams.includes(team))
}

/** Nearest living member of any first-priority hated team by squared reg-point distance; ties keep the first. */
export function findTarget(me: Targetable, candidates: Targetable[], hated: string[]): number | null {
  let best: number | null = null
  let bestD = Infinity
  for (const c of candidates) {
    if (c.id === me.id || !c.alive || !hated.includes(c.team)) continue
    const d = (c.pos.x - me.pos.x) ** 2 + (c.pos.y - me.pos.y) ** 2
    if (d < bestD) {
      bestD = d
      best = c.id
    }
  }
  return best
}
