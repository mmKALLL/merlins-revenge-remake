// The Maps menu's browser: one folder of the map list at a time. Folders open in place; a map
// reloads the page with ?map=<id> (which starts it), keeping the other query parameters but the seed. Each map row
// has a star that marks it as a favourite; the Favourites list beside the browser loads them the same way.
// A map's best score (remake scoring) in the world mode of the player's camera shows at the end of its row.
import { loadBestScores, type ScoreTable } from '../data/best-scores'
import { loadMapList } from '../data/map-list'
import { browserStore, favouriteEntries, loadFavourites, saveFavourites, toggleFavourite } from '../data/favourites'
import { buildMapTree, findFolder, folderOf, listFolder, type FolderItem, type MapEntry, type MapFolder } from '../data/map-tree'
import type { WorldMode } from '../sim/state'

/** Keys a focused entry acts on; they must not reach the game's window listeners too. */
const ACTIVATE_KEYS = new Set(['Enter', 'Space'])
const FAVOURITES_ID = 'favourites'
const STAR_ON = '★'
const STAR_OFF = '☆'

/** The page URL that starts a map: the other query parameters stay, except the seed (a random floor gets a fresh one). */
export const mapUrl = (id: string): string => {
  const q = new URLSearchParams(location.search)
  q.set('map', id)
  q.delete('seed')
  return `?${q.toString()}${location.hash}`
}

const sizeLabel = (entry: MapEntry): string => `(${entry.mapSize.x}x${entry.mapSize.y})`

const label = (item: FolderItem): string =>
  item.kind === 'parent' ? '(go back)'
    : item.kind === 'folder' ? `${item.name}/`
      : `${item.name} ${sizeLabel(item.entry)}`

const button = (text: string): HTMLButtonElement => {
  const b = document.createElement('button')
  b.type = 'button'
  b.textContent = text
  return b
}

const row = (...children: HTMLElement[]): HTMLLIElement => {
  const li = document.createElement('li')
  li.append(...children)
  return li
}

/** Keeps folder names aligned with map names, which start after the star column. */
const starSpacer = (): HTMLSpanElement => {
  const s = document.createElement('span')
  s.className = 'star'
  s.setAttribute('aria-hidden', 'true')
  return s
}

/** The best score at the end of a map's row, if the map has one. */
function bestScore(best: number | undefined): HTMLSpanElement[] {
  if (best === undefined) return []
  const s = document.createElement('span')
  s.className = 'best'
  s.textContent = String(best)
  s.title = 'Best score'
  return [s]
}

/** A button that loads a map, marked when it is the map being played. */
const mapButton = (text: string, id: string, currentId: string, bests: ScoreTable): HTMLButtonElement => {
  const b = button(text)
  b.append(...bestScore(bests[id]))
  b.title = id
  b.addEventListener('click', () => location.assign(mapUrl(id)))
  if (id === currentId) b.setAttribute('aria-current', 'page')
  return b
}

const keepActivateKeys = (el: HTMLElement): void => {
  for (const type of ['keydown', 'keyup'] as const) {
    el.addEventListener(type, (e) => {
      if (ACTIVATE_KEYS.has(e.code)) e.stopPropagation()
    })
  }
}

/** Scrolls a list (not the page) so its current map shows; the lists are position: relative. */
export const scrollToCurrent = (list: HTMLElement): void => {
  const current = list.querySelector<HTMLElement>('[aria-current]')?.parentElement
  list.scrollTop = current ? current.offsetTop - (list.clientHeight - current.offsetHeight) / 2 : 0
}

/** The Favourites list placed right after the browser; reused when the browser is set up again. */
function favouritesList(browser: HTMLElement): HTMLElement {
  const list = document.getElementById(FAVOURITES_ID) ?? document.createElement('ul')
  list.id = FAVOURITES_ID
  list.setAttribute('aria-label', 'Favourite maps')
  list.title = 'Favourite maps'
  browser.after(list)
  return list
}

/**
 * Fills the browser and the Favourites list; resolves to a function that redraws them with the
 * stored best scores of the world mode `scoreMode` gives then (null when the map list is unavailable).
 */
export async function setupMapBrowser(list: HTMLElement, currentId: string, scoreMode: () => WorldMode): Promise<(() => void) | null> {
  let index: MapEntry[]
  try {
    index = await loadMapList()
  } catch (e) {
    console.warn('map list unavailable:', e)
    list.hidden = true
    return null
  }
  const root = buildMapTree(index)
  const favList = favouritesList(list)
  keepActivateKeys(list)
  keepActivateKeys(favList)
  let favourites = loadFavourites(browserStore)
  let bests = loadBestScores(browserStore)[scoreMode()]

  const showFavourites = (): void => {
    const entries = favouriteEntries(favourites, index)
    if (entries.length === 0) {
      const empty = row()
      empty.className = 'empty'
      empty.textContent = 'No favourites yet'
      favList.replaceChildren(empty)
    } else {
      favList.replaceChildren(...entries.map((e) => row(mapButton(`${e.id} ${sizeLabel(e)}`, e.id, currentId, bests))))
    }
    scrollToCurrent(favList)
  }

  const starButton = (id: string): HTMLButtonElement => {
    const b = button('')
    b.className = 'star'
    const paint = (): void => {
      const on = favourites.includes(id)
      b.textContent = on ? STAR_ON : STAR_OFF
      b.setAttribute('aria-pressed', String(on))
    }
    b.setAttribute('aria-label', `Favourite ${id}`)
    b.title = 'Favourite'
    b.addEventListener('click', () => {
      favourites = toggleFavourite(favourites, id)
      saveFavourites(browserStore, favourites)
      paint()
      showFavourites()
    })
    paint()
    return b
  }

  /** Shows a folder; `focusFirst` keeps keyboard users inside the list after it is rebuilt. */
  let shown = findFolder(root, folderOf(currentId)) ?? root
  const show = (folder: MapFolder, focusFirst: boolean): void => {
    shown = folder
    const items = listFolder(folder).map((item) => {
      if (item.kind === 'map') return row(starButton(item.entry.id), mapButton(label(item), item.entry.id, currentId, bests))
      const b = button(label(item))
      const target = findFolder(root, item.path) ?? root
      // a click from the keyboard has detail 0
      b.addEventListener('click', (e) => show(target, e.detail === 0))
      return row(starSpacer(), b)
    })
    list.replaceChildren(...items)
    list.setAttribute('aria-label', `Maps in ${folder.path === '' ? 'the top folder' : `${folder.path}/`}`)
    if (focusFirst) list.querySelector('button')?.focus()
    scrollToCurrent(list)
  }
  show(shown, false)
  showFavourites()
  return () => {
    bests = loadBestScores(browserStore)[scoreMode()]
    show(shown, false)
    showFavourites()
  }
}
