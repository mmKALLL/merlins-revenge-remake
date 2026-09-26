# Walk-and-rooms Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** A browser prototype that loads an original Merlin Open map, renders its tile layers, and lets the player walk Merlin between rooms with the original movement and collision rules.

**Architecture:** Fixed 30 Hz simulation over world pixel coordinates (the whole map is one tile grid; rooms are an 18x9 partition). Rules ported from Lingo live as pure functions in `src/mr-open`, one file per Lingo object. A PixiJS renderer with a camera, integer zoom and tick interpolation sits on top. Node tools copy originals into `assets/` and convert them into `public/generated/`.

**Tech Stack:** pnpm, Vite 8, TypeScript (strict), PixiJS 8, Vitest 5, tsx for tools, pngjs for PNG output.

**Reference documents (read before starting):**
- `docs/plans/2026-09-26-walk-and-rooms-design.md` (the approved design)
- `docs/notes/engine-mechanics-walking-and-rooms.md` (engine behaviour with Lingo line references)

**Conventions:**
- Nothing under `src/` or `tools/convert-assets.ts` may read `assets-mr-original/`. Only `tools/copy-assets.ts` touches the archive.
- Files in `src/mr-open/` start with a comment naming the Lingo source file(s) they port.
- Coordinates: world pixels, origin at the top-left of room (1,1). Tile and room indices are 1-based to match the original data; array indices are converted at the boundary.
- Commit after every task with a short imperative message ending in `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Assumption to verify later: original 16x16 frames are drawn at `spriteScale = 2` so Merlin is one tile tall and the collision rect becomes `(-15,-15,15,15)`. Keep it a config value.

---

### Task 1: Scaffold the project

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.ts`, `src/smoke.test.ts`

**Step 1: Initialise the package**

Run from the repo root:
```bash
pnpm init
pnpm add pixi.js@8
pnpm add -D typescript vite vitest tsx pngjs @types/pngjs @types/node
```

**Step 2: Write `package.json` scripts** (merge into the generated file)

```json
{
  "name": "merlins-revenge-remake",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "assets:copy": "tsx tools/copy-assets.ts",
    "assets:convert": "tsx tools/convert-assets.ts"
  }
}
```

**Step 3: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "skipLibCheck": true,
    "types": ["node", "vite/client"],
    "isolatedModules": true,
    "noEmit": true
  },
  "include": ["src", "tools", "vite.config.ts"]
}
```

**Step 4: Write `vite.config.ts`**

```ts
import { defineConfig } from 'vite'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'tools/**/*.test.ts'],
  },
})
```

Note: Vitest reads the `test` key from the Vite config. If TypeScript complains about `test`, add `/// <reference types="vitest/config" />` at the top of the file.

**Step 5: Write `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Merlin's Revenge Remake</title>
    <style>
      html, body { margin: 0; background: #000; height: 100%; overflow: hidden; }
      canvas { display: block; image-rendering: pixelated; }
    </style>
  </head>
  <body>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

**Step 6: Write `src/main.ts`** (placeholder until Task 13)

```ts
console.log('Merlin\'s Revenge remake: bootstrapping')
```

**Step 7: Write the smoke test `src/smoke.test.ts`**

```ts
import { describe, expect, it } from 'vitest'

