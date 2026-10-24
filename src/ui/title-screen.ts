// The title screen (movieMaster opens on #titleScreen): the original's lettering, the main menu (with
// the remake's Roguelite entry and its statistics) and a credits line.
import type { RogueliteStats } from '../data/roguelite-stats'
import type { Panel } from './app-state'
import { button, el, menuList } from './dom'
import type { MenuPanel } from './overlay'
import { runsLine } from './roguelite-stats-view'
import { titleHeading } from './title-art'

export interface TitleActions {
  play: () => void
  /** starts a roguelite run (a fresh seed) */
  roguelite: () => void
  open: (panel: Exclude<Panel, 'main'>) => void
}

export interface TitleScreen extends MenuPanel {
  /** The map Play starts, shown under the button. */
  setMap(id: string): void
  /** While the map loads, Play is disabled and says so. */
  setLoading(loading: boolean): void
  /** The roguelite statistics, shown under the Roguelite button. */
  setStats(stats: RogueliteStats): void
}

export function titleScreen(actions: TitleActions): TitleScreen {
  const root = el('section', 'panel title-screen')
  root.setAttribute('aria-label', 'Title screen')
  const play = button('Play', actions.play, 'primary')
  const mapName = el('span', 'hint')
  play.append(mapName)
  const roguelite = button('Roguelite', actions.roguelite)
  const statsText = el('span', 'title-stats')
  roguelite.append(statsText)
  const credits = el('p', 'credits')
  credits.append(
    "Merlin's Revenge and the Merlin Open engine by Steve Riddett, ",
    link('The Metal Box', 'https://www.themetalbox.com'),
    ', released under the GNU GPL. This browser remake is a port of that engine.',
  )
  root.append(
    titleHeading(),
    menuList(
      play,
      roguelite,
      button('Maps', () => actions.open('maps')),
      button('Settings', () => actions.open('settings')),
      button('How to play', () => actions.open('help')),
    ),
    credits,
  )
  return {
    root,
    setMap: (id) => { mapName.textContent = id },
    setLoading: (loading) => {
      play.disabled = loading
      roguelite.disabled = loading
      play.firstChild!.textContent = loading ? 'Loading…' : 'Play'
    },
    setStats: (stats) => {
      // owner: the main menu shows only the runs, wins and win ratio
      statsText.replaceChildren(el('span', 'hint', runsLine(stats)))
    },
  }
}

function link(text: string, href: string): HTMLAnchorElement {
  const a = el('a', '', text)
  a.href = href
  a.target = '_blank'
  a.rel = 'noopener'
  return a
}
