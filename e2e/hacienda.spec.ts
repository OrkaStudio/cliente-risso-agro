import { test, expect, type Page } from '@playwright/test'
import { entrar } from './helpers'

// RFID con prefijo E2E para poder limpiarlo después sin tocar datos reales.
const rfid = (sufijo = '') => `E2E${Date.now()}${sufijo}`

async function darDeAlta(page: Page, caravana: string) {
  await page.getByRole('link', { name: 'Hacienda', exact: true }).click()
  await page.getByRole('button', { name: 'Un animal nuevo' }).click()
  const alta = page.getByRole('dialog', { name: 'Un animal nuevo' })
  await alta.getByLabel('Caravana electrónica').fill(caravana)
  await alta.getByRole('button', { name: 'Vaca', exact: true }).click()
  await alta.getByRole('button', { name: '1A', exact: true }).first().click()
  await alta.getByRole('button', { name: 'Sumar al rodeo' }).click()
  await expect(alta).toBeHidden()
  // El rodeo es largo: se busca por la caravana, como lo haría el productor.
  await page.getByPlaceholder('Buscá una caravana').fill(caravana)
}

test('golden path Hacienda: login → alta → stock → ficha', async ({ page }) => {
  const caravana = rfid()
  await entrar(page)
  await darDeAlta(page, caravana)

  // Stock: la fila del animal, con su potrero
  const fila = page.getByRole('row', { name: new RegExp(caravana) })
  await expect(fila).toBeVisible()
  await expect(fila).toContainText('1A')

  // Ficha: la caravana y el alta en el historial
  await fila.getByRole('link').click()
  await expect(page).toHaveURL(/\/hacienda\/[0-9a-f-]{36}$/)
  await expect(page.getByRole('heading', { name: 'Vaca', level: 1 })).toBeVisible()
  await expect(page.getByText(caravana, { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: /Su historia/ })).toBeVisible()
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
    .getByRole('link')
    .click()
  await expect(page.getByText(caravanaA, { exact: true })).toBeVisible()

  // Anotarle algo (sanidad)
  await page.getByRole('button', { name: 'Anotarle algo' }).click()
  const evento = page.getByRole('dialog', { name: /Qué le pasó/ })
  await evento.getByRole('button', { name: 'Aftosa' }).click()
  await evento.getByRole('button', { name: 'Anotar la sanidad' }).click()
  await expect(evento).toBeHidden()
  await expect(page.getByText('Sanidad', { exact: true })).toBeVisible()

  // Se movió: cambia el potrero de verdad (no sólo deja una nota)
  await page.getByRole('button', { name: 'Anotarle algo' }).click()
  const mov = page.getByRole('dialog', { name: /Qué le pasó/ })
  await mov.getByRole('radio', { name: 'Se movió' }).click()
  const destino = mov.getByRole('group', { name: 'A qué potrero fue' }).getByRole('button').first()
  const nombreDestino = (await destino.textContent())!.trim()
  await destino.click()
  await mov.getByRole('button', { name: `Moverlo al ${nombreDestino}` }).click()
  await expect(mov).toBeHidden()
  await expect(page.getByRole('navigation', { name: 'Dónde estás' })).toContainText(nombreDestino)
  await expect(page.getByText('Movimiento', { exact: true })).toBeVisible()

  // Cambiar caravana
  await page.getByRole('button', { name: 'Cambiar caravana' }).click()
  const cambio = page.getByRole('dialog', { name: 'Otra caravana para este animal' })
  await cambio.getByLabel('La electrónica nueva').fill(caravanaB)
  await cambio.getByRole('button', { name: 'Guardar la caravana nueva' }).click()
  await expect(cambio).toBeHidden()
  await expect(page.getByText(caravanaB, { exact: true })).toBeVisible()

  // Dar de baja
  await page.getByRole('button', { name: 'Dar de baja' }).click()
  const baja = page.getByRole('dialog', { name: /^Sale el/ })
  await baja.getByRole('radio', { name: 'Se vendió' }).click()
  await baja.getByRole('button', { name: 'Anotar la venta' }).click()
  await expect(baja).toBeHidden()
  await expect(page.getByText('Vendido', { exact: true })).toBeVisible()
})