describe('toolchain', () => {
  it('runs tests', () => {
    expect(1 + 1).toBe(2)
  })
})
```

**Step 8: Verify**

Run: `pnpm test`
Expected: `1 passed`

Run: `pnpm build`
Expected: `vite build` completes, `dist/` created.

**Step 9: Commit**

```bash
git add package.json pnpm-lock.yaml tsconfig.json vite.config.ts index.html src
git commit -m "Scaffold Vite, TypeScript, Vitest and PixiJS project"
```

---

### Task 2: Copy the needed originals into `assets/`

**Files:**
- Create: `tools/copy-assets.ts`, `assets/README.md`
- Result: files under `assets/maps`, `assets/tile-keys`, `assets/sprites/merlin`, `assets/keybindings`

**Step 1: Write `tools/copy-assets.ts`**

This is the only file allowed to reference the archive. Each entry says which feature needs it.

```ts
// Copies the original files this project uses from the (git-ignored) archive
// into ./assets with a sensible structure. Run: pnpm assets:copy
import { cpSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const ARCHIVE = 'assets-mr-original/merlin_open_30_speedy_and _tvs'
const CASTS = join(ARCHIVE, 'casts', 'data')

type Copy = { from: string; to: string; why: string }

const copies: Copy[] = [
  // walk-and-rooms slice: maps
  { from: join(ARCHIVE, 'map_to_play', 'tvsDemo.txt'), to: 'assets/maps/tvsDemo.txt', why: 'default map' },
  { from: join(ARCHIVE, 'maps', 'works', 'sam.txt'), to: 'assets/maps/sam.txt', why: '3x3 test map' },
  { from: join(ARCHIVE, 'maps', 'works', 'mr4Demo.txt'), to: 'assets/maps/mr4Demo.txt', why: '15x15 demo map' },
  // tile keys (collision symbols per tile index)
  { from: join(CASTS, 'tlk_merlinOpenPassive_key.txt'), to: 'assets/tile-keys/merlinOpenPassive.txt', why: 'passive layer key' },
  { from: join(CASTS, 'tlk_merlinOpenActive_key.txt'), to: 'assets/tile-keys/merlinOpenActive.txt', why: 'active layer key' },
  { from: join(CASTS, 'tlk_merlinOpenObjects_key.txt'), to: 'assets/tile-keys/merlinOpenObjects.txt', why: 'objects layer key' },
  // key bindings
  { from: join(CASTS, 'bnd_wasd.txt'), to: 'assets/keybindings/wasd.txt', why: 'default bindings' },
  { from: join(CASTS, 'bnd_arrow.txt'), to: 'assets/keybindings/arrow.txt', why: 'arrow bindings' },
]

// every Merlin animation frame
for (const name of readdirSync(join(ARCHIVE, 'gfx', 'merlin'))) {
  if (name.startsWith('anm_mer_') && name.endsWith('.bmp')) {
    copies.push({ from: join(ARCHIVE, 'gfx', 'merlin', name), to: join('assets/sprites/merlin', name), why: 'merlin frames' })
  }
}

for (const c of copies) {
  mkdirSync(join(c.to, '..'), { recursive: true })
  cpSync(c.from, c.to)
  console.log(`${c.to}  <- ${c.why}`)
}
```

**Step 2: Write `assets/README.md`**

```markdown
# assets

Original Merlin Open files, copied and reorganized by `tools/copy-assets.ts`.
Do not edit by hand. The archive they come from is not in this repository.

- `maps/` Lingo property-list map files
- `tile-keys/` per-tile collision symbols, 10 tiles per row, 32x32 px
- `sprites/merlin/` 8-bit BMP frames, named `anm_<chr>_<anim>_<delayTicks>_<frame>.bmp`, white is transparent
- `keybindings/` original key code bindings (Mac virtual key codes)
```

**Step 3: Run and verify**

Run: `pnpm assets:copy`
Expected: 8 non-sprite lines plus 32 `merlin frames` lines.

Run: `ls assets/sprites/merlin | wc -l`
Expected: `32`

**Step 4: Commit**

```bash
git add tools/copy-assets.ts assets
git commit -m "Copy maps, tile keys, key bindings and Merlin frames into assets"
```

---

### Task 3: Lingo property-list parser

Maps and bindings are Lingo literals: `[#key: value, ...]` property lists, `[a, b]` linear lists, `point(x, y)`, `rgb(r,g,b)`, `#symbol`, numbers, strings, and `[:]` for an empty property list. Port of what `XMLmaster.interpretXML` relies on (`value()`).

**Files:**
- Create: `src/mr-open/mr-lingo-plist.ts`, `src/mr-open/mr-lingo-plist.test.ts`

**Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest'
import { parseLingo } from './mr-lingo-plist'

describe('parseLingo', () => {
  it('parses numbers, strings and symbols', () => {
    expect(parseLingo('42')).toBe(42)
    expect(parseLingo('0.0625')).toBeCloseTo(0.0625)
    expect(parseLingo('"hi"')).toBe('hi')
    expect(parseLingo('#none')).toEqual({ sym: 'none' })
  })

  it('parses linear lists', () => {
    expect(parseLingo('[1, 2, [3, 4]]')).toEqual([1, 2, [3, 4]])
    expect(parseLingo('[]')).toEqual([])
  })

  it('parses property lists into plain objects', () => {
    expect(parseLingo('[#a: 1, #b: "x"]')).toEqual({ a: 1, b: 'x' })
    expect(parseLingo('[:]')).toEqual({})
  })

  it('parses point() and rgb()', () => {
    expect(parseLingo('point(18, 9)')).toEqual({ x: 18, y: 9 })
    expect(parseLingo('rgb(0,255,0)')).toEqual({ r: 0, g: 255, b: 0 })
  })

  it('ignores whitespace and newlines', () => {
    expect(parseLingo('[\n#up:13,\n#down: 1\n]')).toEqual({ up: 13, down: 1 })
  })

  it('reports the offset of a syntax error', () => {
    expect(() => parseLingo('[#a: ]')).toThrow(/offset 5/)
  })
})
```

**Step 2: Run to verify failure**

Run: `pnpm vitest run src/mr-open/mr-lingo-plist.test.ts`
Expected: FAIL, cannot find module `./mr-lingo-plist`.

**Step 3: Implement `src/mr-open/mr-lingo-plist.ts`**

```ts
// Port of the subset of Lingo literal syntax that value()/XMLmaster.interpretXML
// accepts in the map, key and binding text files.
export type LingoSymbol = { sym: string }
export type LingoPoint = { x: number; y: number }
export type LingoRgb = { r: number; g: number; b: number }
export type LingoValue =
  | number
  | string
  | LingoSymbol
  | LingoPoint
  | LingoRgb
  | LingoValue[]
  | { [key: string]: LingoValue }

export function isSymbol(v: LingoValue, name?: string): v is LingoSymbol {
  return typeof v === 'object' && v !== null && 'sym' in v && (name === undefined || v.sym === name)
}

export function parseLingo(text: string): LingoValue {
  const p = new Parser(text)
  const v = p.value()
  p.skipWs()
  if (!p.atEnd()) p.fail('trailing characters')
  return v
}

class Parser {
  private i = 0
  constructor(private readonly s: string) {}

  atEnd(): boolean { return this.i >= this.s.length }

  fail(msg: string): never {
    throw new Error(`Lingo parse error at offset ${this.i}: ${msg}`)
  }

  skipWs(): void {
    while (!this.atEnd() && /\s/.test(this.s[this.i]!)) this.i++
  }

  private peek(): string { return this.s[this.i] ?? '' }

  private expect(ch: string): void {
    if (this.peek() !== ch) this.fail(`expected '${ch}'`)
    this.i++
  }

  value(): LingoValue {
    this.skipWs()
    const c = this.peek()
    if (c === '[') return this.list()
    if (c === '"') return this.string()
    if (c === '#') return this.symbol()
    if (/[-0-9.]/.test(c)) return this.number()
    if (/[A-Za-z]/.test(c)) return this.call()
    this.fail('unexpected character')
  }

  private list(): LingoValue {
    this.expect('[')
    this.skipWs()
    if (this.peek() === ':') { this.i++; this.skipWs(); this.expect(']'); return {} }
    if (this.peek() === ']') { this.i++; return [] }
    // property list if first element is #sym followed by ':'
    const save = this.i
    if (this.peek() === '#') {
      this.symbol()
      this.skipWs()
      const isProp = this.peek() === ':'
      this.i = save
      if (isProp) return this.propList()
    }
    const items: LingoValue[] = []
    for (;;) {
      items.push(this.value())
      this.skipWs()
      if (this.peek() === ',') { this.i++; continue }
      this.expect(']')
      return items
    }
  }

  private propList(): { [key: string]: LingoValue } {
    const out: { [key: string]: LingoValue } = {}
    for (;;) {
      this.skipWs()
      const key = this.symbol().sym
      this.skipWs()
      this.expect(':')
      out[key] = this.value()
      this.skipWs()
      if (this.peek() === ',') { this.i++; continue }
      this.expect(']')
      return out
    }
  }

  private string(): string {
    this.expect('"')
    const start = this.i
    while (!this.atEnd() && this.peek() !== '"') this.i++
    if (this.atEnd()) this.fail('unterminated string')
    const v = this.s.slice(start, this.i)
    this.i++
    return v
  }

  private symbol(): LingoSymbol {
    this.expect('#')
    const start = this.i
    while (/[A-Za-z0-9_]/.test(this.peek())) this.i++
    if (start === this.i) this.fail('empty symbol')
    return { sym: this.s.slice(start, this.i) }
  }

  private number(): number {
    const start = this.i
    if (this.peek() === '-') this.i++
    while (/[0-9.]/.test(this.peek())) this.i++
    const v = Number(this.s.slice(start, this.i))
    if (Number.isNaN(v)) this.fail('bad number')
    return v
  }

  private call(): LingoValue {
    const start = this.i
    while (/[A-Za-z]/.test(this.peek())) this.i++
    const name = this.s.slice(start, this.i)
    this.skipWs()
    this.expect('(')
    const args: number[] = []
    for (;;) {
      this.skipWs()
      args.push(this.number())
      this.skipWs()
      if (this.peek() === ',') { this.i++; continue }
      this.expect(')')
      break
    }
    if (name === 'point' && args.length === 2) return { x: args[0]!, y: args[1]! }
    if (name === 'rgb' && args.length === 3) return { r: args[0]!, g: args[1]!, b: args[2]! }
    this.fail(`unknown call ${name}`)
  }
}
```

**Step 4: Run tests**

Run: `pnpm vitest run src/mr-open/mr-lingo-plist.test.ts`
Expected: 6 passed.

**Step 5: Commit**

```bash
git add src/mr-open/mr-lingo-plist.ts src/mr-open/mr-lingo-plist.test.ts
git commit -m "Add Lingo property-list parser"
```

---

### Task 4: Map format

Port of the data layout in `objMap`, `objDataMap`, `objRoom`, `objTileLayer`. See notes section 1.

**Files:**
- Create: `src/mr-open/mr-map-format.ts`, `src/mr-open/mr-map-format.test.ts`

**Step 1: Write the failing tests**

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseMapFile, roomNumToXY, roomXYToNum } from './mr-map-format'

const tvsDemo = readFileSync('assets/maps/tvsDemo.txt', 'utf8')
const sam = readFileSync('assets/maps/sam.txt', 'utf8')

describe('roomNumToXY', () => {
  it('maps 1-based room numbers row-major', () => {
    expect(roomNumToXY(1, { x: 4, y: 1 })).toEqual({ x: 1, y: 1 })
    expect(roomNumToXY(4, { x: 4, y: 1 })).toEqual({ x: 4, y: 1 })
    expect(roomNumToXY(5, { x: 3, y: 3 })).toEqual({ x: 2, y: 2 })
    expect(roomXYToNum({ x: 2, y: 2 }, { x: 3, y: 3 })).toBe(5)
  })
})

describe('parseMapFile', () => {
  it('reads the header of tvsDemo', () => {
    const m = parseMapFile(tvsDemo)
    expect(m.mapSize).toEqual({ x: 4, y: 1 })
    expect(m.roomSize).toEqual({ x: 18, y: 9 })
    expect(m.startRoom).toEqual({ x: 1, y: 1 })
    expect(m.layers.map((l) => l.name)).toEqual(['backgroundPassive', 'backgroundActive', 'objects'])
    expect(m.layers[1]!.tileSet).toBe('merlinOpenActive')
  })

  it('reads rooms as row-major 1-based grids', () => {
    const m = parseMapFile(tvsDemo)
    expect(m.rooms).toHaveLength(4)
    const r1 = m.rooms[0]!
    expect(r1.num).toBe(1)
    const active = r1.layers['backgroundActive']!
    expect(active).toHaveLength(9)
    expect(active[0]).toHaveLength(18)
    // row 2, col 3 of the active layer is tile 2 (see tvsDemo.txt)
    expect(active[1]![2]).toBe(2)
  })

  it('reads a 3x3 map', () => {
    const m = parseMapFile(sam)
    expect(m.mapSize).toEqual({ x: 3, y: 3 })
    expect(m.rooms.map((r) => r.num)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
  })

  it('rejects a room whose layer has the wrong size', () => {
    const bad = '[#map: [#mapSize: point(1,1), #roomSize: point(2,1), #startRoom: point(1,1), #layerDefinitions: [[#name: #backgroundActive, #tileSet: #t, #displayScale: 1]], #rooms: [[#num: 1, #layers: [[#name: #backgroundActive, #map: [[1, 2, 3]]]]]]]]'
    expect(() => parseMapFile(bad)).toThrow(/room 1.*backgroundActive/)
  })
})
```

**Step 2: Run to verify failure**

Run: `pnpm vitest run src/mr-open/mr-map-format.test.ts`
Expected: FAIL, cannot find module.

**Step 3: Implement `src/mr-open/mr-map-format.ts`**

```ts
// Port of the map definition layout used by objMap / objDataMap / objRoom /
// objTileLayer (see docs/notes/engine-mechanics-walking-and-rooms.md §1).
import { isSymbol, parseLingo, type LingoValue } from './mr-lingo-plist'

export type Vec = { x: number; y: number }

export type LayerName = 'backgroundPassive' | 'backgroundActive' | 'objects'

export interface LayerDefinition {
  name: LayerName
  tileSet: string
}

/** rows[rowIndex][colIndex], 0-based arrays holding 1-based tile indices; 0 = empty */
export type TileGrid = number[][]

export interface RoomDefinition {
  num: number
  layers: Partial<Record<LayerName, TileGrid>>
}

export interface MapDefinition {
  mapSize: Vec
  roomSize: Vec
  startRoom: Vec
  layers: LayerDefinition[]
  rooms: RoomDefinition[]
}

export function roomNumToXY(num: number, mapSize: Vec): Vec {
  return { x: ((num - 1) % mapSize.x) + 1, y: Math.floor((num - 1) / mapSize.x) + 1 }
}

export function roomXYToNum(xy: Vec, mapSize: Vec): number {
  return (xy.y - 1) * mapSize.x + xy.x
}

export function parseMapFile(text: string): MapDefinition {
  const root = parseLingo(text)
  const map = prop(root, 'map')
  const mapSize = point(prop(map, 'mapSize'))
  const roomSize = point(prop(map, 'roomSize'))
  const startRoom = point(prop(map, 'startRoom'))
  const layers = list(prop(map, 'layerDefinitions')).map((l) => ({
    name: sym(prop(l, 'name')) as LayerName,
    tileSet: sym(prop(l, 'tileSet')),
  }))
  const rooms = list(prop(map, 'rooms')).map((r) => {
    const num = num_(prop(r, 'num'))
    const out: RoomDefinition = { num, layers: {} }
    for (const l of list(prop(r, 'layers'))) {
      const name = sym(prop(l, 'name')) as LayerName
      const grid = list(prop(l, 'map')).map((row) => list(row).map(num_))
      if (grid.length !== roomSize.y || grid.some((row) => row.length !== roomSize.x)) {
        throw new Error(`room ${num} layer ${name}: expected ${roomSize.x}x${roomSize.y} tiles`)
      }
      out.layers[name] = grid
    }
    return out
  })
  rooms.forEach((r, i) => {
    if (r.num !== i + 1) throw new Error(`rooms must be in order; found num ${r.num} at position ${i + 1}`)
  })
  return { mapSize, roomSize, startRoom, layers, rooms }
}

function prop(v: LingoValue, key: string): LingoValue {
  if (typeof v !== 'object' || v === null || Array.isArray(v) || !(key in v)) throw new Error(`missing #${key}`)
  return (v as { [k: string]: LingoValue })[key]!
}
function list(v: LingoValue): LingoValue[] {
  if (!Array.isArray(v)) throw new Error('expected list')
  return v
}
function num_(v: LingoValue): number {
  if (typeof v !== 'number') throw new Error('expected number')
  return v
}
function sym(v: LingoValue): string {
  if (!isSymbol(v)) throw new Error('expected symbol')
  return v.sym
}
function point(v: LingoValue): Vec {
  if (typeof v !== 'object' || v === null || !('x' in v)) throw new Error('expected point')
  return { x: (v as Vec).x, y: (v as Vec).y }
}
```

**Step 4: Run tests**

Run: `pnpm vitest run src/mr-open/mr-map-format.test.ts`
Expected: 5 passed. If `active[1][2]` is not 2, open `assets/maps/tvsDemo.txt`, find the `backgroundActive` map of room 1, and correct the expected value from the second row, third column. Do not change the parser to fit.

**Step 5: Commit**

```bash
git add src/mr-open/mr-map-format.ts src/mr-open/mr-map-format.test.ts
git commit -m "Add map definition parser"
```

---

### Task 5: Tile key parser

Port of `objTileSetKey` (notes §2). Format: line 1 is the field header, line 2 `tileSize | point(32,32)`, then one symbol per line; `--` comment lines consume no slot; blank lines yield an empty slot (VOID, treated as `none`).

**Files:**
- Create: `src/mr-open/mr-tile-key.ts`, `src/mr-open/mr-tile-key.test.ts`

**Step 1: Write the failing tests**

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseTileKey } from './mr-tile-key'

describe('parseTileKey', () => {
  it('parses tile size and one symbol per line, skipping comments', () => {
    const k = parseTileKey('[#name: "x", #type: #field]\ntileSize | point(32,32)\n-- c\n#none\n#solid\n\n#solid\n')
    expect(k.tileSize).toEqual({ x: 32, y: 32 })
    expect(k.symbols).toEqual(['none', 'solid', 'none', 'solid'])
  })

  it('reads the real active key', () => {
    const k = parseTileKey(readFileSync('assets/tile-keys/merlinOpenActive.txt', 'utf8'))
    expect(k.tileSize).toEqual({ x: 32, y: 32 })
    expect(k.symbols[0]).toBe('none')
    expect(k.symbols[1]).toBe('solid')
    expect(k.symbols.length).toBeGreaterThan(200)
  })

  it('exposes solidity by 1-based tile index', () => {
    const k = parseTileKey('[#name: "x", #type: #field]\ntileSize | point(32,32)\n#none\n#solid\n')
    expect(k.isSolid(0)).toBe(false) // empty tile
    expect(k.isSolid(1)).toBe(false)
    expect(k.isSolid(2)).toBe(true)
    expect(k.isSolid(99)).toBe(false) // beyond key
  })
})
```

**Step 2: Run to verify failure**

Run: `pnpm vitest run src/mr-open/mr-tile-key.test.ts`
Expected: FAIL, cannot find module.

**Step 3: Implement `src/mr-open/mr-tile-key.ts`**

```ts
// Port of objTileSetKey: maps a 1-based tile index to its key symbol.
import { parseLingo } from './mr-lingo-plist'
import type { Vec } from './mr-map-format'

export interface TileKey {
  tileSize: Vec
  /** symbols[i] is the symbol for tile index i+1 */
  symbols: string[]
  isSolid(tileIndex: number): boolean
}

export function parseTileKey(text: string): TileKey {
  const lines = text.split(/\r?\n/)
  const sizeLine = lines[1] ?? ''
  const m = /^tileSize\s*\|\s*(point\([^)]*\))/.exec(sizeLine)
  if (!m) throw new Error('tile key: missing "tileSize | point(w,h)" on line 2')
  const tileSize = parseLingo(m[1]!) as Vec
  const symbols: string[] = []
  for (const raw of lines.slice(2)) {
    const line = raw.trim()
    if (line.startsWith('--')) continue
    if (line === '') { symbols.push('none'); continue }
    if (!line.startsWith('#')) throw new Error(`tile key: unexpected line "${line}"`)
    symbols.push(line.slice(1).trim())
  }
  // trailing blank lines are not tiles
  while (symbols.length > 0 && symbols[symbols.length - 1] === 'none' && /^\s*$/.test(lines[lines.length - 1] ?? '')) {
    lines.pop()
    symbols.pop()
    if (!/^\s*$/.test(lines[lines.length - 1] ?? '')) break
  }
  return {
    tileSize,
    symbols,
    isSolid(i) { return i >= 1 && symbols[i - 1] === 'solid' },
  }
}
```

**Step 4: Run tests**

Run: `pnpm vitest run src/mr-open/mr-tile-key.test.ts`
Expected: 3 passed. The trailing-blank trimming is fiddly; if test 1 fails on `symbols` length, simplify: strip trailing blank lines from `lines` before the loop with `while (lines.length && lines[lines.length-1].trim()==='') lines.pop()` and delete the post-loop `while`.

**Step 5: Commit**

```bash
git add src/mr-open/mr-tile-key.ts src/mr-open/mr-tile-key.test.ts
git commit -m "Add tile key parser"
```

---

### Task 6: BMP decoder and sprite atlas builder

Frames are 8-bit paletted (some 24-bit) uncompressed Windows BMPs. White `(255,255,255)` is transparent (Director ink 36). Filename: `anm_<chr>_<anim>_<delay>_<frame>.bmp`.

**Files:**
- Create: `tools/bmp.ts`, `tools/bmp.test.ts`, `tools/atlas.ts`, `tools/atlas.test.ts`

**Step 1: Write the failing BMP test `tools/bmp.test.ts`**

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { decodeBmp } from './bmp'

describe('decodeBmp', () => {
  it('decodes an 8-bit Merlin frame to RGBA with white transparent', () => {
    const img = decodeBmp(readFileSync('assets/sprites/merlin/anm_mer_walk_3_01.bmp'))
    expect(img.width).toBe(16)
    expect(img.height).toBe(16)
    expect(img.rgba.length).toBe(16 * 16 * 4)
    // top-left pixel is white in the source, so alpha 0
    expect(img.rgba[3]).toBe(0)
    // at least one opaque pixel exists
    let opaque = 0
    for (let i = 3; i < img.rgba.length; i += 4) if (img.rgba[i] === 255) opaque++
    expect(opaque).toBeGreaterThan(50)
  })
})
```

**Step 2: Run to verify failure**

Run: `pnpm vitest run tools/bmp.test.ts`
Expected: FAIL, cannot find module.

**Step 3: Implement `tools/bmp.ts`**

```ts
// Minimal decoder for uncompressed 8-bit paletted and 24-bit Windows BMPs.
export interface RgbaImage { width: number; height: number; rgba: Uint8Array }

export function decodeBmp(buf: Buffer, transparent: [number, number, number] = [255, 255, 255]): RgbaImage {
  if (buf.toString('ascii', 0, 2) !== 'BM') throw new Error('not a BMP')
  const dataOffset = buf.readUInt32LE(10)
  const headerSize = buf.readUInt32LE(14)
  const width = buf.readInt32LE(18)
  const heightRaw = buf.readInt32LE(22)
  const bpp = buf.readUInt16LE(28)
  const compression = buf.readUInt32LE(30)
  if (compression !== 0) throw new Error(`unsupported BMP compression ${compression}`)
  const height = Math.abs(heightRaw)
  const bottomUp = heightRaw > 0
  const rowBytes = Math.floor((width * bpp + 31) / 32) * 4
  const rgba = new Uint8Array(width * height * 4)

  let palette: number[][] = []
  if (bpp === 8) {
    const colours = buf.readUInt32LE(46) || 256
    const palOff = 14 + headerSize
    for (let i = 0; i < colours; i++) {
      const o = palOff + i * 4
      palette.push([buf[o + 2]!, buf[o + 1]!, buf[o]!]) // stored BGR
    }
  } else if (bpp !== 24) {
    throw new Error(`unsupported BMP bpp ${bpp}`)
  }

  for (let y = 0; y < height; y++) {
    const srcRow = bottomUp ? height - 1 - y : y
    const rowOff = dataOffset + srcRow * rowBytes
    for (let x = 0; x < width; x++) {
      let r: number, g: number, b: number
      if (bpp === 8) {
        const c = palette[buf[rowOff + x]!] ?? [0, 0, 0]
        ;[r, g, b] = [c[0]!, c[1]!, c[2]!]
      } else {
        const o = rowOff + x * 3
        ;[b, g, r] = [buf[o]!, buf[o + 1]!, buf[o + 2]!]
      }
      const a = r === transparent[0] && g === transparent[1] && b === transparent[2] ? 0 : 255
      const d = (y * width + x) * 4
      rgba[d] = r; rgba[d + 1] = g; rgba[d + 2] = b; rgba[d + 3] = a
    }
  }
  return { width, height, rgba }
}
```

**Step 4: Run BMP test**

Run: `pnpm vitest run tools/bmp.test.ts`
Expected: 1 passed.

**Step 5: Write the failing atlas test `tools/atlas.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { buildAtlas, parseFrameName } from './atlas'

describe('parseFrameName', () => {
  it('splits anm_<chr>_<anim>_<delay>_<frame>.bmp', () => {
    expect(parseFrameName('anm_mer_walk_3_01.bmp')).toEqual({ chr: 'mer', anim: 'walk', delay: 3, frame: 1 })
    expect(parseFrameName('anm_mer_naturalMelee_3_07.bmp')).toEqual({ chr: 'mer', anim: 'naturalMelee', delay: 3, frame: 7 })
    expect(parseFrameName('notes.txt')).toBeNull()
  })
})

describe('buildAtlas', () => {
  it('packs frames in a row per animation and records rects', () => {
    const px = (w: number, h: number) => ({ width: w, height: h, rgba: new Uint8Array(w * h * 4).fill(255) })
    const atlas = buildAtlas([
      { name: 'anm_mer_walk_3_02.bmp', image: px(16, 16) },
      { name: 'anm_mer_walk_3_01.bmp', image: px(16, 16) },
      { name: 'anm_mer_grave_3_01.bmp', image: px(20, 16) },
    ])
    expect(Object.keys(atlas.animations).sort()).toEqual(['grave', 'walk'])
    expect(atlas.animations['walk']!.delay).toBe(3)
    expect(atlas.animations['walk']!.frames).toEqual([
      { x: 0, y: 0, w: 16, h: 16 },
      { x: 16, y: 0, w: 16, h: 16 },
    ])
    expect(atlas.animations['grave']!.frames[0]!.y).toBe(16)
    expect(atlas.sheet.width).toBe(32)
    expect(atlas.sheet.height).toBe(32)
  })
})
```

**Step 6: Run to verify failure**

Run: `pnpm vitest run tools/atlas.test.ts`
Expected: FAIL, cannot find module.

**Step 7: Implement `tools/atlas.ts`**

```ts
// Builds one RGBA sheet plus a JSON atlas from named frames.
// Frame naming follows animStripMaster: anm_<chr>_<animName>_<delay>_<frame>.
import type { RgbaImage } from './bmp'

export interface FrameName { chr: string; anim: string; delay: number; frame: number }
export interface AtlasRect { x: number; y: number; w: number; h: number }
export interface AtlasAnimation { delay: number; frames: AtlasRect[] }
export interface Atlas {
  sheet: RgbaImage
  animations: Record<string, AtlasAnimation>
}

export function parseFrameName(name: string): FrameName | null {
  const m = /^anm_([A-Za-z0-9]+)_([A-Za-z0-9]+)_(\d+)_(\d+)\.\w+$/.exec(name)
  if (!m) return null
  return { chr: m[1]!, anim: m[2]!, delay: Number(m[3]), frame: Number(m[4]) }
}

export function buildAtlas(frames: { name: string; image: RgbaImage }[]): Atlas {
  const byAnim = new Map<string, { delay: number; frames: { frame: number; image: RgbaImage }[] }>()
  for (const f of frames) {
    const p = parseFrameName(f.name)
    if (!p) continue
    const entry = byAnim.get(p.anim) ?? { delay: p.delay, frames: [] }
    entry.frames.push({ frame: p.frame, image: f.image })
    byAnim.set(p.anim, entry)
  }
  const anims = [...byAnim.entries()].sort(([a], [b]) => a.localeCompare(b))
  let width = 0
  let height = 0
  const rows: { name: string; delay: number; y: number; images: RgbaImage[] }[] = []
  for (const [name, entry] of anims) {
    entry.frames.sort((a, b) => a.frame - b.frame)
    const images = entry.frames.map((f) => f.image)
    const rowW = images.reduce((s, i) => s + i.width, 0)
    const rowH = Math.max(...images.map((i) => i.height))
    rows.push({ name, delay: entry.delay, y: height, images })
    width = Math.max(width, rowW)
    height += rowH
  }
  const sheet: RgbaImage = { width, height, rgba: new Uint8Array(width * height * 4) }
  const animations: Record<string, AtlasAnimation> = {}
  for (const row of rows) {
    let x = 0
    const rects: AtlasRect[] = []
    for (const img of row.images) {
      blit(sheet, img, x, row.y)
      rects.push({ x, y: row.y, w: img.width, h: img.height })
      x += img.width
    }
    animations[row.name] = { delay: row.delay, frames: rects }
  }
  return { sheet, animations }
}

function blit(dst: RgbaImage, src: RgbaImage, dx: number, dy: number): void {
  for (let y = 0; y < src.height; y++) {
    const s = y * src.width * 4
    const d = ((dy + y) * dst.width + dx) * 4
    dst.rgba.set(src.rgba.subarray(s, s + src.width * 4), d)
  }
}
```

**Step 8: Run atlas tests**

Run: `pnpm vitest run tools/atlas.test.ts`
Expected: 2 passed.

**Step 9: Commit**

```bash
git add tools/bmp.ts tools/bmp.test.ts tools/atlas.ts tools/atlas.test.ts
git commit -m "Add BMP decoder and sprite atlas builder"
```

---

### Task 7: Asset converter and placeholder tileset

Produces `public/generated/` from `assets/`. Real tile sheets are not available yet, so generate a placeholder sheet from each key: 10 tiles per row, 32x32, solid tiles dark grey with a light border, open tiles a colour hashed from the index, index 0 never drawn.

**Files:**
- Create: `tools/convert-assets.ts`, `tools/placeholder-tileset.ts`, `tools/placeholder-tileset.test.ts`
- Modify: `.gitignore` (add `public/generated/`)

**Step 1: Write the failing test `tools/placeholder-tileset.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { buildPlaceholderTileset } from './placeholder-tileset'

describe('buildPlaceholderTileset', () => {
  it('lays out 10 tiles per row, 32 px each', () => {
    const symbols = ['none', 'solid', 'none', 'solid', 'none', 'none', 'none', 'none', 'none', 'none', 'solid', 'none']
    const img = buildPlaceholderTileset(symbols, { x: 32, y: 32 })
    expect(img.width).toBe(320)
    expect(img.height).toBe(64)
    // centre pixel of tile 2 (solid) is dark grey
    const px = (tx: number, ty: number) => {
      const i = ((ty * 32 + 16) * img.width + tx * 32 + 16) * 4
      return [img.rgba[i], img.rgba[i + 1], img.rgba[i + 2], img.rgba[i + 3]]
    }
    expect(px(1, 0)).toEqual([60, 60, 60, 255])
    // an open tile is fully opaque and not dark grey
    expect(px(0, 0)[3]).toBe(255)
    expect(px(0, 0)).not.toEqual([60, 60, 60, 255])
  })
})
```

**Step 2: Run to verify failure**

Run: `pnpm vitest run tools/placeholder-tileset.test.ts`
Expected: FAIL, cannot find module.

**Step 3: Implement `tools/placeholder-tileset.ts`**

```ts
import type { RgbaImage } from './bmp'

export const TILES_PER_ROW = 10

export function buildPlaceholderTileset(symbols: string[], tileSize: { x: number; y: number }): RgbaImage {
  const rows = Math.ceil(symbols.length / TILES_PER_ROW)
  const width = TILES_PER_ROW * tileSize.x
  const height = rows * tileSize.y
  const img: RgbaImage = { width, height, rgba: new Uint8Array(width * height * 4) }
  symbols.forEach((sym, i) => {
    const tx = (i % TILES_PER_ROW) * tileSize.x
    const ty = Math.floor(i / TILES_PER_ROW) * tileSize.y
    const solid = sym === 'solid'
    const hue = ((i + 1) * 47) % 360
    const [r, g, b] = solid ? [60, 60, 60] : hsl(hue, 0.35, 0.55)
    for (let y = 0; y < tileSize.y; y++) {
      for (let x = 0; x < tileSize.x; x++) {
        const edge = x === 0 || y === 0 || x === tileSize.x - 1 || y === tileSize.y - 1
        const d = ((ty + y) * width + tx + x) * 4
        const c = solid && edge ? [160, 160, 160] : [r, g, b]
        img.rgba[d] = c[0]!; img.rgba[d + 1] = c[1]!; img.rgba[d + 2] = c[2]!; img.rgba[d + 3] = 255
      }
    }
  })
  return img
}

function hsl(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)]
}
```

**Step 4: Run test**

Run: `pnpm vitest run tools/placeholder-tileset.test.ts`
Expected: 1 passed.

**Step 5: Write `tools/convert-assets.ts`**

```ts
// Converts ./assets into ./public/generated for the browser. Run: pnpm assets:convert
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PNG } from 'pngjs'
import { parseMapFile } from '../src/mr-open/mr-map-format'
import { parseTileKey } from '../src/mr-open/mr-tile-key'
import { buildAtlas } from './atlas'
import { decodeBmp, type RgbaImage } from './bmp'
import { buildPlaceholderTileset } from './placeholder-tileset'

