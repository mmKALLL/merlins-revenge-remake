// Port of the team definition fields (tem_<name>.txt) that teamMaster / objRoom read to decide
// which teams are hostile to the player and whether the room's exits may open (§7).
//
// Team identity: a team is identified everywhere by its file key (tem_<key>.txt -> "goblins"),
// which is also what actor data (`#team`) and hate/friend lists name. `teamName` is kept as read
// but never used for lookups; in the shipped data it always equals the key.
import { parseDataField, withContext } from './mr-actor-data'

export interface TeamDef {
  key: string // identity: the tem_<key>.txt file key
  teamName: string // as written in the file; informational only
  category: string
  /** hate groups in priority order; hates[0] is the first-priority group */
  hates: string[][]
  friends: string[]
  /** reservationsMaster cap on live team members in the room (dwellings wait for room under it); null = no cap */
  maxMembers: number | null
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : [])

/** files: team key (e.g. "goblins") -> raw text of tem_<key>.txt. */
export function parseTeams(files: Record<string, string>): Record<string, TeamDef> {
  const out: Record<string, TeamDef> = {}
  for (const [key, text] of Object.entries(files)) {
    const r = withContext(`team ${key}`, () => parseDataField(text))
    const hates = Array.isArray(r['hates']) ? r['hates'].map(strings) : []
    const maxMembers = typeof r['maxMembers'] === 'number' ? r['maxMembers'] : null
    out[key] = { key, teamName: String(r['teamName'] ?? key), category: String(r['category'] ?? 'none'), hates, friends: strings(r['friends']), maxMembers }
  }
  return out
}

/** Keys of the teams whose first-priority hate group contains `playerTeam` (or 'all'), in key order. */
export function hostileTeamsTo(playerTeam: string, teams: Record<string, TeamDef>): string[] {
  return Object.values(teams)
    .filter((t) => (t.hates[0] ?? []).some((h) => h === playerTeam || h === 'all'))
    .map((t) => t.key)
}
