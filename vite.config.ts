/// <reference types="vitest/config" />
import { defineConfig } from 'vite'

export default defineConfig({
  // relative asset paths so the build can be published under any sub-path
  base: './',
  // stamps the game data URLs (src/data/loaders.ts), so a deploy's code never meets a cached older deploy's data
  define: { __BUILD_ID__: JSON.stringify(Date.now().toString(36)) },
  server: { port: 3371, strictPort: true },
  preview: { port: 3371 },
  test: {
    include: ['src/**/*.test.ts', 'tools/**/*.test.ts'],
  },
})