const OUT = 'public/generated'
mkdirSync(join(OUT, 'maps'), { recursive: true })
mkdirSync(join(OUT, 'tilesets'), { recursive: true })
mkdirSync(join(OUT, 'sprites'), { recursive: true })

// maps
for (const file of readdirSync('assets/maps')) {
  const def = parseMapFile(readFileSync(join('assets/maps', file), 'utf8'))
  const name = file.replace(/\.txt$/, '')
  writeFileSync(join(OUT, 'maps', `${name}.json`), JSON.stringify(def))
  console.log(`map ${name}: ${def.mapSize.x}x${def.mapSize.y} rooms`)
}

// tile keys and placeholder sheets
for (const file of readdirSync('assets/tile-keys')) {
  const key = parseTileKey(readFileSync(join('assets/tile-keys', file), 'utf8'))
  const name = file.replace(/\.txt$/, '')
  writeFileSync(join(OUT, 'tilesets', `${name}.json`), JSON.stringify({ tileSize: key.tileSize, tilesPerRow: 10, symbols: key.symbols }))
  writePng(join(OUT, 'tilesets', `${name}.png`), buildPlaceholderTileset(key.symbols, key.tileSize))
  console.log(`tileset ${name}: ${key.symbols.length} tiles (placeholder art)`)
}

