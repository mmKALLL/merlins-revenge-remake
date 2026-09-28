import { describe, expect, it } from 'vitest'
import { nextAppState, PLAYING, simRuns, TITLE, type AppAction, type AppState } from './app-state'

const run = (s: AppState, ...actions: AppAction[]): AppState => actions.reduce(nextAppState, s)

describe('app state', () => {
  it('goes title -> playing -> paused -> playing, and paused -> title', () => {
    const playing = nextAppState(TITLE, { kind: 'play' })
    expect(playing).toEqual(PLAYING)
    const paused = nextAppState(playing, { kind: 'pause' })
    expect(paused).toEqual({ screen: 'paused', panel: 'main' })
    expect(nextAppState(paused, { kind: 'resume' })).toEqual(PLAYING)
    expect(nextAppState(paused, { kind: 'quit' })).toEqual(TITLE)
  })

  it('Esc backs out of a sub-panel, then resumes from the in-game menu', () => {
    const settings = run(PLAYING, { kind: 'pause' }, { kind: 'open', panel: 'settings' })
    expect(settings).toEqual({ screen: 'paused', panel: 'settings' })
    const menu = nextAppState(settings, { kind: 'back' })
    expect(menu).toEqual({ screen: 'paused', panel: 'main' })
    expect(nextAppState(menu, { kind: 'back' })).toEqual(PLAYING)
  })

  it('Esc on the title screen leaves a sub-panel but stays on the title', () => {
    const maps = nextAppState(TITLE, { kind: 'open', panel: 'maps' })
    expect(maps).toEqual({ screen: 'title', panel: 'maps' })
    expect(run(maps, { kind: 'back' }, { kind: 'back' })).toEqual(TITLE)
  })

  it('ignores actions that do not apply', () => {
    expect(nextAppState(TITLE, { kind: 'pause' })).toEqual(TITLE)
    expect(nextAppState(TITLE, { kind: 'resume' })).toEqual(TITLE)
    expect(nextAppState(PLAYING, { kind: 'open', panel: 'maps' })).toEqual(PLAYING)
    expect(nextAppState(PLAYING, { kind: 'quit' })).toEqual(PLAYING)
    expect(nextAppState(PLAYING, { kind: 'play' })).toEqual(PLAYING)
  })

  it('runs the simulation only while playing', () => {
    expect(simRuns(TITLE)).toBe(false)
    expect(simRuns(PLAYING)).toBe(true)
    expect(simRuns(run(PLAYING, { kind: 'pause' }))).toBe(false)
    expect(simRuns(run(PLAYING, { kind: 'pause' }, { kind: 'open', panel: 'help' }))).toBe(false)
  })
})
