import { test, expect, type Page } from '@playwright/test'
import { elegir, entrar } from './helpers'

// RFID con prefijo E2E para poder limpiarlo después sin tocar datos reales.
const rfid = (sufijo = '') => `E2E${Date.now()}${sufijo}`

async function darDeAlta(page: Page, caravana: string) {
  await page.getByRole('link', { name: 'Hacienda', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Hacienda', level: 1 })).toBeVisible()
  await page.getByRole('button', { name: '+ Nuevo animal' }).click()
  const alta = page.getByRole('dialog', { name: 'Nuevo animal' })
  await alta.getByLabel('Caravana (RFID) *').fill(caravana)
  await elegir(page, 'Categoría', 'Vaca')
  await elegir(page, 'Potrero', /1A/)
  await alta.getByRole('button', { name: 'Dar de alta' }).click()
  await expect(alta).toBeHidden()
}

test('golden path Hacienda: login → alta → stock → ficha', async ({ page }) => {
  const caravana = rfid()
  await entrar(page)
  await darDeAlta(page, caravana)

  // Stock: la fila del animal, con su potrero
  const fila = page.getByRole('row', { name: new RegExp(caravana) })
  await expect(fila).toBeVisible()
  await expect(fila.getByRole('link', { name: '1A' })).toBeVisible()

  // Ficha: la caravana y el alta en el historial
  await fila.getByRole('link', { name: 'Ver ficha' }).click()
  await expect(page).toHaveURL(/\/hacienda\/[0-9a-f-]{36}$/)
  await expect(page.getByRole('heading', { name: caravana, level: 1 })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Historial' })).toBeVisible()
  await expect(page.getByText('Alta', { exact: true })).toBeVisible()
})

test('acciones del animal: registrar evento → cambiar caravana → dar de baja', async ({
  page,
}) => {
  const caravanaA = rfid('A')
  const caravanaB = caravanaA.replace(/A$/, 'B')
  await entrar(page)
  await darDeAlta(page, caravanaA)
  await page
    .getByRole('row', { name: new RegExp(caravanaA) })
    .getByRole('link', { name: 'Ver ficha' })
    .click()
  await expect(page.getByRole('heading', { name: caravanaA, level: 1 })).toBeVisible()

  // Registrar evento (sanidad)
  await page.getByRole('button', { name: 'Registrar evento' }).click()
  const evento = page.getByRole('dialog', { name: 'Registrar evento' })
  await elegir(page, 'Tipo de evento', 'Sanidad')
  await evento.getByRole('button', { name: 'Registrar', exact: true }).click()
  await expect(evento).toBeHidden()
  await expect(page.getByText('Sanidad', { exact: true })).toBeVisible()

  // Cambiar caravana
  await page.getByRole('button', { name: 'Cambiar caravana' }).click()
  const cambio = page.getByRole('dialog', { name: 'Cambiar caravana' })
  await cambio.getByLabel('Nueva caravana (RFID)').fill(caravanaB)
  await cambio.getByRole('button', { name: 'Confirmar cambio' }).click()
  await expect(cambio).toBeHidden()
  await expect(page.getByRole('heading', { name: caravanaB, level: 1 })).toBeVisible()

  // Dar de baja
  await page.getByRole('button', { name: 'Dar de baja' }).click()
  const baja = page.getByRole('dialog', { name: 'Dar de baja' })
  await elegir(page, 'Motivo de baja', /vend/i)
  await baja.getByRole('button', { name: 'Confirmar baja' }).click()
  await expect(baja).toBeHidden()
  await expect(page.getByText('Activo', { exact: true })).toBeHidden()
})