// merlin sprite atlas
const frames = readdirSync('assets/sprites/merlin')
  .filter((f) => f.endsWith('.bmp'))
  .map((f) => ({ name: f, image: decodeBmp(readFileSync(join('assets/sprites/merlin', f))) }))
const atlas = buildAtlas(frames)
writePng(join(OUT, 'sprites', 'merlin.png'), atlas.sheet)
writeFileSync(join(OUT, 'sprites', 'merlin.json'), JSON.stringify({ animations: atlas.animations }))
console.log(`sprites merlin: ${Object.keys(atlas.animations).length} animations`)

function writePng(path: string, img: RgbaImage): void {
  const png = new PNG({ width: img.width, height: img.height })
  png.data = Buffer.from(img.rgba)
  writeFileSync(path, PNG.sync.write(png))
}
```

**Step 6: Add to `.gitignore`**

Append the line `public/generated/`.

**Step 7: Run and verify**

Run: `pnpm assets:convert`
Expected output includes `map tvsDemo: 4x1 rooms`, three `tileset` lines, and `sprites merlin: 7 animations`.

Run: `ls public/generated/maps public/generated/tilesets public/generated/sprites`
Expected: `tvsDemo.json sam.json mr4Demo.json`, six tileset files, `merlin.png merlin.json`.

Open `public/generated/sprites/merlin.png` in an image viewer or with the Read tool and confirm Merlin frames are visible on a transparent background.

**Step 8: Commit**

```bash
git add tools/convert-assets.ts tools/placeholder-tileset.ts tools/placeholder-tileset.test.ts .gitignore
git commit -m "Add asset converter with placeholder tilesets and Merlin atlas"
```

---

### Task 8: Movement rules

Port of `modMoveToLoc` and `objMoveXY.update` (notes §4 and §5). Per tick per axis: `v = (v + accel * dir)`, then friction removes 50% of the magnitude, then clamp to ±31.

**Files:**
- Create: `src/mr-open/mr-movement.ts`, `src/mr-open/mr-movement.test.ts`

**Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest'
import { MOVE_SPEED_LIMIT, PLAYER_WALK_ACCELERATION, stepVelocity } from './mr-movement'

describe('stepVelocity', () => {
  it('approaches a steady state equal to the acceleration', () => {
    let v = { x: 0, y: 0 }
    const seen: number[] = []
    for (let i = 0; i < 6; i++) {
      v = stepVelocity(v, { x: 1, y: 0 }, PLAYER_WALK_ACCELERATION)
      seen.push(v.x)
    }
    expect(seen.map((n) => Number(n.toFixed(4)))).toEqual([1, 1.5, 1.75, 1.875, 1.9375, 1.96875])
  })

  it('halves speed each tick when no key is held', () => {
    let v = { x: 2, y: 0 }
    v = stepVelocity(v, { x: 0, y: 0 }, PLAYER_WALK_ACCELERATION)
    expect(v.x).toBe(1)
    v = stepVelocity(v, { x: 0, y: 0 }, PLAYER_WALK_ACCELERATION)
    expect(v.x).toBe(0.5)
  })

  it('does not normalise diagonals', () => {
    let v = { x: 0, y: 0 }
    for (let i = 0; i < 40; i++) v = stepVelocity(v, { x: 1, y: 1 }, PLAYER_WALK_ACCELERATION)
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(2 * Math.SQRT2, 3)
  })

  it('clamps to the per-tick speed limit', () => {
    const v = stepVelocity({ x: 100, y: -100 }, { x: 0, y: 0 }, 0)
    expect(v).toEqual({ x: MOVE_SPEED_LIMIT, y: -MOVE_SPEED_LIMIT })
  })

  it('friction moves toward zero without overshooting', () => {
    const v = stepVelocity({ x: -0.5, y: 0 }, { x: 0, y: 0 }, 0)
    expect(v.x).toBe(-0.25)
  })
})
```

**Step 2: Run to verify failure**

Run: `pnpm vitest run src/mr-open/mr-movement.test.ts`
Expected: FAIL, cannot find module.

**Step 3: Implement `src/mr-open/mr-movement.ts`**

```ts
// Port of modMoveToLoc.moveHoriz/moveVert (acceleration) and objMoveXY.update
// (friction, clamp). Friction is a percentage of current speed per axis.
import type { Vec } from './mr-map-format'

/** act_player.txt: #walkAcceleration: 2 */
export const PLAYER_WALK_ACCELERATION = 2
/** objGameObject.txt: friction = point(50, 50) (percent) */
export const FRICTION_PERCENT: Vec = { x: 50, y: 50 }
/** modCollisionDetection.setMoveSpeedLimit: rect(-32,-32,32,32).inflate(-1,-1) */
export const MOVE_SPEED_LIMIT = 31

/**
 * One tick of velocity update. dir components are -1, 0 or 1.
 * Order matches objMoveXY.update: input, friction, clamp.
 */
export function stepVelocity(v: Vec, dir: Vec, accel: number, friction: Vec = FRICTION_PERCENT): Vec {
  let x = v.x + accel * dir.x
  let y = v.y + accel * dir.y
  // lostSpeed = PointValRange(pFriction, [0, speed]); pVect = PointTowardZero(pVect, lostSpeed)
  x = towardZero(x, Math.abs(x) * (friction.x / 100))
  y = towardZero(y, Math.abs(y) * (friction.y / 100))
  return { x: clamp(x, -MOVE_SPEED_LIMIT, MOVE_SPEED_LIMIT), y: clamp(y, -MOVE_SPEED_LIMIT, MOVE_SPEED_LIMIT) }
}

function towardZero(n: number, amount: number): number {
  if (n > 0) return Math.max(0, n - amount)
  if (n < 0) return Math.min(0, n + amount)
  return 0
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}
```

**Step 4: Run tests**

Run: `pnpm vitest run src/mr-open/mr-movement.test.ts`
Expected: 5 passed.

**Step 5: Commit**

```bash
git add src/mr-open/mr-movement.ts src/mr-open/mr-movement.test.ts
git commit -m "Port walk acceleration, friction and speed clamp"
```

---

### Task 9: World grid

The simulation's view of the map: one solid-lookup over all rooms, in world tile coordinates. Outside the map counts as solid (the original's solid border ring).

**Files:**
- Create: `src/sim/world-grid.ts`, `src/sim/world-grid.test.ts`

**Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest'
import type { MapDefinition } from '../mr-open/mr-map-format'
import { buildWorldGrid } from './world-grid'

function tinyMap(): MapDefinition {
  // 2x1 rooms of 3x2 tiles. tile 1 = open, tile 2 = solid
  const room = (grid: number[][]) => ({ num: 0, layers: { backgroundActive: grid, backgroundPassive: grid.map((r) => r.map(() => 1)) } })
  const r1 = room([[1, 2, 1], [1, 1, 1]]); r1.num = 1
  const r2 = room([[1, 1, 1], [2, 1, 2]]); r2.num = 2
  return {
    mapSize: { x: 2, y: 1 }, roomSize: { x: 3, y: 2 }, startRoom: { x: 1, y: 1 },
    layers: [{ name: 'backgroundPassive', tileSet: 'p' }, { name: 'backgroundActive', tileSet: 'a' }],
    rooms: [r1, r2],
  }
}
const isSolid = (i: number) => i === 2

describe('buildWorldGrid', () => {
  it('has the combined size of all rooms', () => {
    const g = buildWorldGrid(tinyMap(), isSolid)
    expect(g.widthTiles).toBe(6)
    expect(g.heightTiles).toBe(2)
  })

  it('looks up tiles by 1-based world tile coordinates', () => {
    const g = buildWorldGrid(tinyMap(), isSolid)
    expect(g.tileAt('backgroundActive', 2, 1)).toBe(2)
    expect(g.tileAt('backgroundActive', 4, 2)).toBe(2) // room 2, col 1, row 2
    expect(g.tileAt('backgroundActive', 5, 2)).toBe(1)
  })

  it('reports solidity and treats outside as solid', () => {
    const g = buildWorldGrid(tinyMap(), isSolid)
    expect(g.solidAt(2, 1)).toBe(true)
    expect(g.solidAt(1, 1)).toBe(false)
    expect(g.solidAt(0, 1)).toBe(true)
    expect(g.solidAt(7, 1)).toBe(true)
    expect(g.solidAt(3, 3)).toBe(true)
  })

  it('converts between rooms and world tiles', () => {
    const g = buildWorldGrid(tinyMap(), isSolid)
    expect(g.roomOfTile(4, 1)).toEqual({ x: 2, y: 1 })
    expect(g.roomRectPx({ x: 2, y: 1 })).toEqual({ left: 96, top: 0, right: 192, bottom: 64 })
  })
})
```

**Step 2: Run to verify failure**

Run: `pnpm vitest run src/sim/world-grid.test.ts`
Expected: FAIL, cannot find module.

**Step 3: Implement `src/sim/world-grid.ts`**

```ts
import { roomNumToXY, type LayerName, type MapDefinition, type Vec } from '../mr-open/mr-map-format'

