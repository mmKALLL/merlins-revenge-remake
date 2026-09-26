/// <reference types="vitest/config" />
import { defineConfig } from 'vite'

export default defineConfig({
  // relative asset paths so the build can be published under any sub-path
  base: './',
  server: { port: 3371, strictPort: true },
  preview: { port: 3371 },
  test: {
    include: ['src/**/*.test.ts', 'tools/**/*.test.ts'],
  },
})
