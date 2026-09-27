import { describe, expect, it } from 'vitest'
import { buildMapTree, findFolder, folderOf, listFolder, parentFolder, type MapEntry } from './map-tree'

const size = { x: 1, y: 1 }
const entries: MapEntry[] = ['works/sam', 'tvsDemo', 'works/Beta', 'combat_test', 'new/deep/x', 'Works2/a', 'works/alpha'].map(
  (id) => ({ id, mapSize: size }),
)
const labels = (path: string) =>
  listFolder(findFolder(buildMapTree(entries), path)!).map((i) =>
    i.kind === 'parent' ? `..${i.path}` : i.kind === 'folder' ? `${i.name}/` : i.name,
  )

describe('map tree', () => {
  it('lists folders before maps at the root, sorted case-insensitively, with no way up', () => {
    expect(labels('')).toEqual(['new/', 'works/', 'Works2/', 'combat_test', 'tvsDemo'])
  })

  it('lists a subfolder with the way up first', () => {
    expect(labels('works')).toEqual(['..', 'alpha', 'Beta', 'sam'])
    expect(labels('new')).toEqual(['..', 'deep/'])
    expect(labels('new/deep')).toEqual(['..new', 'x'])
  })

  it('finds parents and a map\'s folder', () => {
    expect(folderOf('works/sam')).toBe('works')
    expect(folderOf('tvsDemo')).toBe('')
    expect(parentFolder('new/deep')).toBe('new')
    expect(parentFolder('new')).toBe('')
    expect(parentFolder('')).toBeNull()
    expect(findFolder(buildMapTree(entries), 'missing')).toBeUndefined()
  })
})