export const TILE_PX = 32

export interface RectPx { left: number; top: number; right: number; bottom: number }

export interface WorldGrid {
  map: MapDefinition
  widthTiles: number
  heightTiles: number
  /** 1-based world tile coords; returns 0 outside the map or for missing layers */
  tileAt(layer: LayerName, tx: number, ty: number): number
  /** outside the map is solid */
  solidAt(tx: number, ty: number): boolean
  roomOfTile(tx: number, ty: number): Vec
  roomOfPoint(px: number, py: number): Vec
  roomRectPx(room: Vec): RectPx
  roomExists(room: Vec): boolean
}

export function buildWorldGrid(map: MapDefinition, isSolid: (tileIndex: number) => boolean): WorldGrid {
  const widthTiles = map.mapSize.x * map.roomSize.x
  const heightTiles = map.mapSize.y * map.roomSize.y
  const layerNames = map.layers.map((l) => l.name)
  const grids = new Map<LayerName, Int32Array>()
  for (const name of layerNames) grids.set(name, new Int32Array(widthTiles * heightTiles))
  for (const room of map.rooms) {
    const xy = roomNumToXY(room.num, map.mapSize)
    for (const name of layerNames) {
      const src = room.layers[name]
      const dst = grids.get(name)!
      if (!src) continue
      for (let r = 0; r < map.roomSize.y; r++) {
        for (let c = 0; c < map.roomSize.x; c++) {
          const wx = (xy.x - 1) * map.roomSize.x + c
          const wy = (xy.y - 1) * map.roomSize.y + r
          dst[wy * widthTiles + wx] = src[r]![c]!
        }
      }
    }
  }
  const inside = (tx: number, ty: number) => tx >= 1 && ty >= 1 && tx <= widthTiles && ty <= heightTiles
  const tileAt = (layer: LayerName, tx: number, ty: number): number => {
    if (!inside(tx, ty)) return 0
    return grids.get(layer)?.[(ty - 1) * widthTiles + (tx - 1)] ?? 0
  }
  return {
    map, widthTiles, heightTiles, tileAt,
    solidAt: (tx, ty) => !inside(tx, ty) || isSolid(tileAt('backgroundActive', tx, ty)),
    roomOfTile: (tx, ty) => ({ x: Math.floor((tx - 1) / map.roomSize.x) + 1, y: Math.floor((ty - 1) / map.roomSize.y) + 1 }),
    roomOfPoint: (px, py) => ({
      x: Math.floor(px / (map.roomSize.x * TILE_PX)) + 1,
      y: Math.floor(py / (map.roomSize.y * TILE_PX)) + 1,
    }),
    roomRectPx: (room) => {
      const w = map.roomSize.x * TILE_PX
      const h = map.roomSize.y * TILE_PX
      return { left: (room.x - 1) * w, top: (room.y - 1) * h, right: room.x * w, bottom: room.y * h }
    },
    roomExists: (room) => room.x >= 1 && room.y >= 1 && room.x <= map.mapSize.x && room.y <= map.mapSize.y,
  }
}
```

**Step 4: Run tests**

Run: `pnpm vitest run src/sim/world-grid.test.ts`
Expected: 4 passed.

**Step 5: Commit**

```bash
git add src/sim/world-grid.ts src/sim/world-grid.test.ts
git commit -m "Add world tile grid built from all rooms"
```

---

### Task 10: Collision rules

Port of `objCollisionMap.checkCollisions` and `objCollisionTile` (notes §6). Only the four tiles under the rect's corners are tested. A solid tile exposes an edge only if the neighbour on that side is not solid (edge merging). Only edges facing the velocity are tested. Push out on the axis with the smaller overlap. If a solid corner tile exposes no facing edge (exact diagonal approach), push both axes.

Edge locations in world px for tile (tx, ty): left = `(tx-1)*32 - 1`, right = `tx*32`, top = `(ty-1)*32 - 1`, bottom = `ty*32`.

**Files:**
- Create: `src/mr-open/mr-collision.ts`, `src/mr-open/mr-collision.test.ts`

**Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest'
import { PLAYER_COLLISION_RECT, resolveTileCollision } from './mr-collision'

// 6x4 world; S = solid
const layout = [
  '......',
  '..S...',
  '..SS..',
  '......',
]
const solidAt = (tx: number, ty: number) =>
  tx < 1 || ty < 1 || tx > 6 || ty > 4 || layout[ty - 1]![tx - 1] === 'S'

const at = (x: number, y: number) => ({ x, y })

describe('resolveTileCollision', () => {
  it('returns the location unchanged when not moving', () => {
    expect(resolveTileCollision(solidAt, at(100, 100), at(0, 0), PLAYER_COLLISION_RECT)).toEqual(at(100, 100))
  })

  it('pushes out of a wall when moving right', () => {
    // solid tile (3,2) spans x 64..96. Rect right edge = x+15. Moving right into it.
    const r = resolveTileCollision(solidAt, at(52, 48), at(1, 0), PLAYER_COLLISION_RECT)
    // left edge location is 64-1 = 63, overlap = 67-63 = 4, pushed back by 4
    expect(r).toEqual(at(48, 48))
  })

  it('slides along a wall when moving diagonally', () => {
    // moving down-right into the left face of (3,2): y is free, x pushed
    const r = resolveTileCollision(solidAt, at(52, 40), at(1, 1), PLAYER_COLLISION_RECT)
    expect(r.x).toBe(48)
    expect(r.y).toBe(40)
  })

  it('does not test edges hidden between two solid tiles', () => {
    // between (3,2) and (3,3) there is no exposed edge; moving up under (3,3) hits its bottom
    // tile (3,3) spans y 64..96, bottom edge location 96; rect top = y-15
    const r = resolveTileCollision(solidAt, at(80, 110), at(0, -1), PLAYER_COLLISION_RECT)
    expect(r.y).toBe(111) // top 95 vs bottom edge 96: overlap -1 -> pushed to 111
  })

  it('treats outside the map as solid', () => {
    const r = resolveTileCollision(solidAt, at(10, 40), at(-1, 0), PLAYER_COLLISION_RECT)
    // tile 0 right edge location = 0; rect left = -5; overlap = -5 -> pushed to 15
    expect(r.x).toBe(15)
  })
})
```

Note on the overlap sign: the original computes `overlap = rect.left - rightEdge` and always applies `loc -= overlap`. When the rect is already past the edge this is positive and pushes back; the tests above follow the formula exactly rather than intuition. Do not "fix" signs to make tests pass; recheck the formula in notes §6 step 3.

**Step 2: Run to verify failure**

Run: `pnpm vitest run src/mr-open/mr-collision.test.ts`
Expected: FAIL, cannot find module.

**Step 3: Implement `src/mr-open/mr-collision.ts`**

```ts
// Port of objCollisionMap.checkCollisions / selectTilesFromCollisionRect and
// objCollisionTile (edge locations, mergeEdges, calcOverlapEdges, calcOverlapCorners).
import type { Vec } from './mr-map-format'

export const TILE = 32

/** rect(-16,-16,16,16).inflate(-1,-1) for a 32x32 sprite with a centred reg point (modCollisionRect) */
export interface CollisionRect { left: number; top: number; right: number; bottom: number }
export const PLAYER_COLLISION_RECT: CollisionRect = { left: -15, top: -15, right: 15, bottom: 15 }

export type SolidAt = (tx: number, ty: number) => boolean

/** collisionRect + rect(loc, loc) */
export function rectAt(loc: Vec, r: CollisionRect): CollisionRect {
  return { left: loc.x + r.left, top: loc.y + r.top, right: loc.x + r.right, bottom: loc.y + r.bottom }
}

/** 1-based tile containing a world pixel coordinate (objCollisionMap magic rect, minus the border offset) */
export function tileOfPx(px: number): number {
  return Math.floor(px / TILE) + 1
}

export function resolveTileCollision(solidAt: SolidAt, newLoc: Vec, dir: Vec, cr: CollisionRect): Vec {
  if (dir.x === 0 && dir.y === 0) return newLoc
  let loc = { ...newLoc }
  const r0 = rectAt(loc, cr)
  const corners = [
    [tileOfPx(r0.left), tileOfPx(r0.top)],
    [tileOfPx(r0.right), tileOfPx(r0.top)],
    [tileOfPx(r0.left), tileOfPx(r0.bottom)],
    [tileOfPx(r0.right), tileOfPx(r0.bottom)],
  ]
  const seen = new Set<string>()
  for (const [tx, ty] of corners) {
    const key = `${tx},${ty}`
    if (seen.has(key)) continue
    seen.add(key)
    if (!solidAt(tx!, ty!)) continue
    const rect = rectAt(loc, cr)
    const o = overlapForTile(solidAt, tx!, ty!, rect, dir)
    if (o.x === null && o.y === null) continue
    if (o.corner) {
      loc = { x: loc.x - (o.x ?? 0), y: loc.y - (o.y ?? 0) }
    } else if (o.x !== null && o.y !== null) {
      if (Math.abs(o.x) > Math.abs(o.y)) loc = { ...loc, y: loc.y - o.y }
      else loc = { ...loc, x: loc.x - o.x }
    } else if (o.x !== null) {
      loc = { ...loc, x: loc.x - o.x }
    } else if (o.y !== null) {
      loc = { ...loc, y: loc.y - o.y }
    }
  }
  return loc
}

interface Overlap { x: number | null; y: number | null; corner: boolean }

/** Edge pixel locations of tile (tx,ty): objCollisionTile.initCollisionEdges */
function edges(tx: number, ty: number) {
  return { left: (tx - 1) * TILE - 1, right: tx * TILE, top: (ty - 1) * TILE - 1, bottom: ty * TILE }
}

function overlapForTile(solidAt: SolidAt, tx: number, ty: number, rect: CollisionRect, dir: Vec): Overlap {
  const e = edges(tx, ty)
  // mergeEdges: an edge is exposed only if the neighbour across it is not solid
  const exposed = {
    left: !solidAt(tx - 1, ty),
    right: !solidAt(tx + 1, ty),
    top: !solidAt(tx, ty - 1),
    bottom: !solidAt(tx, ty + 1),
  }
  const o: Overlap = { x: null, y: null, corner: false }
  // calcOverlapEdges: only edges facing the movement
  if (dir.x > 0 && exposed.left) o.x = rect.right - e.left
  if (dir.x < 0 && exposed.right) o.x = rect.left - e.right
  if (dir.y > 0 && exposed.top) o.y = rect.bottom - e.top
  if (dir.y < 0 && exposed.bottom) o.y = rect.top - e.bottom
  if (o.x !== null || o.y !== null) return o
  // calcOverlapCorners: exact diagonal approach to a convex corner with no facing edge hit
  if (dir.x !== 0 && dir.y !== 0) {
    const cornerTop = dir.y > 0 ? e.top : e.bottom
    const cornerSide = dir.x > 0 ? e.left : e.right
    o.y = dir.y > 0 ? rect.bottom - cornerTop : rect.top - cornerTop
    o.x = dir.x > 0 ? rect.right - cornerSide : rect.left - cornerSide
    o.corner = true
  }
  return o
}
```

**Step 4: Run tests**

Run: `pnpm vitest run src/mr-open/mr-collision.test.ts`
Expected: 5 passed. If a numeric expectation is off by one, recompute by hand from the edge formulas above before changing anything; the tests encode the formulas.

**Step 5: Commit**

```bash
git add src/mr-open/mr-collision.ts src/mr-open/mr-collision.test.ts
git commit -m "Port four-corner tile collision with edge merging and push-out"
```

---

### Task 11: Room exit rules

Port of `collisionMaster.checkLeaveScreen` and `objPlayerMerlinCharacter` `#leaveRoom` (notes §7). The registration point is tested against the current room's rect using Director `inside` semantics (`left <= x < right`, `top <= y < bottom`). In world coordinates no repositioning is needed; the room simply changes. When exits are closed the room rect acts as a wall, so clamp the collision rect inside it.

