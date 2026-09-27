// Cut scene scripts: a port of objScript's parser (interpretScript, interpretPlayers,
// interpretLines, interpretLineCommand, interpretLineArgs). Format (see the archive's cut_scenes/):
//
//   characters
//   #merlin - m          one per player: character symbol, "-", the name the lines use
//   lines
//   setStage             a stage command (cutSceneMaster)
//   m at 300             a player command: script name, command, arguments
//   m: Woo hoo!          a spoken line: script name with ":", then the text
//
// Anything before "characters" (a cast member's info line) is ignored, as are blank lines.

export interface Rgb { r: number; g: number; b: number }

export interface ScriptPlayer {
  /** the character symbol without "#" (docs/valid_cutscene_characters.txt), e.g. "merlin" */
  character: string
  /** the name the lines use for it, e.g. "m" */
  scriptName: string
}

/** Lingo value() of an argument: a number, point(x, y), rgb(r, g, b), or the raw text. */
export type ScriptValue = number | { x: number; y: number } | Rgb | string

export type ScriptArgs =
  | { kind: 'none' }
  | { kind: 'value'; value: ScriptValue }
  /** a player named by its script name, as its character (turnToFace, atPlayer, produceProp, walkToPlayer) */
  | { kind: 'character'; character: string | null }
  /** speakLine and showTitle */
  | { kind: 'text'; text: string }
  | { kind: 'sound'; member: string; volume: number }
  | { kind: 'walkScroll'; dir: string; speed: ScriptValue; characters: (string | null)[] }

export interface ScriptLine {
  /** the player performing the line; null for a stage command (cutSceneMaster) */
  character: string | null
  command: string
  args: ScriptArgs
}

export interface CutSceneScript {
  players: ScriptPlayer[]
  lines: ScriptLine[]
}

/** objScript.interpretLineArgsPlaySound: a sound without a volume plays at full volume. */
const FULL_VOLUME = 255

/**
 * Commands objScript, modThespian and cutSceneMaster know, in their Lingo spelling. Lingo symbols
 * ignore case, so "At" in a script is #at.
 */
const COMMANDS = [
  'at', 'atPlayer', 'backgroundColour', 'backgroundColourTo', 'backgroundColourRandomFlash', 'dropProp',
  'enterStageLeft', 'enterStageRight', 'exitStageLeft', 'exitStageRight', 'fadeDown', 'fadeUp', 'goMode',
  'gotoWings', 'goWastedMode', 'lightsDown', 'lightsUp', 'playMusic', 'playSound', 'produceProp', 'propAt',
  'putAwayProp', 'setStage', 'showTitle', 'speakLine', 'teleportInAt', 'teleportOut', 'turnToFace', 'wait',
  'walkScroll', 'walkScrollLeft', 'walkScrollRight', 'walkScrollStop', 'walkTo', 'walkToPlayer',
]
const CANONICAL = new Map(COMMANDS.map((c) => [c.toLowerCase(), c]))
const canonical = (word: string): string => CANONICAL.get(word.toLowerCase()) ?? word

/** Lingo words: runs of characters between spaces, tabs and line breaks. */
const words = (line: string): string[] => line.split(/\s+/).filter((w) => w !== '')

/** The text from word `from` (0-based) to the end of the line, as Lingo's `line.word[n .. count]`. */
function wordsFrom(line: string, from: number): string {
  const re = /\S+/g
  let m: RegExpExecArray | null
  let i = 0
  while ((m = re.exec(line)) !== null) {
    if (i === from) return line.slice(m.index).trimEnd()
    i++
  }
  return ''
}

/** Lingo value() for the argument forms scripts use; anything else stays text. */
export function scriptValue(text: string): ScriptValue {
  const t = text.trim()
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t)
  const call = /^(point|rgb)\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*(?:,\s*(-?[\d.]+)\s*)?\)$/i.exec(t)
  if (call) {
    const [, fn, a, b, c] = call
    if (fn!.toLowerCase() === 'point' && c === undefined) return { x: Number(a), y: Number(b) }
    if (fn!.toLowerCase() === 'rgb' && c !== undefined) return { r: Number(a), g: Number(b), b: Number(c) }
  }
  return t
}

