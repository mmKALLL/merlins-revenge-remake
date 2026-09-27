// The map browser next to the zoom buttons: one folder of converted maps at a time. Folders open in
// place; a map reloads the page with ?map=<id>, keeping the other query parameters.
import { loadMapIndex } from './data/loaders'
import { buildMapTree, findFolder, folderOf, listFolder, type FolderItem, type MapFolder } from './data/map-tree'

/** Keys a focused entry acts on; they must not reach the game's window listeners too. */
const ACTIVATE_KEYS = new Set(['Enter', 'Space'])

const mapUrl = (id: string): string => {
  const q = new URLSearchParams(location.search)
  q.set('map', id)
  return `?${q.toString()}${location.hash}`
}

const label = (item: FolderItem): string =>
  item.kind === 'parent' ? '(go back)'
    : item.kind === 'folder' ? `${item.name}/`
      : `${item.name} (${item.entry.mapSize.x}x${item.entry.mapSize.y})`

export async function setupMapBrowser(list: HTMLElement, currentId: string): Promise<void> {
  let root: MapFolder
  try {
    root = buildMapTree(await loadMapIndex())
  } catch (e) {
    console.warn('map list unavailable:', e)
    list.hidden = true
    return
  }
  for (const type of ['keydown', 'keyup'] as const) {
    list.addEventListener(type, (e) => {
      if (ACTIVATE_KEYS.has(e.code)) e.stopPropagation()
    })
  }

  /** Shows a folder; `focusFirst` keeps keyboard users inside the list after it is rebuilt. */
  const show = (folder: MapFolder, focusFirst: boolean): void => {
    const items = listFolder(folder).map((item) => {
      const b = document.createElement('button')
      b.type = 'button'
      b.textContent = label(item)
      if (item.kind === 'map') {
        b.title = item.entry.id
        b.addEventListener('click', () => location.assign(mapUrl(item.entry.id)))
        if (item.entry.id === currentId) b.setAttribute('aria-current', 'page')
      } else {
        const target = findFolder(root, item.path) ?? root
        // a click from the keyboard has detail 0
        b.addEventListener('click', (e) => show(target, e.detail === 0))
      }
      const li = document.createElement('li')
      li.appendChild(b)
      return li
    })
    list.replaceChildren(...items)
    list.setAttribute('aria-label', `Maps in ${folder.path === '' ? 'the top folder' : `${folder.path}/`}`)
    if (focusFirst) list.querySelector('button')?.focus()
    // scroll the list (not the page) so the current map shows; #maps is position: relative
    const current = list.querySelector<HTMLElement>('[aria-current]')?.parentElement
    list.scrollTop = current ? current.offsetTop - (list.clientHeight - current.offsetHeight) / 2 : 0
  }
  show(findFolder(root, folderOf(currentId)) ?? root, false)
}
