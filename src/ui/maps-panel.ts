// Maps: the folder browser and the Favourites list (map-browser.ts). Picking a map reloads the page
// with ?map=<id>, which starts that map.
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
  void setupMapBrowser(browser, currentId) // adds the Favourites list after the browser
  // the lists could not scroll to the current map while hidden
  const showCurrent = () => { for (const list of lists.querySelectorAll('ul')) scrollToCurrent(list) }
  return { root, onShow: () => requestAnimationFrame(showCurrent) }
}
