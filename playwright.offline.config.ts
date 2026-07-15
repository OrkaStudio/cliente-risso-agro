import { defineConfig } from '@playwright/test'

// E2E offline contra el BUILD DE PRODUCCIÓN (vite preview). El service worker
// no existe en dev → estos tests solo tienen sentido acá. Correr con:
//   pnpm build && pnpm test:e2e:offline
export default defineConfig({
  testDir: './e2e',
  testMatch: 'offline.spec.ts',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: 'http://localhost:4173',
    headless: true,
  },
  webServer: {
    command: 'pnpm preview',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
