/// <reference types="vitest/config" />
import { defineConfig } from 'vite'

export default defineConfig({
  server: { port: 3371, strictPort: true },
  preview: { port: 3371 },
  test: {
    include: ['src/**/*.test.ts', 'tools/**/*.test.ts'],
  },
})
