import { existsSync } from 'node:fs'
import { defineConfig } from '@playwright/test'

// E2E contra el Supabase LOCAL (supabase start), con el dev server de Vite.
// La cuenta de prueba sale de supabase/seed.sql: entra con un celular y un
// código fijo que sólo existen en local. Producción no se toca.
if (existsSync('.env.e2e.local')) process.loadEnvFile('.env.e2e.local')
export default defineConfig({
  testDir: './e2e',
  // offline y manga corren contra el build de prod (playwright.offline.config.ts):
  // el service worker no existe en dev.
  testIgnore: /(offline|manga)\.spec\.ts/,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
  },
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