**Files:**
- Create: `src/mr-open/mr-room-exit.ts`, `src/mr-open/mr-room-exit.test.ts`

**Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest'
import { PLAYER_COLLISION_RECT } from './mr-collision'
import { clampToRoom, roomAfterMove } from './mr-room-exit'

const room = { left: 0, top: 0, right: 576, bottom: 288 }

describe('roomAfterMove', () => {
  it('stays when the reg point is inside', () => {
    expect(roomAfterMove(room, { x: 575, y: 100 }, { x: 1, y: 1 })).toEqual({ x: 1, y: 1 })
  })
  it('moves right when x reaches the right edge', () => {
    expect(roomAfterMove(room, { x: 576, y: 100 }, { x: 1, y: 1 })).toEqual({ x: 2, y: 1 })
  })
  it('moves up when y goes negative', () => {
    expect(roomAfterMove(room, { x: 10, y: -0.5 }, { x: 1, y: 2 })).toEqual({ x: 1, y: 1 })
  })
})

describe('clampToRoom', () => {
  it('keeps the collision rect inside the room when exits are closed', () => {
    expect(clampToRoom(room, { x: 570, y: 5 }, PLAYER_COLLISION_RECT)).toEqual({ x: 561, y: 15 })
    expect(clampToRoom(room, { x: 100, y: 100 }, PLAYER_COLLISION_RECT)).toEqual({ x: 100, y: 100 })
  })
})
```

**Step 2: Run to verify failure**

Run: `pnpm vitest run src/mr-open/mr-room-exit.test.ts`
Expected: FAIL, cannot find module.

**Step 3: Implement `src/mr-open/mr-room-exit.ts`**

```ts
// Port of collisionMaster.checkLeaveScreen / notifyOfScreenExit and the
// #leaveRoom handling in objPlayerMerlinCharacter, expressed in world coords.
import type { CollisionRect } from './mr-collision'
import type { Vec } from './mr-map-format'

export interface RectPx { left: number; top: number; right: number; bottom: number }

/** Director's inside(point, rect): left <= x < right, top <= y < bottom */
export function insideRect(r: RectPx, p: Vec): boolean {
  return p.x >= r.left && p.x < r.right && p.y >= r.top && p.y < r.bottom
}

/** Which room the player is in after a move, given the current room's rect. Axis-aligned like PointDirRect. */
export function roomAfterMove(roomRect: RectPx, loc: Vec, room: Vec): Vec {
  if (insideRect(roomRect, loc)) return room
  const dx = loc.x < roomRect.left ? -1 : loc.x >= roomRect.right ? 1 : 0
  const dy = loc.y < roomRect.top ? -1 : loc.y >= roomRect.bottom ? 1 : 0
  return { x: room.x + dx, y: room.y + dy }
}

/** With exits closed the solid border ring blocks; equivalent to keeping the rect inside the room. */
export function clampToRoom(roomRect: RectPx, loc: Vec, cr: CollisionRect): Vec {
  return {
    x: Math.min(roomRect.right - 1 - cr.right, Math.max(roomRect.left - cr.left, loc.x)),
    y: Math.min(roomRect.bottom - 1 - cr.bottom, Math.max(roomRect.top - cr.top, loc.y)),
  }
}
```

Check the clamp arithmetic against the test: right bound is `576 - 1 - 15 = 560`. The test expects 561, so decide which is right by reading notes §6 (edge location of the border tile = `right`, overlap = `rect.right - right`), then fix either the test or the `- 1`. Record the decision in a comment.

**Step 4: Run tests**

Run: `pnpm vitest run src/mr-open/mr-room-exit.test.ts`
Expected: 4 passed after resolving the clamp bound.

**Step 5: Commit**

```bash
git add src/mr-open/mr-room-exit.ts src/mr-open/mr-room-exit.test.ts
git commit -m "Port room exit detection and closed-exit clamping"
```

---

### Task 12: Simulation state and tick

Ties the ported rules together at 30 Hz. Input is a snapshot; output is new state. Keeps `prevPos` for render interpolation. Animation follows notes §5: `walk` while a move key is held this tick, else `stand`; missing `stand` falls back to the first `walk` frame.

**Files:**
- Create: `src/sim/state.ts`, `src/sim/tick.ts`, `src/sim/tick.test.ts`

**Step 1: Write `src/sim/state.ts`**

```ts
import type { Vec } from '../mr-open/mr-map-format'
import type { WorldGrid } from './world-grid'

export const TICKS_PER_SECOND = 30
export const TICK_MS = 1000 / TICKS_PER_SECOND

export interface InputSnapshot {
  move: Vec            // components -1, 0, 1 (opposite keys cancel)
  mouseWorld: Vec | null
  chargeHeld: boolean  // Space or left mouse button (reserved)
  shootNearest: boolean // E (reserved)
  shootShort: boolean   // F (reserved)
}

export const NO_INPUT: InputSnapshot = { move: { x: 0, y: 0 }, mouseWorld: null, chargeHeld: false, shootNearest: false, shootShort: false }

export interface AnimationSet {
  /** animation name -> frame count and delay in ticks */
  [name: string]: { frames: number; delay: number }
}

export interface PlayerState {
  pos: Vec
  prevPos: Vec
  vel: Vec
  facingLeft: boolean
  anim: string
  animFrame: number      // 0-based
  animCounter: number    // ticks shown on this frame
}

export interface SimState {
  tick: number
  grid: WorldGrid
  room: Vec
  exitsOpen: boolean
  player: PlayerState
  anims: AnimationSet
}

export interface SimConfig {
  walkAcceleration: number
}

export const DEFAULT_SIM_CONFIG: SimConfig = { walkAcceleration: 2 }
```

**Step 2: Write the failing tests `src/sim/tick.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import type { MapDefinition } from '../mr-open/mr-map-format'
import { createSim, stepSim } from './tick'
import { NO_INPUT } from './state'
import { buildWorldGrid } from './world-grid'

function openMap(): MapDefinition {
  const grid = Array.from({ length: 9 }, () => Array(18).fill(1))
  const rooms = [1, 2].map((num) => ({ num, layers: { backgroundActive: grid, backgroundPassive: grid } }))
  return {
    mapSize: { x: 2, y: 1 }, roomSize: { x: 18, y: 9 }, startRoom: { x: 1, y: 1 },
    layers: [{ name: 'backgroundPassive', tileSet: 'p' }, { name: 'backgroundActive', tileSet: 'a' }], rooms,
  }
}
const anims = { walk: { frames: 8, delay: 3 } }
const make = () => createSim(buildWorldGrid(openMap(), () => false), anims, { x: 100, y: 100 })
const input = (x: number, y: number) => ({ ...NO_INPUT, move: { x, y } })

describe('stepSim', () => {
  it('advances position by the velocity and keeps prevPos', () => {
    let s = make()
    s = stepSim(s, input(1, 0))
    expect(s.player.prevPos).toEqual({ x: 100, y: 100 })
    expect(s.player.pos.x).toBe(101)
    expect(s.tick).toBe(1)
  })

  it('faces left only on horizontal input and keeps facing on vertical', () => {
    let s = make()
    s = stepSim(s, input(-1, 0))
    expect(s.player.facingLeft).toBe(true)
    s = stepSim(s, input(0, 1))
    expect(s.player.facingLeft).toBe(true)
    s = stepSim(s, input(1, 0))
    expect(s.player.facingLeft).toBe(false)
  })

  it('plays walk while a key is held and stand otherwise, 3 ticks per frame', () => {
    let s = make()
    for (let i = 0; i < 3; i++) s = stepSim(s, input(0, 1))
    expect(s.player.anim).toBe('walk')
    expect(s.player.animFrame).toBe(1)
    s = stepSim(s, NO_INPUT)
    expect(s.player.anim).toBe('stand')
  })

  it('changes room when the reg point crosses the room edge', () => {
    let s = make()
    s.player.pos = { x: 574, y: 100 }
    for (let i = 0; i < 5; i++) s = stepSim(s, input(1, 0))
    expect(s.room).toEqual({ x: 2, y: 1 })
    expect(s.player.pos.x).toBeGreaterThanOrEqual(576)
  })

  it('cannot leave the map', () => {
    let s = make()
    s.player.pos = { x: 20, y: 100 }
    for (let i = 0; i < 30; i++) s = stepSim(s, input(-1, 0))
    expect(s.room).toEqual({ x: 1, y: 1 })
    expect(s.player.pos.x).toBeGreaterThanOrEqual(15)
  })
})
```

**Step 3: Run to verify failure**

Run: `pnpm vitest run src/sim/tick.test.ts`
Expected: FAIL, cannot find module `./tick`.

**Step 4: Implement `src/sim/tick.ts`**

```ts
import { PLAYER_COLLISION_RECT, resolveTileCollision } from '../mr-open/mr-collision'
import type { Vec } from '../mr-open/mr-map-format'
import { stepVelocity } from '../mr-open/mr-movement'
import { clampToRoom, roomAfterMove } from '../mr-open/mr-room-exit'
import { DEFAULT_SIM_CONFIG, type AnimationSet, type InputSnapshot, type SimConfig, type SimState } from './state'
import type { WorldGrid } from './world-grid'

export function createSim(grid: WorldGrid, anims: AnimationSet, startPos: Vec): SimState {
  return {
    tick: 0,
    grid,
    room: grid.roomOfPoint(startPos.x, startPos.y),
    exitsOpen: true,
    anims,
    player: { pos: { ...startPos }, prevPos: { ...startPos }, vel: { x: 0, y: 0 }, facingLeft: false, anim: 'stand', animFrame: 0, animCounter: 0 },
  }
}

/** Start position for a map: centre of the #player tile in the start room, else room centre. */
export function findStartPos(grid: WorldGrid, playerTileIndex: number | null): Vec {
  const { roomSize, startRoom } = grid.map
  const r = grid.roomRectPx(startRoom)
  if (playerTileIndex !== null) {
    for (let ty = 1; ty <= roomSize.y; ty++) {
      for (let tx = 1; tx <= roomSize.x; tx++) {
        const wx = (startRoom.x - 1) * roomSize.x + tx
        const wy = (startRoom.y - 1) * roomSize.y + ty
        if (grid.tileAt('objects', wx, wy) === playerTileIndex) {
          return { x: (wx - 1) * 32 + 16, y: (wy - 1) * 32 + 16 }
        }
      }
    }
  }
  return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 }
}

