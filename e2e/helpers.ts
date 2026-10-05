import { expect, type Page } from '@playwright/test'

/**
 * Cuenta de prueba de la base local (supabase/seed.sql): empresa «E2E Pruebas».
 * Entra con el celular y el código fijo de [auth.sms.test_otp] (sólo local).
 * Nunca con la de un productor: los tests escriben datos.
 */
export const CELULAR_E2E = '2240000001'
export const CODIGO_E2E = '123456'

/** Entra como lo hace la gente: celular → «Mandame el código» → el código. */
export async function entrar(page: Page) {
  await despejarGuia(page)
  await page.goto('/login')
  await page.getByLabel('Tu celular, el que tiene WhatsApp').fill(CELULAR_E2E)
  await page.getByRole('button', { name: 'Mandame el código' }).click()
  await page.waitForURL('**/login/codigo')
  // Con 6 números entra solo.
  await page.locator('#codigo').fill(CODIGO_E2E)
  await expect(page.getByRole('button', { name: 'Salir' })).toBeVisible()
}

/** Supabase local (supabase start) y su clave pública por defecto. */
const SUPABASE_LOCAL = 'http://127.0.0.1:54321'
const CLAVE_PUBLICA_LOCAL = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH'
/** Clave con la que supabase-js guarda la sesión: sale del host (127.0.0.1). */
export const AUTH_KEY_LOCAL = 'sb-127-auth-token'

/**
 * Una sesión REAL de la cuenta de prueba, pedida directo a Supabase local con
 * el código fijo. Para los tests que arrancan ya adentro (manga, sin señal) y
 * no necesitan pasar por la pantalla de entrar.
 */
export async function sesionDePrueba(): Promise<Record<string, unknown>> {
  const celular = `+549${CELULAR_E2E}`
  const pedir = (ruta: string, cuerpo: unknown) =>
    fetch(`${SUPABASE_LOCAL}/auth/v1/${ruta}`, {
      method: 'POST',
      headers: { apikey: CLAVE_PUBLICA_LOCAL, 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
    })
  await pedir('otp', { phone: celular, create_user: false })
  const r = await pedir('verify', { type: 'sms', phone: celular, token: CODIGO_E2E })
  const sesion = (await r.json()) as Record<string, unknown>
  if (!sesion.access_token) throw new Error(`no hubo sesión de prueba: ${JSON.stringify(sesion)}`)
  return sesion
}

/** La bienvenida del asistente aparece una vez por usuario y puede llegar
 *  segundos después del login: se cierra sola cuando se interponga. */
export async function despejarGuia(page: Page) {
  await page.addLocatorHandler(page.getByRole('dialog', { name: 'Asistente' }), async (d) => {
    await d.getByRole('button', { name: 'Después' }).click()
  })
  // "Tu campo, en marcha" desplegado tapa el botón principal de la página
  // (p. ej. "+ Nuevo animal") mientras la puesta a punto no está completa.
  // Plegado en pastilla no tapa nada.
  await page.addLocatorHandler(page.getByTitle('Achicar'), async (b) => {
    await b.click()
  })
}

/** Elige una opción en un Dropdown propio (botón con aria-label + listbox). */
export async function elegir(page: Page, desplegable: string, opcion: string | RegExp) {
  await page.getByRole('button', { name: desplegable, exact: true }).click()
  await page.getByRole('listbox').getByRole('button', { name: opcion }).first().click()
  await expect(page.getByRole('listbox')).toBeHidden()
}
