import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { defs } from '../sim/test-data'
import { cutSceneCast } from './cast'
import { MAP_INTROS, introFor, introOver, introView, skipIntro, startIntro, stepIntro } from './intro'
import { parseCutScene } from './script'

const STAGE = { left: 32, right: 608 }
const script = parseCutScene(readFileSync(`assets/cut-scenes/${MAP_INTROS['some_bugs/merliniii']}.txt`, 'utf8'))

describe('map intros (remake: owner decision)', () => {
  it("only merliniii has one, MR3's intro", () => {
    expect(introFor('some_bugs/merliniii')).toBe('mr3IntroFull')
    expect(Object.keys(MAP_INTROS)).toEqual(['some_bugs/merliniii'])
    expect(introFor('works/sam')).toBeNull()
  })

  it('plays on a black screen to its end, then is over', () => {
    let { intro } = startIntro(script, STAGE, cutSceneCast(defs))
    expect(introView(intro)).toMatchObject({ fade: 1, done: false })
    expect(introView(intro).cutScene).not.toBeNull()
    for (let i = 0; i < 40000 && !introOver(intro); i++) intro = stepIntro(intro).intro
    expect(introOver(intro)).toBe(true)
    expect(introView(intro).cutScene).toBeNull()
  })

  it('a skip ends it at once', () => {
    const { intro } = startIntro(script, STAGE, cutSceneCast(defs))
    expect(introOver(intro)).toBe(false)
    expect(introOver(skipIntro())).toBe(true)
    expect(stepIntro(skipIntro()).intro).toEqual({ phase: 'done' })
  })
})