export function stepSim(s: SimState, input: InputSnapshot, cfg: SimConfig = DEFAULT_SIM_CONFIG): SimState {
  const p = s.player
  // 1-4. input, acceleration, friction, clamp (objMoveXY.update)
  const vel = stepVelocity(p.vel, input.move, cfg.walkAcceleration)
  let loc: Vec = { x: p.pos.x + vel.x, y: p.pos.y + vel.y }
  // 5. collision, direction = sign of velocity (collisionMaster.checkCollisions)
  const dir = { x: Math.sign(vel.x), y: Math.sign(vel.y) }
  const before = loc
  loc = resolveTileCollision(s.grid.solidAt, loc, dir, PLAYER_COLLISION_RECT)
  const hitWallX = loc.x !== before.x
  const roomRect = s.grid.roomRectPx(s.room)
  if (!s.exitsOpen) loc = clampToRoom(roomRect, loc, PLAYER_COLLISION_RECT)
  // 6. exit test on the reg point
  let room = s.room
  if (s.exitsOpen) {
    const next = roomAfterMove(roomRect, loc, s.room)
    if (s.grid.roomExists(next)) room = next
  }
  // wall hits zero horizontal velocity only (objGameObject.collisionWallLeft/Right)
  const finalVel = { x: hitWallX ? 0 : vel.x, y: vel.y }
  // facing: horizontal input only (modMoveToLoc.moveHorizReaction)
  const facingLeft = input.move.x < 0 ? true : input.move.x > 0 ? false : p.facingLeft
  // 7. animation: "moving" = key held this tick
  const moving = input.move.x !== 0 || input.move.y !== 0
  const animName = moving && s.anims['walk'] ? 'walk' : 'stand'
  let animFrame = p.animFrame
  let animCounter = p.animCounter
  if (animName !== p.anim) { animFrame = 0; animCounter = 0 }
  else {
    const def = s.anims[animName]
    if (def) {
      animCounter++
      if (animCounter >= def.delay) { animCounter = 0; animFrame = (animFrame + 1) % def.frames }
    }
  }
  return {
    ...s,
    tick: s.tick + 1,
    room,
    player: { pos: loc, prevPos: p.pos, vel: finalVel, facingLeft, anim: animName, animFrame, animCounter },
  }
}
```

**Step 5: Run tests**

Run: `pnpm vitest run src/sim/tick.test.ts`
Expected: 5 passed. If the "3 ticks per frame" test expects `animFrame` 1 but gets 0, note that the first walk tick switches the animation (frame 0, counter 0) and only the next two ticks count; adjust the loop to 4 ticks and keep the delay semantics.

**Step 6: Commit**

```bash
git add src/sim
git commit -m "Add fixed-step simulation tick for player walking and room changes"
```

---

### Task 13: Input layer

Maps browser keys to the input snapshot. Original key sets (WASD and arrows) both active. Left click, Space, E, F and mouse position are captured now for later slices.

**Files:**
- Create: `src/input/keyboard.ts`, `src/input/keyboard.test.ts`

**Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest'
import { InputTracker } from './keyboard'

describe('InputTracker', () => {
  it('sums held direction keys into a move vector, opposite keys cancel', () => {
    const t = new InputTracker()
    t.keyDown('KeyW')
    t.keyDown('ArrowRight')
    expect(t.snapshot().move).toEqual({ x: 1, y: -1 })
    t.keyDown('KeyA')
    expect(t.snapshot().move).toEqual({ x: 0, y: -1 })
    t.keyUp('KeyW')
    expect(t.snapshot().move).toEqual({ x: 0, y: 0 })
  })

  it('reports reserved action keys and left click', () => {
    const t = new InputTracker()
    t.keyDown('KeyE'); t.keyDown('KeyF')
    t.setMouseButton(true)
    expect(t.snapshot().chargeHeld).toBe(true)
    t.setMouseButton(false)
    t.keyDown('Space')
    const s = t.snapshot()
    expect(s.chargeHeld).toBe(true)
    expect(s.shootNearest).toBe(true)
    expect(s.shootShort).toBe(true)
  })

  it('carries the latest mouse world position', () => {
    const t = new InputTracker()
    expect(t.snapshot().mouseWorld).toBeNull()
    t.setMouseWorld({ x: 12, y: 34 })
    expect(t.snapshot().mouseWorld).toEqual({ x: 12, y: 34 })
  })
})
```

**Step 2: Run to verify failure**

Run: `pnpm vitest run src/input/keyboard.test.ts`
Expected: FAIL, cannot find module.

**Step 3: Implement `src/input/keyboard.ts`**

```ts
import type { Vec } from '../mr-open/mr-map-format'
import type { InputSnapshot } from '../sim/state'

// keyMaster.updateMoveVector: up (0,-1), down (0,1), left (-1,0), right (1,0), summed
const MOVE_KEYS: Record<string, Vec> = {
  KeyW: { x: 0, y: -1 }, ArrowUp: { x: 0, y: -1 },
  KeyS: { x: 0, y: 1 }, ArrowDown: { x: 0, y: 1 },
  KeyA: { x: -1, y: 0 }, ArrowLeft: { x: -1, y: 0 },
  KeyD: { x: 1, y: 0 }, ArrowRight: { x: 1, y: 0 },
}

export class InputTracker {
  private held = new Set<string>()
  private mouseWorld: Vec | null = null
  private mouseDown = false

  keyDown(code: string): void { this.held.add(code) }
  keyUp(code: string): void { this.held.delete(code) }
  setMouseWorld(p: Vec | null): void { this.mouseWorld = p }
  setMouseButton(down: boolean): void { this.mouseDown = down }

  snapshot(): InputSnapshot {
    let x = 0, y = 0
    // each direction contributes at most once even if both WASD and arrow keys are held
    const dirs = new Set<string>()
    for (const code of this.held) {
      const v = MOVE_KEYS[code]
      if (v) dirs.add(`${v.x},${v.y}`)
    }
    for (const d of dirs) { const [dx, dy] = d.split(',').map(Number); x += dx!; y += dy! }
    return {
      move: { x: Math.sign(x), y: Math.sign(y) },
      mouseWorld: this.mouseWorld,
      chargeHeld: this.held.has('Space') || this.mouseDown,
      shootNearest: this.held.has('KeyE'),
      shootShort: this.held.has('KeyF'),
    }
  }

  /** Attach to a window; returns a detach function. */
  attach(target: Window): () => void {
    const down = (e: KeyboardEvent) => { this.keyDown(e.code); if (MOVE_KEYS[e.code] || e.code === 'Space') e.preventDefault() }
    const up = (e: KeyboardEvent) => this.keyUp(e.code)
    const blur = () => { this.held.clear(); this.mouseDown = false }
    const mdown = (e: MouseEvent) => { if (e.button === 0) this.mouseDown = true }
    const mup = (e: MouseEvent) => { if (e.button === 0) this.mouseDown = false }
    target.addEventListener('keydown', down)
    target.addEventListener('keyup', up)
    target.addEventListener('blur', blur)
    target.addEventListener('mousedown', mdown)
    target.addEventListener('mouseup', mup)
    return () => {
      target.removeEventListener('keydown', down); target.removeEventListener('keyup', up); target.removeEventListener('blur', blur)
      target.removeEventListener('mousedown', mdown); target.removeEventListener('mouseup', mup)
    }
  }
}
```

**Step 4: Run tests**

Run: `pnpm vitest run src/input/keyboard.test.ts`
Expected: 3 passed.

**Step 5: Commit**

```bash
git add src/input
git commit -m "Add keyboard and mouse input tracker"
```

---

### Task 14: Asset loaders

Loads `public/generated` JSON and PNG into typed structures and PixiJS textures.

**Files:**
- Create: `src/data/loaders.ts`

**Step 1: Implement `src/data/loaders.ts`** (no unit test; exercised by the browser run in Task 16)

```ts
import { Assets, Rectangle, Texture, type TextureSource } from 'pixi.js'
import type { MapDefinition } from '../mr-open/mr-map-format'
import type { AnimationSet } from '../sim/state'

export interface TilesetData {
  tileSize: { x: number; y: number }
  tilesPerRow: number
  symbols: string[]
}

export interface LoadedTileset {
  data: TilesetData
  textures: Texture[] // index i -> tile index i+1
}

export interface LoadedSprite {
  anims: AnimationSet
  frames: Record<string, Texture[]>
}

async function json<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`failed to load ${url}: ${res.status}`)
  return (await res.json()) as T
}

function nearest(t: Texture): Texture {
  ;(t.source as TextureSource).scaleMode = 'nearest'
  return t
}

export async function loadMap(name: string): Promise<MapDefinition> {
  return json<MapDefinition>(`/generated/maps/${name}.json`)
}

export async function loadTileset(name: string): Promise<LoadedTileset> {
  const data = await json<TilesetData>(`/generated/tilesets/${name}.json`)
  const sheet = nearest(await Assets.load<Texture>(`/generated/tilesets/${name}.png`))
  const textures = data.symbols.map((_, i) => {
    const x = (i % data.tilesPerRow) * data.tileSize.x
    const y = Math.floor(i / data.tilesPerRow) * data.tileSize.y
    return nearest(new Texture({ source: sheet.source, frame: new Rectangle(x, y, data.tileSize.x, data.tileSize.y) }))
  })
  return { data, textures }
}

export async function loadSprite(name: string): Promise<LoadedSprite> {
  const atlas = await json<{ animations: Record<string, { delay: number; frames: { x: number; y: number; w: number; h: number }[] }> }>(`/generated/sprites/${name}.json`)
  const sheet = nearest(await Assets.load<Texture>(`/generated/sprites/${name}.png`))
  const anims: AnimationSet = {}
  const frames: Record<string, Texture[]> = {}
  for (const [anim, def] of Object.entries(atlas.animations)) {
    anims[anim] = { frames: def.frames.length, delay: def.delay }
    frames[anim] = def.frames.map((f) => nearest(new Texture({ source: sheet.source, frame: new Rectangle(f.x, f.y, f.w, f.h) })))
  }
  // objAnimSet.symExistsOrDefault falls back to #stand; the export has no stand strip, so alias walk frame 1
  if (!frames['stand'] && frames['walk']) {
    frames['stand'] = [frames['walk'][0]!]
    anims['stand'] = { frames: 1, delay: 1 }
  }
  return { anims, frames }
}
```

**Step 2: Type-check**

Run: `pnpm tsc --noEmit`
Expected: no errors. If PixiJS 8 types differ for `Texture` construction, consult `node_modules/pixi.js/lib/rendering/renderers/shared/texture/Texture.d.ts` and adjust; keep `scaleMode = 'nearest'`.

**Step 3: Commit**

```bash
git add src/data
git commit -m "Add map, tileset and sprite loaders"
```

---

### Task 15: Renderer with camera, zoom and interpolation

**Files:**
- Create: `src/render/camera.ts`, `src/render/camera.test.ts`, `src/render/scene.ts`

**Step 1: Write the failing camera tests `src/render/camera.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { cameraOrigin, chooseZoom } from './camera'

const view = { w: 576, h: 288 }
const roomRect = { left: 576, top: 0, right: 1152, bottom: 288 }

describe('cameraOrigin', () => {
  it('snaps to the room in room mode', () => {
    expect(cameraOrigin('room', roomRect, { x: 700, y: 50 }, view, { w: 2000, h: 288 })).toEqual({ x: 576, y: 0 })
  })
  it('centres on the player in follow mode, clamped to the world', () => {
    expect(cameraOrigin('follow', roomRect, { x: 700, y: 144 }, view, { w: 2000, h: 288 })).toEqual({ x: 412, y: 0 })
    expect(cameraOrigin('follow', roomRect, { x: 10, y: 144 }, view, { w: 2000, h: 288 })).toEqual({ x: 0, y: 0 })
    expect(cameraOrigin('follow', roomRect, { x: 1990, y: 144 }, view, { w: 2000, h: 288 })).toEqual({ x: 1424, y: 0 })
  })
})

describe('chooseZoom', () => {
  it('picks the largest integer zoom that fits', () => {
    expect(chooseZoom({ w: 640, h: 320 }, { w: 1300, h: 700 })).toBe(2)
    expect(chooseZoom({ w: 640, h: 320 }, { w: 600, h: 300 })).toBe(1)
  })
})
```

**Step 2: Run to verify failure**

Run: `pnpm vitest run src/render/camera.test.ts`
Expected: FAIL, cannot find module.

**Step 3: Implement `src/render/camera.ts`**

```ts
import type { Vec } from '../mr-open/mr-map-format'

export type CameraMode = 'room' | 'follow'
export interface Size { w: number; h: number }
export interface RectPx { left: number; top: number; right: number; bottom: number }

/** Top-left world pixel shown at the top-left of the play view. */
export function cameraOrigin(mode: CameraMode, roomRect: RectPx, player: Vec, view: Size, world: Size): Vec {
  if (mode === 'room') return { x: roomRect.left, y: roomRect.top }
  const x = Math.round(player.x - view.w / 2)
  const y = Math.round(player.y - view.h / 2)
  return {
    x: Math.max(0, Math.min(world.w - view.w, x)),
    y: Math.max(0, Math.min(world.h - view.h, y)),
  }
}

export function chooseZoom(logical: Size, window: Size): number {
  return Math.max(1, Math.floor(Math.min(window.w / logical.w, window.h / logical.h)))
}
```

**Step 4: Run tests**

Run: `pnpm vitest run src/render/camera.test.ts`
Expected: 3 passed.

**Step 5: Implement `src/render/scene.ts`**

