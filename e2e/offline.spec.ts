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
    // membresía conocida y un móvil cae al Modo Campo. El landing por estado
    // (commit 7d78253) manda al hub `/campo` pelado, no a una sub-ruta.
    await expect(page).toHaveURL(/\/campo(?:\/|$)/)
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
    // (RLS es la barrera real; las escrituras van al outbox). Aterriza en el
    // hub `/campo` pelado (landing por estado), no en una sub-ruta.
    await expect(page).toHaveURL(/\/campo(?:\/|$)/, { timeout: 20_000 })
    await expect(page.getByRole('link', { name: 'Recorrida' })).toBeVisible()

    await context.close()
  })

  test('lo cargado en Plata sube desde el Inicio, sin abrir Plata', async ({
    browser,
  }) => {
    /* El drenado estaba atado a la pantalla de cada feature: la cola de Plata
     * sólo subía si el productor entraba a Plata. Volvía del campo, abría la
     * app —que cae en Inicio—, veía "Listo" y el gasto seguía en el teléfono.
     * Este test fija el contrato del drenado central: alcanza con abrir la app.
     */
    const context = await browser.newContext({ viewport: MOVIL })
    const page = await context.newPage()

    const insertados: string[] = []
    /* OJO con el orden: `route` matchea en orden INVERSO de registro, así que el
     * genérico va PRIMERO y el específico al final — si no, el genérico se come
     * el POST que este test necesita observar (lección route-gotchas #1). */
    await context.route(/supabase\.co\/(rest|auth|storage)\//, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: '[]',
      }),
    )
    /* Sin membresía el guard manda a /onboarding y el shell del campo nunca
     * monta — por lo tanto nunca drena. `maybeSingle()` espera un objeto. */
    await context.route(/supabase\.co\/rest\/v1\/miembro_empresa/, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify(membresiaFabricada),
      }),
    )
    await context.route(/supabase\.co\/rest\/v1\/movimiento_financiero/, (route) => {
      if (route.request().method() === 'POST') insertados.push(route.request().url())
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: '[]',
      })
    })

    await calentarServiceWorker(page)
    await page.evaluate(
      ([authKey, sesion, membKey, memb]) => {
        localStorage.setItem(authKey as string, JSON.stringify(sesion))
        localStorage.setItem(membKey as string, JSON.stringify(memb))
      },
      [AUTH_KEY, sesionFabricada({ vencida: false }), MEMBRESIA_KEY, membresiaFabricada],
    )

    /* Dexie crea el esquema recién cuando la app abre esa feature: se pasa una
     * vez por Plata (con la cola VACÍA, así que no sube nada) y se sale. A
     * partir de acá la pantalla de Plata queda desmontada. */
    await page.goto('/campo/plata')
    await page.waitForTimeout(1500)
    await page.goto('/campo')

    // Un gasto pendiente en la cola, como si lo hubiera cargado sin señal.
    await page.evaluate(async () => {
      const abrir = () =>
        new Promise<IDBDatabase>((resolve, reject) => {
          const req = indexedDB.open('risso-plata')
          req.onsuccess = () => resolve(req.result)
          req.onerror = () => reject(req.error)
        })
      const db = await abrir()
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('outbox', 'readwrite')
        tx.objectStore('outbox').put({
          id: '00000000-0000-4000-8000-0000000000aa',
          empresa_id: '00000000-0000-4000-8000-000000000003',
          campo_id: '00000000-0000-4000-8000-000000000004',
          tipo: 'gasto',
          monto: 1234,
          categoria_id: '00000000-0000-4000-8000-000000000005',
          categoria_nombre: 'Gasoil',
          fecha: '2026-08-31',
          descripcion: null,
          medio_pago: 'efectivo',
          audio: null,
          audio_path: null,
          audio_subido: 0,
          foto: null,
          foto_subida: 0,
          estado: 'pendiente',
          error: null,
          created_at: Date.now(),
        })
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
    })

    // Se reabre el INICIO: el ciclo del shell corre de nuevo y tiene que
    // drenar, con la pantalla de Plata desmontada.
    await page.goto('/campo')
    await expect.poll(() => insertados.length, { timeout: 20_000 }).toBeGreaterThan(0)
    expect(page.url()).not.toContain('/campo/plata')

    await context.close()
  })
})
