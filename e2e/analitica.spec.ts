import { test, expect } from '@playwright/test'
import { elegir, entrar } from './helpers'

test('plata: anotar un gasto, verlo en los movimientos y buscarlo', async ({ page }) => {
  const desc = `E2E gasto ${Date.now()}`
  await entrar(page)

  await page.getByRole('link', { name: 'Plata', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Lo que viene' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'En qué se va' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Qué rinde' })).toBeVisible()

  await page.getByRole('button', { name: 'Anotar un gasto' }).click()
  const carga = page.getByRole('dialog', { name: 'Cargar' })

  // Paso 1: gasto único
  await carga.getByRole('button', { name: 'Gasto', exact: true }).click()
  await carga.getByRole('button', { name: 'Único', exact: true }).click()
  await carga.getByRole('button', { name: 'Siguiente' }).click()

  // Paso 2: monto, ya pagado hoy
  await carga.getByRole('textbox', { name: 'Monto' }).fill('12345')
  await carga.getByRole('button', { name: 'Ya se pagó' }).click()
  await carga.getByRole('button', { name: 'Siguiente' }).click()

  // Paso 3: de qué
  await carga.getByRole('textbox', { name: 'Descripción' }).fill(desc)
  await elegir(page, 'Categoría', 'Combustible')
  await elegir(page, 'Campo', 'E2E Campo base')
  await carga.getByRole('button', { name: 'Cargar', exact: true }).click()
  await expect(carga).toBeHidden()

  // En los movimientos del mes, y se encuentra buscándolo.
  await page.getByRole('link', { name: 'Ver los movimientos' }).click()
  await page.getByRole('textbox', { name: 'Buscar un movimiento' }).fill(desc)
  await expect(page.getByText(desc)).toBeVisible()
  await expect(page.getByText('−$12.345')).toBeVisible()
})
