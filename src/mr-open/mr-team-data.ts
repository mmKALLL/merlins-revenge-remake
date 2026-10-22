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
  /** remake: a colour the team's units are blended toward when drawn (Merlin's summoned monsters); null = none */
  overlay: TeamOverlay | null
}

export interface TeamOverlay { colour: { r: number; g: number; b: number }; opacity: number }

/** assets/tuning.json keys that tune a team instead of an actor: `team:<key>`. */
export const TEAM_TUNING_PREFIX = 'team:'

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : [])

/** files: team key (e.g. "goblins") -> raw text of tem_<key>.txt. */
export function parseTeams(files: Record<string, string>): Record<string, TeamDef> {
  const out: Record<string, TeamDef> = {}
  for (const [key, text] of Object.entries(files)) {
    const r = withContext(`team ${key}`, () => parseDataField(text))
    const hates = Array.isArray(r['hates']) ? r['hates'].map(strings) : []
    const maxMembers = typeof r['maxMembers'] === 'number' ? r['maxMembers'] : null
    out[key] = { key, teamName: String(r['teamName'] ?? key), category: String(r['category'] ?? 'none'), hates, friends: strings(r['friends']), maxMembers, overlay: null }
  }
  return out
}

/** The teams with assets/tuning.json's `team:<key>` entries applied: `maxMembers` and the remake `overlay`. */
export function withTeamTuning(teams: Record<string, TeamDef>, tuning: Record<string, Record<string, unknown>>): Record<string, TeamDef> {
  const out = { ...teams }
  for (const [name, fields] of Object.entries(tuning)) {
    if (!name.startsWith(TEAM_TUNING_PREFIX)) continue
    const key = name.slice(TEAM_TUNING_PREFIX.length)
    const team = out[key]
    if (!team) throw new Error(`tuning ${name}: no team ${key}`)
    const next = { ...team }
    if ('maxMembers' in fields) {
      if (fields['maxMembers'] !== null && typeof fields['maxMembers'] !== 'number') throw new Error(`tuning ${name}: maxMembers must be a number or null`)
      next.maxMembers = fields['maxMembers'] as number | null
    }
    if ('overlay' in fields) next.overlay = overlayOf(name, fields['overlay'])
    out[key] = next
  }
  return out
}

function overlayOf(ctx: string, v: unknown): TeamOverlay | null {
  if (v === null) return null
  const o = v as { colour?: { r?: unknown; g?: unknown; b?: unknown }; opacity?: unknown }
  const c = o?.colour
  if (!c || typeof c.r !== 'number' || typeof c.g !== 'number' || typeof c.b !== 'number' || typeof o.opacity !== 'number') {
    throw new Error(`tuning ${ctx}: overlay must be { colour: { r, g, b }, opacity }`)
  }
  return { colour: { r: c.r, g: c.g, b: c.b }, opacity: o.opacity }
}

/** Keys of the teams whose first-priority hate group contains `playerTeam` (or 'all'), in key order. */
export function hostileTeamsTo(playerTeam: string, teams: Record<string, TeamDef>): string[] {
  return Object.values(teams)
    .filter((t) => (t.hates[0] ?? []).some((h) => h === playerTeam || h === 'all'))
    .map((t) => t.key)
}
