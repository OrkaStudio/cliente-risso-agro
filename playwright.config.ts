import { defineConfig } from '@playwright/test'

// E2E contra Supabase real, con el dev server de Vite.
// Credenciales seed por env (no hardcodear): E2E_EMAIL / E2E_PASSWORD.
export default defineConfig({
  testDir: './e2e',
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
