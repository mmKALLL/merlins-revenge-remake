// Maps: the folder browser and the Favourites list (map-browser.ts). Picking a map reloads the page
// with ?map=<id>, which starts that map. Each map shows its best score; the lists redraw on opening.
import { el, panel } from './dom'
import { scrollToCurrent, setupMapBrowser } from './map-browser'
import type { MenuPanel } from './overlay'

export function mapsPanel(currentId: string, back: () => void): MenuPanel {
  const { root, body } = panel('Maps', back)
  const lists = el('div', 'map-lists')
  const browser = el('ul')
  browser.id = 'maps'
  lists.appendChild(browser)
  body.appendChild(lists)
  let refresh: (() => void) | null = null
  // adds the Favourites list after the browser
  void setupMapBrowser(browser, currentId).then((r) => { refresh = r })
  // the lists could not scroll to the current map while hidden
  const showCurrent = () => { for (const list of lists.querySelectorAll('ul')) scrollToCurrent(list) }
  return {
    root,
    onShow: () => {
      refresh?.() // a run since the panel was built may have set a best score
      requestAnimationFrame(showCurrent)
    },
  }
}
