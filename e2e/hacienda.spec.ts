import { test, expect, type Page } from '@playwright/test'
import { entrar } from './helpers'

// RFID con prefijo E2E para poder limpiarlo después sin tocar datos reales.
const rfid = (sufijo = '') => `E2E${Date.now()}${sufijo}`

async function darDeAlta(page: Page, caravana: string) {
  await page.getByRole('link', { name: 'Hacienda', exact: true }).click()
  await page.getByRole('button', { name: 'Entraron', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: /Uno solo, con su caravana/ }).click()
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

/** Toca un potrero en el croquis del panel (o su botón, si el campo no está dibujado). */
async function tocarPotrero(page: Page, nombre: string) {
  const etiqueta = page.locator('.leaflet-tooltip', { hasText: new RegExp(`^${nombre}`) }).first()
  if (await etiqueta.count()) {
    const b = (await etiqueta.boundingBox())!
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2)
  } else {
    await page.getByRole('dialog').getByRole('button', { name: new RegExp(`^${nombre}`) }).first().click()
  }
}

test('salieron y entraron por cantidad, sin leer caravanas', async ({ page }) => {
  await entrar(page)
  await page.getByRole('link', { name: 'Hacienda', exact: true }).click()

  // Salieron · Los vendí: una vaca del 1A. Todas tienen caravana → queda para identificar.
  await page.getByRole('button', { name: 'Salieron', exact: true }).click()
  const panel = page.getByRole('dialog')
  await panel.getByRole('button', { name: /Los vendí/ }).click()
  await panel.getByRole('combobox', { name: 'Campo' }).selectOption({ label: 'E2E Campo base' })
  await tocarPotrero(page, '1A')
  await panel.getByRole('button', { name: 'Uno más: Vacas' }).click()
  await panel.getByRole('button', { name: /Revisar: 1 vaca/ }).click()
  await expect(panel.getByText(/pendiente de identificar/)).toBeVisible()
  await panel.getByRole('button', { name: 'Vender 1 vaca' }).click()
  await expect(panel.getByRole('heading', { name: 'Se vendió 1 vaca' })).toBeVisible()
  await expect(panel.getByText(/Decir cuáles fueron: 1 con caravana/)).toBeVisible()
  await panel.getByRole('button', { name: 'Listo' }).click()

  // Entraron · Nacieron: dos terneros en el 1A, sin caravana.
  await page.getByRole('button', { name: 'Entraron', exact: true }).click()
  await panel.getByRole('button', { name: /Nacieron/ }).click()
  await panel.getByRole('combobox', { name: 'Campo' }).selectOption({ label: 'E2E Campo base' })
  await tocarPotrero(page, '1A')
  await panel.getByRole('button', { name: 'Uno más: Terneros' }).click()
  await panel.getByRole('button', { name: 'Uno más: Terneros' }).click()
  await panel.getByRole('button', { name: /Revisar: 2 terneros/ }).click()
  await panel.getByRole('button', { name: 'Sumar 2 terneros' }).click()
  await expect(panel.getByRole('heading', { name: 'Sumamos 2 terneros nacidos' })).toBeVisible()
  await panel.getByRole('button', { name: 'Listo' }).click()
  await page.getByRole('tab', { name: /Sin caravana/ }).click()
  await expect(page.getByRole('row', { name: /Ternero/ }).first()).toBeVisible()
})

test('decir cuál salió y poner caravanas con una planilla', async ({ page }) => {
  await entrar(page)
  await page.getByRole('link', { name: 'Hacienda', exact: true }).click()
  const panel = page.getByRole('dialog')

  // Una venta por cantidad deja una vaca pendiente de identificar.
  await page.getByRole('button', { name: 'Salieron', exact: true }).click()
  await panel.getByRole('button', { name: /Los vendí/ }).click()
  await panel.getByRole('combobox', { name: 'Campo' }).selectOption({ label: 'E2E Campo base' })
  await tocarPotrero(page, '1A')
  await panel.getByRole('button', { name: 'Uno más: Vacas' }).click()
  await panel.getByRole('button', { name: /Revisar: 1 vaca/ }).click()
  await panel.getByRole('button', { name: 'Vender 1 vaca' }).click()
  await panel.getByRole('button', { name: 'Listo' }).click()

  // Decir cuál fue: se elige de la lista (cada una dice qué es), sin tipear números.
  await page.getByRole('button', { name: 'Decir cuáles' }).click()
  await panel.locator('button[aria-pressed]').first().click()
  await expect(panel.getByText(/^1 de \d+\./)).toBeVisible()
  await panel.getByRole('button', { name: /^Identificar 1/ }).click()
  await expect(panel).toBeHidden()

  // La planilla: una caravana para un ternero sin caravana del 1A.
  const n = String(Date.now()).slice(-6)
  await page.getByRole('button', { name: 'Caravanas por Excel' }).click()
  await panel.locator('input[type=file]').setInputFiles({
    name: 'caravanas.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(`Caravana visible;Categoría;Potrero;Electrónica\n${n};Ternero;1A;032${n}${n}\n`),
  })
  await expect(panel.getByRole('heading', { name: 'Leímos 1 fila' })).toBeVisible()
  await panel.getByRole('button', { name: 'Ponerle caravana a 1' }).click()
  await expect(panel.getByRole('heading', { name: 'Listo: 1 caravana puesta' })).toBeVisible()
  await panel.getByRole('button', { name: 'Listo' }).click()
  await page.getByPlaceholder('Buscá una caravana').fill(n)
  await expect(page.getByRole('row', { name: new RegExp(n) })).toContainText('Ternero')
})
