// Port of the team definition fields (tem_<name>.txt) that teamMaster / objRoom read to decide
// which teams are hostile to the player and whether the room's exits may open (§7).
import { parseDataField, withContext } from './mr-actor-data'

export interface TeamDef {
  key: string
  teamName: string
  category: string
  /** hate groups in priority order; hates[0] is the first-priority group */
  hates: string[][]
  friends: string[]
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : [])

/** files: team key (e.g. "goblins") -> raw text of tem_<key>.txt. */
export function parseTeams(files: Record<string, string>): Record<string, TeamDef> {
  const out: Record<string, TeamDef> = {}
  for (const [key, text] of Object.entries(files)) {
    const r = withContext(`team ${key}`, () => parseDataField(text))
    const hates = Array.isArray(r['hates']) ? r['hates'].map(strings) : []
    out[key] = { key, teamName: String(r['teamName'] ?? key), category: String(r['category'] ?? 'none'), hates, friends: strings(r['friends']) }
  }
  return out
}

/** Teams whose first-priority hate group contains `playerTeam` (or 'all'), in key order. */
export function hostileTeamsTo(playerTeam: string, teams: Record<string, TeamDef>): string[] {
  return Object.values(teams)
    .filter((t) => (t.hates[0] ?? []).some((h) => h === playerTeam || h === 'all'))
    .map((t) => t.teamName)
}
