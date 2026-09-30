import { existsSync } from 'node:fs'
import { defineConfig } from '@playwright/test'

// E2E contra Supabase real, con el dev server de Vite.
// Credenciales seed por env (no hardcodear): E2E_EMAIL / E2E_PASSWORD.
// Localmente viven en `.env.e2e.local` (ignorado por git): la cuenta
// e2e@orkastudio.test, con su propia empresa "E2E Pruebas" — nunca la de un
// productor ni la de Orka Pruebas, porque los tests escriben datos.
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