```ts
import { Application, Container, Sprite, Text } from 'pixi.js'
import type { LoadedSprite, LoadedTileset } from '../data/loaders'
import type { LayerName } from '../mr-open/mr-map-format'
import type { SimState } from '../sim/state'
import { TILE_PX } from '../sim/world-grid'
import { cameraOrigin, chooseZoom, type CameraMode, type Size } from './camera'

export interface RenderConfig {
  logical: Size          // e.g. 640x320
  playOffset: { x: number; y: number } // where the room area sits on the logical screen, e.g. (32, 0)
  view: Size             // play view size in px, e.g. 576x288
  cameraMode: CameraMode
  spriteScale: number    // 2: 16 px frames drawn at 32 px
  debug: boolean
}

export class Scene {
  readonly app = new Application()
  private world = new Container()
  private layers: Partial<Record<LayerName, Container>> = {}
  private tilePool: Sprite[] = []
  private player = new Sprite()
  private debugText = new Text({ text: '', style: { fill: '#0f0', fontSize: 10, fontFamily: 'monospace' } })
  private lastOrigin = { x: NaN, y: NaN }

  constructor(
    private cfg: RenderConfig,
    private tilesets: Partial<Record<LayerName, LoadedTileset>>,
    private merlin: LoadedSprite,
  ) {}

  async init(parent: HTMLElement): Promise<void> {
    await this.app.init({ width: this.cfg.logical.w, height: this.cfg.logical.h, background: '#000', antialias: false, roundPixels: true })
    parent.appendChild(this.app.canvas)
    this.world.position.set(this.cfg.playOffset.x, this.cfg.playOffset.y)
    this.app.stage.addChild(this.world)
    for (const name of ['backgroundPassive', 'backgroundActive'] as LayerName[]) {
      const c = new Container()
      this.layers[name] = c
      this.world.addChild(c)
    }
    this.player.anchor.set(0.5)
    this.player.scale.set(this.cfg.spriteScale)
    this.world.addChild(this.player)
    this.debugText.position.set(2, this.cfg.logical.h - 12)
    this.app.stage.addChild(this.debugText)
    this.applyZoom()
    window.addEventListener('resize', () => this.applyZoom())
  }

  applyZoom(): void {
    const z = chooseZoom(this.cfg.logical, { w: window.innerWidth, h: window.innerHeight })
    this.app.canvas.style.width = `${this.cfg.logical.w * z}px`
    this.app.canvas.style.height = `${this.cfg.logical.h * z}px`
  }

  /** alpha in [0,1): how far between the previous and current tick the display is. */
  draw(s: SimState, alpha: number, fps: number): void {
    const p = s.player
    const ipos = { x: p.prevPos.x + (p.pos.x - p.prevPos.x) * alpha, y: p.prevPos.y + (p.pos.y - p.prevPos.y) * alpha }
    const worldSize = { w: s.grid.widthTiles * TILE_PX, h: s.grid.heightTiles * TILE_PX }
    const origin = cameraOrigin(this.cfg.cameraMode, s.grid.roomRectPx(s.room), ipos, this.cfg.view, worldSize)
    if (origin.x !== this.lastOrigin.x || origin.y !== this.lastOrigin.y) {
      this.rebuildTiles(s, origin)
      this.lastOrigin = origin
    }
    const frames = this.merlin.frames[p.anim] ?? this.merlin.frames['stand']!
    this.player.texture = frames[p.animFrame % frames.length]!
    this.player.scale.x = (p.facingLeft ? -1 : 1) * this.cfg.spriteScale
    this.player.position.set(Math.round(ipos.x - origin.x), Math.round(ipos.y - origin.y))
    this.debugText.visible = this.cfg.debug
    if (this.cfg.debug) {
      this.debugText.text = `fps ${fps.toFixed(0)} tick ${s.tick} room ${s.room.x},${s.room.y} pos ${p.pos.x.toFixed(1)},${p.pos.y.toFixed(1)} vel ${p.vel.x.toFixed(2)},${p.vel.y.toFixed(2)} cam ${this.cfg.cameraMode}`
    }
  }

  private rebuildTiles(s: SimState, origin: { x: number; y: number }): void {
    let used = 0
    const firstTx = Math.floor(origin.x / TILE_PX) + 1
    const firstTy = Math.floor(origin.y / TILE_PX) + 1
    const cols = Math.ceil(this.cfg.view.w / TILE_PX) + 1
    const rows = Math.ceil(this.cfg.view.h / TILE_PX) + 1
    for (const name of ['backgroundPassive', 'backgroundActive'] as LayerName[]) {
      const container = this.layers[name]!
      container.removeChildren()
      const ts = this.tilesets[name]
      if (!ts) continue
      for (let ty = firstTy; ty < firstTy + rows; ty++) {
        for (let tx = firstTx; tx < firstTx + cols; tx++) {
          const idx = s.grid.tileAt(name, tx, ty)
          if (idx === 0) continue
          const tex = ts.textures[idx - 1]
          if (!tex) continue
          const spr = this.tilePool[used] ?? (this.tilePool[used] = new Sprite())
          used++
          spr.texture = tex
          spr.position.set((tx - 1) * TILE_PX - origin.x, (ty - 1) * TILE_PX - origin.y)
          container.addChild(spr)
        }
      }
    }
  }
}
```

**Step 6: Type-check**

Run: `pnpm tsc --noEmit`
Expected: no errors.

**Step 7: Commit**

```bash
git add src/render
git commit -m "Add PixiJS scene with camera modes, integer zoom and interpolation"
```

---

### Task 16: Main loop and browser verification

**Files:**
- Modify: `src/main.ts`

**Step 1: Write `src/main.ts`**

```ts
import { loadMap, loadSprite, loadTileset } from './data/loaders'
import { InputTracker } from './input/keyboard'
import { parseTileKey } from './mr-open/mr-tile-key'
import { Scene, type RenderConfig } from './render/scene'
import { TICK_MS } from './sim/state'
import { createSim, findStartPos, stepSim } from './sim/tick'
import { buildWorldGrid } from './sim/world-grid'

const params = new URLSearchParams(location.search)
const mapName = params.get('map') ?? 'tvsDemo'

const cfg: RenderConfig = {
  logical: { w: 640, h: 320 },
  playOffset: { x: 32, y: 0 }, // assumption: 32 px side margins; verify against the original stage
  view: { w: 576, h: 288 },
  cameraMode: params.get('camera') === 'follow' ? 'follow' : 'room',
  spriteScale: 2,
  debug: params.get('debug') !== '0',
}

async function main(): Promise<void> {
  const map = await loadMap(mapName)
  const tilesetFor = (layer: string) => map.layers.find((l) => l.name === layer)?.tileSet
  const [passive, active, objects, merlin] = await Promise.all([
    loadTileset(tilesetFor('backgroundPassive')!),
    loadTileset(tilesetFor('backgroundActive')!),
    loadTileset(tilesetFor('objects')!),
    loadSprite('merlin'),
  ])
  const activeKey = { isSolid: (i: number) => i >= 1 && active.data.symbols[i - 1] === 'solid' }
  const grid = buildWorldGrid(map, activeKey.isSolid)
  const playerTile = objects.data.symbols.indexOf('player') + 1 || null
  let sim = createSim(grid, merlin.anims, findStartPos(grid, playerTile))

  const scene = new Scene(cfg, { backgroundPassive: passive, backgroundActive: active }, merlin)
  await scene.init(document.body)

  const input = new InputTracker()
  input.attach(window)

  let acc = 0
  let last = performance.now()
  let fps = 0
  const frame = (now: number) => {
    const dt = Math.min(250, now - last)
    last = now
    fps = fps * 0.9 + (1000 / Math.max(1, dt)) * 0.1
    acc += dt
    while (acc >= TICK_MS) {
      sim = stepSim(sim, input.snapshot())
      acc -= TICK_MS
    }
    scene.draw(sim, acc / TICK_MS, fps)
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
}

main().catch((e) => {
  console.error(e)
  document.body.textContent = String(e)
})
```

Note: `parseTileKey` import is unused; remove it. `activeKey.isSolid` duplicates `TileKey.isSolid` on purpose because the browser gets JSON, not the text key.

**Step 2: Run in the browser**

Run: `pnpm assets:convert && pnpm dev`
Open `http://localhost:5173/?map=tvsDemo` and verify:
- The room renders as coloured placeholder tiles with solid tiles dark grey.
- Merlin appears, WASD and arrows move him, he faces left when moving left.
- He slides along walls and cannot pass through dark grey tiles.
- Walking right off the room edge cuts to the next room; the debug line shows `room 2,1`.
- He cannot leave the map at the far edges.
- `?camera=follow` scrolls continuously.

Open `?map=sam` and `?map=mr4Demo` and confirm they load.

If a check fails, use `superpowers:systematic-debugging` before changing rules code; the unit tests encode the original formulas.

**Step 3: Type-check and test everything**

Run: `pnpm tsc --noEmit && pnpm test`
Expected: no type errors, all tests pass.

**Step 4: Commit**

```bash
git add src/main.ts
git commit -m "Wire main loop: 30 Hz simulation with interpolated rendering"
```

---

### Task 17: Update readme and record open questions

**Files:**
- Modify: `readme.md`
- Modify: `docs/notes/engine-mechanics-walking-and-rooms.md` (append a "Prototype assumptions" section)

**Step 1: Write `readme.md`**

```markdown
# Merlin's Revenge Remake

TypeScript port of the open-sourced Merlin Open engine.

## Run

    pnpm install
    pnpm assets:copy      # needs the original archive in assets-mr-original/ (not in git)
    pnpm assets:convert
    pnpm dev

Query parameters: `?map=tvsDemo|sam|mr4Demo`, `?camera=room|follow`, `?debug=0`.

## Layout

- `src/mr-open/` code ported directly from the Lingo source, one file per original object
- `src/sim/` fixed 30 Hz simulation in world coordinates
- `src/render/` PixiJS renderer, camera, zoom
- `src/input/` keyboard and mouse
- `tools/` asset copy and conversion
- `docs/` design and engine notes
```

**Step 2: Append to the engine notes**

```markdown
## Prototype assumptions (walk-and-rooms slice)

- Frames drawn at 2x so 16 px art is one tile tall; collision rect (-15,-15,15,15).
- Play area at (32, 0) on a 640x320 logical screen.
- `stand` aliases the first `walk` frame.
- Exits always open (no enemies yet).
```

**Step 3: Commit**

```bash
git add readme.md docs/notes/engine-mechanics-walking-and-rooms.md
git commit -m "Document how to run the prototype and its assumptions"
```

---

### Task 18 (parallel spike, optional): extract real tile sheets from the Director file

Not on the critical path. Goal: get `tlk_merlinOpenPassive`, `tlk_merlinOpenActive`, `tlk_merlinOpenObjects` bitmaps out of `merlin_engine_76_speed.dir` into `assets/tilesets/*.png`.

**Steps:**
1. In the scratchpad, `pip install` or clone a Director cast extractor (search for "drxtract" on GitHub; it targets .dir/.dcr files and can dump bitmap cast members). Run it against the `.dir` (uncompressed) rather than the `.dcr`.
2. If it produces the three sheets, confirm 10 tiles per row and 32 px tiles by checking width is 320 px. Copy them to `assets/tilesets/<name>.png` and add the copy rule to `tools/copy-assets.ts` with a note that they were extracted, not copied verbatim.
3. Extend `tools/convert-assets.ts`: if `assets/tilesets/<name>.png` exists, copy it to `public/generated/tilesets/` instead of generating a placeholder. Convert white to transparent for the active layer (ink 36) using the same rule as sprites.
4. If extraction fails, write what was tried in `docs/notes/tileset-extraction.md` and ask the user whether they can export the sheets from Director on a Windows machine.

---

## Done criteria

- `pnpm test` passes; `pnpm build` succeeds.
- All six browser checks in Task 16 pass on `tvsDemo` and `sam`.
- No file under `src/` or `tools/convert-assets.ts` mentions `assets-mr-original`.