export function parseCutScene(text: string): CutSceneScript {
  // objScript.correctLineEndings: CR, LF and CRLF all end a line
  const lines = text.split(/\r\n|\r|\n/)
  const players = parsePlayers(lines)
  return { players, lines: parseLines(lines, players) }
}

/** objScript.calcFirstLine: the line after the first one whose first word is `firstWord`. */
function firstLineAfter(lines: string[], firstWord: string): number | null {
  const i = lines.findIndex((l) => words(l)[0] === firstWord)
  return i < 0 ? null : i + 1
}

function parsePlayers(lines: string[]): ScriptPlayer[] {
  const players: ScriptPlayer[] = []
  const first = firstLineAfter(lines, 'characters')
  if (first === null) return players
  for (const line of lines.slice(first)) {
    const w = words(line)
    if (w.length === 0) continue
    if (w[0] === 'lines') break
    players.push({ character: w[0]!.replace(/^#/, ''), scriptName: w[2] ?? '' })
  }
  return players
}

function parseLines(lines: string[], players: ScriptPlayer[]): ScriptLine[] {
  const out: ScriptLine[] = []
  const first = firstLineAfter(lines, 'lines')
  if (first === null) return out
  const characterOf = (scriptName: string | undefined): string | null => {
    const name = scriptName?.endsWith(':') ? scriptName.slice(0, -1) : scriptName
    return players.find((p) => p.scriptName === name)?.character ?? null
  }
  for (const line of lines.slice(first)) {
    const w = words(line)
    if (w.length === 0) continue
    const character = characterOf(w[0])
    const command = lineCommand(w, character)
    out.push({ character, command, args: lineArgs(command, line, characterOf) })
  }
  return out
}

/** objScript.interpretLineCommand: "name:" speaks; a script name is followed by its command; else the first word is one. */
function lineCommand(w: string[], character: string | null): string {
  if (w[0]!.endsWith(':')) return 'speakLine'
  if (character !== null) return canonical(w[1] ?? '')
  return canonical(w[0]!)
}

/** objScript.interpretLineArgs: word 2 on for stage commands, word 3 on for player commands. */
function lineArgs(command: string, line: string, characterOf: (name: string | undefined) => string | null): ScriptArgs {
  const w = words(line)
  const value = (from: number): ScriptArgs => ({ kind: 'value', value: scriptValue(wordsFrom(line, from)) })
  switch (command) {
    case 'at': case 'propAt': case 'teleportInAt': case 'walkTo':
      return value(2)
    case 'backgroundColour': case 'backgroundColourTo': case 'wait':
      return value(1)
    case 'backgroundColourRandomFlash':
      return w[1] === undefined ? { kind: 'none' } : { kind: 'value', value: scriptValue(w[1]) }
    case 'fadeDown': case 'goMode':
      return w[2] === undefined ? { kind: 'none' } : { kind: 'value', value: scriptValue(w[2]) }
    case 'atPlayer': case 'produceProp': case 'turnToFace': case 'walkToPlayer':
      return { kind: 'character', character: characterOf(w[2]) }
    case 'showTitle': case 'speakLine':
      return { kind: 'text', text: wordsFrom(line, 1) }
    case 'playMusic': case 'playSound': {
      const volume = w[2] === undefined ? FULL_VOLUME : Number(w[2])
      return { kind: 'sound', member: w[1] ?? '', volume: Number.isFinite(volume) ? volume : FULL_VOLUME }
    }
    case 'walkScroll':
      return { kind: 'walkScroll', dir: w[1] ?? '', speed: scriptValue(w[2] ?? ''), characters: w.slice(3).map(characterOf) }
    default:
      return { kind: 'none' }
  }
}
