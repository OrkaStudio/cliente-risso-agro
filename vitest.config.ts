import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

// Unit tests (vitest) separados de los e2e (Playwright, en /e2e).
// Sólo toma `src/**/*.test.ts` para no pisarse con los *.spec.ts de Playwright.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'supabase/functions/_shared/**/*.test.ts'],
    environment: 'node',
  },
})
