import { defineConfig } from '@playwright/test'

// E2E offline contra un build de producción (vite preview). El service worker
// no existe en dev → estos tests solo tienen sentido acá. El build apunta al
// Supabase LOCAL (modo «localdb», .env.localdb.local). Correr con:
//   pnpm build:local && pnpm test:e2e:offline
export default defineConfig({
  // La empresa de pruebas es una sola: un campo a medias de un test trabaría a
  // otro que corra a la vez (primero el mapa). De a uno, y arrancando completa.
  workers: 1,
  globalSetup: './e2e/global-setup.ts',
  testDir: './e2e',
  // Los dos corren contra el build real y sin red (Dexie + service worker).
  testMatch: /(offline|manga)\.spec\.ts/,
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
