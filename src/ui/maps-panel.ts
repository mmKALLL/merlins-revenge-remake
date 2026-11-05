// Maps: the folder browser and the Favourites list (map-browser.ts). Picking a map reloads the page
// with ?map=<id>, which starts that map. Each map shows its best score (the table chosen in Settings,
// in the world mode of the player's camera); the lists redraw on opening, after a run or a change in Settings.
import { el, panel } from './dom'
import { scrollToCurrent, setupMapBrowser, type ShownScores } from './map-browser'
import type { MenuPanel } from './overlay'

export function mapsPanel(currentId: string, back: () => void, shownScores: ShownScores): MenuPanel {
  const { root, body } = panel('Maps', back)
  const lists = el('div', 'map-lists')
  const browser = el('ul')
  browser.id = 'maps'
  lists.appendChild(browser)
  body.appendChild(lists)
  let refresh: (() => void) | null = null
  // adds the Favourites list after the browser
  void setupMapBrowser(browser, currentId, shownScores).then((r) => { refresh = r })
  // the lists could not scroll to the current map while hidden
  const showCurrent = () => { for (const list of lists.querySelectorAll('ul')) scrollToCurrent(list) }
  return {
    root,
    onShow: () => {
      refresh?.() // a run may have set a best score, or the camera changed since the lists were drawn
      requestAnimationFrame(showCurrent)
    },
  }
}
