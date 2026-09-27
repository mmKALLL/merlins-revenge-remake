// Zips the production build (dist/: index.html, the JS bundle and generated/ assets) into
// release/merlins-revenge-remake-<date>.zip for hosting. Run through `pnpm package`, which rebuilds first.
// The page must be served over HTTP (it fetches its assets); any static host or sub-path works.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const dist = join(root, 'dist')
if (!existsSync(join(dist, 'index.html'))) throw new Error('dist/index.html is missing; run pnpm build first')
const release = join(root, 'release')
mkdirSync(release, { recursive: true })
const zip = join(release, `merlins-revenge-remake-${new Date().toISOString().slice(0, 10)}.zip`)
rmSync(zip, { force: true })
execFileSync('zip', ['-qr', '-9', zip, '.', '-x', '.DS_Store'], { cwd: dist, stdio: 'inherit' })
console.log(`packaged ${zip}`)
