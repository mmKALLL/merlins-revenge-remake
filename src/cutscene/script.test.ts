import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseCutScene, scriptValue } from './script'

describe('parseCutScene (objScript.interpretScript)', () => {
  it('reads the end cut scene cast member, skipping its info line', () => {
    const script = parseCutScene(readFileSync('assets/cut-scenes/cut_scene_to_play_at_end.txt', 'utf8'))
    expect(script.players).toEqual([{ character: 'merlin', scriptName: 'm' }])
    expect(script.lines).toEqual([
      { character: null, command: 'setStage', args: { kind: 'none' } },
      { character: 'merlin', command: 'at', args: { kind: 'value', value: 300 } },
      { character: null, command: 'showTitle', args: { kind: 'text', text: 'Map Cleared!' } },
      { character: null, command: 'backgroundColourTo', args: { kind: 'value', value: { r: 220, g: 220, b: 220 } } },
      { character: null, command: 'lightsUp', args: { kind: 'none' } },
      { character: 'merlin', command: 'speakLine', args: { kind: 'text', text: 'Woo hoo!' } },
      { character: null, command: 'wait', args: { kind: 'value', value: 20 } },
      { character: null, command: 'backgroundColourTo', args: { kind: 'value', value: { r: 0, g: 0, b: 0 } } },
      { character: null, command: 'lightsDown', args: { kind: 'none' } },
    ])
  })

  it('handles CR line endings, script-name commands in any case, and character arguments', () => {
    const text = 'characters\r#merlin - m\r#ulin - u\r\rlines\rm At 200\ru turnToFace m\rm walkTo point(10, 20)\rplaySound end_level\rplaySound spell 90\ru:  Well   done!\r'
    const { lines } = parseCutScene(text)
    expect(lines).toEqual([
      { character: 'merlin', command: 'at', args: { kind: 'value', value: 200 } },
      { character: 'ulin', command: 'turnToFace', args: { kind: 'character', character: 'merlin' } },
      { character: 'merlin', command: 'walkTo', args: { kind: 'value', value: { x: 10, y: 20 } } },
      { character: null, command: 'playSound', args: { kind: 'sound', member: 'end_level', volume: 255 } },
      { character: null, command: 'playSound', args: { kind: 'sound', member: 'spell', volume: 90 } },
      // the speech keeps its inner spacing (Lingo's word[2 .. count] is a chunk of the line)
      { character: 'ulin', command: 'speakLine', args: { kind: 'text', text: 'Well   done!' } },
    ])
  })

  it('gives every spoken line of the end cut scene a player', () => {
    const script = parseCutScene(readFileSync('assets/cut-scenes/cut_scene_to_play_at_end.txt', 'utf8'))
    for (const line of script.lines) if (line.command === 'speakLine') expect(line.character).not.toBeNull()
  })
})

describe('scriptValue (Lingo value())', () => {
  it('reads numbers, points and colours, and keeps other text', () => {
    expect(scriptValue('-12.5')).toBe(-12.5)
    expect(scriptValue('point(1,2)')).toEqual({ x: 1, y: 2 })
    expect(scriptValue('rgb(0, 150, 0)')).toEqual({ r: 0, g: 150, b: 0 })
    expect(scriptValue('#left')).toBe('#left')
  })
})
