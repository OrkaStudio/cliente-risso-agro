import { expect, type Page } from '@playwright/test'

export const EMAIL = process.env.E2E_EMAIL ?? ''
export const PASSWORD = process.env.E2E_PASSWORD ?? ''

/**
 * Entra con la cuenta de prueba (e2e@orkastudio.test, empresa "E2E Pruebas").
 * Nunca con la de un productor: los tests escriben datos.
 */
export async function entrar(page: Page) {
  await despejarGuia(page)
  expect(EMAIL, 'definir E2E_EMAIL (ver .env.e2e.local)').not.toBe('')
  expect(PASSWORD, 'definir E2E_PASSWORD (ver .env.e2e.local)').not.toBe('')
  await page.goto('/login')
  await page.locator('#email').fill(EMAIL)
  await page.locator('#password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Salir' })).toBeVisible()
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
