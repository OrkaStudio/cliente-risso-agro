import { test, expect, type Page } from '@playwright/test'

/**
 * Offline real: la web debe CARGAR y BOOTEAR sin red (el caso del campo).
 *
 * Corre contra el build de producción (`pnpm preview`, config
 * playwright.offline.config.ts) porque el service worker NO existe en dev —
 * lección [[lecciones/2026-07-09-risso-agro-leaflet-geoman-prod-build]]:
 * verificar siempre el build real.
 *
 * Sin credenciales: fabricamos el estado de localStorage (sesión Supabase +
 * membresía persistida). Offline nada se valida contra el servidor — ese es
 * exactamente el punto del Modo Campo. Complementa (no reemplaza) los e2e
 * con auth real.
 */

// Ref del proyecto Supabase (voippiczkxbxsreiqiqu) → key por defecto de
// supabase-js para la sesión en localStorage.
const AUTH_KEY = 'sb-voippiczkxbxsreiqiqu-auth-token'
// Última membresía conocida que persiste use-empresa.ts (capa 2 del fix).
const MEMBRESIA_KEY = 'risso.membresia.v1'

const MOVIL = { width: 390, height: 844 }

/** JWT de mentira con la forma correcta (offline nadie lo verifica). */
function fakeJwt(payload: Record<string, unknown>): string {
  const b64 = (obj: Record<string, unknown>) =>
    Buffer.from(JSON.stringify(obj)).toString('base64url')
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.firma-fake`
}

function sesionFabricada({ vencida }: { vencida: boolean }) {
  const ahora = Math.floor(Date.now() / 1000)
  const expiresAt = vencida ? ahora - 3_600 : ahora + 3_600
  const userId = '00000000-0000-4000-8000-000000000001'
  return {
    access_token: fakeJwt({
      sub: userId,
      exp: expiresAt,
      role: 'authenticated',
      aud: 'authenticated',
      session_id: '00000000-0000-4000-8000-000000000002',
    }),
    refresh_token: 'refresh-fake-e2e',
    token_type: 'bearer',
    expires_in: 3_600,
    expires_at: expiresAt,
    user: {
      id: userId,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'offline@e2e.local',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: { nombre: 'Offline', apellido: 'E2E' },
      created_at: '2026-01-01T00:00:00.000Z',
    },
  }
}

const membresiaFabricada = {
  empresa_id: '00000000-0000-4000-8000-00000000000e',
  rol: 'dueno',
  empresa: { id: '00000000-0000-4000-8000-00000000000e', nombre: 'E2E Offline' },
}

/** Visita online (instala el SW y llena el precache) y espera a que quede activo. */
async function calentarServiceWorker(page: Page) {
  await page.goto('/')
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready
    if (!reg.active) throw new Error('service worker sin activar')
  })
}

test.describe('la web funciona sin señal (caso del campo)', () => {
  test('el shell carga offline: reload en /login sin red', async ({ browser }) => {
    const context = await browser.newContext({ viewport: MOVIL })
    const page = await context.newPage()

    await calentarServiceWorker(page)

    await context.setOffline(true)
    await page.reload()

    // Sin red, el SW sirve el shell → el login renderiza igual.
    await expect(page.getByLabel('Email')).toBeVisible()

    await context.close()
  })

  test('boot completo offline con sesión cacheada → Modo Campo usable', async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport: MOVIL })
    const page = await context.newPage()

    await calentarServiceWorker(page)
    await page.evaluate(
      ([authKey, sesion, membKey, memb]) => {
        localStorage.setItem(authKey as string, JSON.stringify(sesion))
        localStorage.setItem(membKey as string, JSON.stringify(memb))
      },
      [AUTH_KEY, sesionFabricada({ vencida: false }), MEMBRESIA_KEY, membresiaFabricada],
    )

    await context.setOffline(true)
    await page.goto('/')

    // Guard de empresa sin red → NO rebota a /onboarding: usa la última
    // membresía conocida y un móvil cae al Modo Campo.
    await expect(page).toHaveURL(/\/campo\//)
    await expect(page.getByRole('link', { name: 'Recorrida' })).toBeVisible()

    // La Recorrida (offline-first, Dexie) abre sin red.
    await page.getByRole('link', { name: 'Recorrida' }).click()
    await expect(page).toHaveURL(/\/campo\/recorrida/)

    await context.close()
  })

  test('smoke online: sin sesión el arranque redirige a /login', async ({
    browser,
  }) => {
    // Guarda contra regresiones del boot de auth (auth-context reescrito): con
    // red y sin sesión persistida, la app debe caer limpio en /login.
    const context = await browser.newContext({ viewport: MOVIL })
    const page = await context.newPage()

    await page.goto('/')
    await expect(page).toHaveURL(/\/login/)
    await expect(page.getByLabel('Email')).toBeVisible()

    await context.close()
  })

  test('token vencido sin red NO expulsa a /login', async ({ browser }) => {
    const context = await browser.newContext({ viewport: MOVIL })
    const page = await context.newPage()

    await calentarServiceWorker(page)
    await page.evaluate(
      ([authKey, sesion, membKey, memb]) => {
        localStorage.setItem(authKey as string, JSON.stringify(sesion))
        localStorage.setItem(membKey as string, JSON.stringify(memb))
      },
      [AUTH_KEY, sesionFabricada({ vencida: true }), MEMBRESIA_KEY, membresiaFabricada],
    )

    await context.setOffline(true)
    await page.goto('/')

    // El refresh del token falla por red → la sesión persistida vale igual
    // (RLS es la barrera real; las escrituras van al outbox).
    await expect(page).toHaveURL(/\/campo\//, { timeout: 20_000 })
    await expect(page.getByRole('link', { name: 'Recorrida' })).toBeVisible()

    await context.close()
  })
})
