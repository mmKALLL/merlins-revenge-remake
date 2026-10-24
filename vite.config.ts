/// <reference types="vitest/config" />
import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'

/** The commit the build is made from (short hash), with "+" for uncommitted changes; "dev" outside git. */
function commitLabel(): string {
  try {
    const hash = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()
    const dirty = execSync('git status --porcelain --untracked-files=no', { encoding: 'utf8' }).trim() !== ''
    return dirty ? `${hash}+` : hash
  } catch {
    return 'dev'
  }
}

const builtAt = new Date()

export default defineConfig({
  // relative asset paths so the build can be published under any sub-path
  base: './',
  // stamps the game data URLs (src/data/loaders.ts), so a deploy's code never meets a cached older deploy's data
  define: {
    __BUILD_ID__: JSON.stringify(builtAt.getTime().toString(36)),
    // the main menu's build line: the build's date and commit
    __BUILD_LABEL__: JSON.stringify(`Build ${builtAt.toLocaleDateString("sv-SE")} · ${commitLabel()}`), // sv-SE: YYYY-MM-DD in local time
  },
  server: { port: 3371, strictPort: true },
  preview: { port: 3371 },
  test: {
    include: ['src/**/*.test.ts', 'tools/**/*.test.ts'],
  },
})
