// The title screen (movieMaster opens on #titleScreen): the original's lettering, the main menu and
// a credits line.
import type { Panel } from './app-state'
import { button, el, menuList } from './dom'
import type { MenuPanel } from './overlay'
import { titleHeading } from './title-art'

export interface TitleActions {
  play: () => void
  open: (panel: Exclude<Panel, 'main'>) => void
}

export interface TitleScreen extends MenuPanel {
  /** The map Play starts, shown under the button. */
  setMap(id: string): void
  /** While the map loads, Play is disabled and says so. */
  setLoading(loading: boolean): void
}

export function titleScreen(actions: TitleActions): TitleScreen {
  const root = el('section', 'panel title-screen')
  root.setAttribute('aria-label', 'Title screen')
  const play = button('Play', actions.play, 'primary')
  const mapName = el('span', 'hint')
  play.append(mapName)
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
      play.firstChild!.textContent = loading ? 'Loading…' : 'Play'
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
