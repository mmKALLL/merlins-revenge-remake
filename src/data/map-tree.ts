// Map ids are paths under assets/maps without .txt ("works/sam", "tvsDemo"). The map browser shows
// them one folder at a time; folders are paths too ("" is the root, "works", "a/b").

export interface MapEntry {
  id: string
  mapSize: { x: number; y: number } // in rooms
}

export interface MapFolder {
  path: string
  folders: MapFolder[] // sorted case-insensitively by name
  maps: MapEntry[] // sorted case-insensitively by name
}

export type FolderItem =
  | { kind: 'parent'; path: string }
  | { kind: 'folder'; path: string; name: string }
  | { kind: 'map'; entry: MapEntry; name: string }

const ROOT = ''

/** Last path segment: "works/sam" -> "sam", "works" -> "works". */
export const baseName = (path: string): string => path.slice(path.lastIndexOf('/') + 1)

/** Folder holding a map: "works/sam" -> "works", "tvsDemo" -> "". */
export const folderOf = (id: string): string => (id.includes('/') ? id.slice(0, id.lastIndexOf('/')) : ROOT)

/** Folder above a folder, or null at the root. */
export const parentFolder = (path: string): string | null => (path === ROOT ? null : folderOf(path))

const byName = (a: string, b: string): number => {
  const la = baseName(a).toLowerCase()
  const lb = baseName(b).toLowerCase()
  return la < lb ? -1 : la > lb ? 1 : a < b ? -1 : a > b ? 1 : 0
}

/** Builds the folder tree from a flat list of map entries. */
export function buildMapTree(entries: readonly MapEntry[]): MapFolder {
  const root: MapFolder = { path: ROOT, folders: [], maps: [] }
  const folders = new Map<string, MapFolder>([[ROOT, root]])
  const folder = (path: string): MapFolder => {
    let f = folders.get(path)
    if (!f) {
      f = { path, folders: [], maps: [] }
      folders.set(path, f)
      folder(folderOf(path)).folders.push(f)
    }
    return f
  }
  for (const e of entries) folder(folderOf(e.id)).maps.push(e)
  for (const f of folders.values()) {
    f.folders.sort((a, b) => byName(a.path, b.path))
    f.maps.sort((a, b) => byName(a.id, b.id))
  }
  return root
}

/** Finds a folder by path, or undefined when the tree has none. */
export function findFolder(root: MapFolder, path: string): MapFolder | undefined {
  if (path === ROOT) return root
  const parent = findFolder(root, folderOf(path))
  return parent?.folders.find((f) => f.path === path)
}

/** What the browser lists for a folder: the way up (except at the root), its subfolders, then its maps. */
export function listFolder(folder: MapFolder): FolderItem[] {
  const up = parentFolder(folder.path)
  return [
    ...(up === null ? [] : [{ kind: 'parent' as const, path: up }]),
    ...folder.folders.map((f) => ({ kind: 'folder' as const, path: f.path, name: baseName(f.path) })),
    ...folder.maps.map((entry) => ({ kind: 'map' as const, entry, name: baseName(entry.id) })),
  ]
}
